package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrConflict       = errors.New("operation key conflicts with an earlier submission")
	ErrNotMember      = errors.New("account is not a conversation member")
	ErrInvalidRequest = errors.New("invalid message request")
)

type Message struct {
	ID             string `json:"message_id"`
	ConversationID string `json:"conversation_id"`
	SenderID       string `json:"sender_id"`
	OperationKey   string `json:"operation_key"`
	Payload        string `json:"payload"`
	Position       int64  `json:"position"`
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func newID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("generate message id: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

// Send commits the logical message and all recipient delivery intents atomically.
// The account-scoped advisory transaction lock makes concurrent retries of one
// operation key serialize before checking the idempotency record.
func (s *Store) Send(ctx context.Context, senderID, conversationID, operationKey, payload string) (Message, error) {
	if senderID == "" || conversationID == "" || operationKey == "" || payload == "" {
		return Message{}, ErrInvalidRequest
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return Message{}, fmt.Errorf("begin message transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	lockKey := senderID + ":" + operationKey
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", lockKey); err != nil {
		return Message{}, fmt.Errorf("lock idempotency key: %w", err)
	}

	// Re-check current membership even for an idempotent retry. Revoked members
	// must not use a previous operation key to read conversation data.
	var member bool
	if err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM conversation_members
			WHERE conversation_id = $1 AND account_id = $2
		)
	`, conversationID, senderID).Scan(&member); err != nil {
		return Message{}, fmt.Errorf("check conversation membership: %w", err)
	}
	if !member {
		return Message{}, ErrNotMember
	}

	var existing Message
	err = tx.QueryRow(ctx, `
		SELECT id, conversation_id, sender_id, operation_key, payload, position
		FROM messages WHERE sender_id = $1 AND operation_key = $2
	`, senderID, operationKey).Scan(
		&existing.ID, &existing.ConversationID, &existing.SenderID,
		&existing.OperationKey, &existing.Payload, &existing.Position,
	)
	if err == nil {
		if existing.ConversationID != conversationID || existing.Payload != payload {
			return Message{}, ErrConflict
		}
		if err = tx.Commit(ctx); err != nil {
			return Message{}, fmt.Errorf("finish idempotent retry: %w", err)
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Message{}, fmt.Errorf("read idempotency record: %w", err)
	}

	var position int64
	err = tx.QueryRow(ctx, `
		INSERT INTO conversation_counters (conversation_id, last_position)
		VALUES ($1, 1)
		ON CONFLICT (conversation_id)
		DO UPDATE SET last_position = conversation_counters.last_position + 1
		RETURNING last_position
	`, conversationID).Scan(&position)
	if err != nil {
		return Message{}, fmt.Errorf("allocate conversation position: %w", err)
	}

	id, err := newID()
	if err != nil {
		return Message{}, err
	}
	message := Message{
		ID: id, ConversationID: conversationID, SenderID: senderID,
		OperationKey: operationKey, Payload: payload, Position: position,
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO messages (id, conversation_id, sender_id, operation_key, payload, position)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, message.ID, message.ConversationID, message.SenderID,
		message.OperationKey, message.Payload, message.Position)
	if err != nil {
		return Message{}, fmt.Errorf("insert message: %w", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT account_id FROM conversation_members
		WHERE conversation_id = $1 AND account_id <> $2
		ORDER BY account_id
	`, conversationID, senderID)
	if err != nil {
		return Message{}, fmt.Errorf("list recipients: %w", err)
	}
	var recipients []string
	for rows.Next() {
		var recipient string
		if err = rows.Scan(&recipient); err != nil {
			rows.Close()
			return Message{}, fmt.Errorf("read recipient: %w", err)
		}
		recipients = append(recipients, recipient)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return Message{}, fmt.Errorf("iterate recipients: %w", err)
	}
	if len(recipients) != 1 {
		return Message{}, fmt.Errorf("%w: PoC supports exactly one recipient", ErrInvalidRequest)
	}
	for _, recipient := range recipients {
		if _, err = tx.Exec(ctx, `
			INSERT INTO delivery_outbox (message_id, recipient_id) VALUES ($1, $2)
		`, message.ID, recipient); err != nil {
			return Message{}, fmt.Errorf("insert delivery intent: %w", err)
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return Message{}, fmt.Errorf("commit message and delivery intent: %w", err)
	}
	return message, nil
}

func (s *Store) History(ctx context.Context, accountID, conversationID string, after int64, limit int) ([]Message, error) {
	if accountID == "" || conversationID == "" || after < 0 || limit < 1 || limit > 100 {
		return nil, ErrInvalidRequest
	}
	var member bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2)
	`, conversationID, accountID).Scan(&member); err != nil {
		return nil, fmt.Errorf("check history membership: %w", err)
	}
	if !member {
		return nil, ErrNotMember
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, conversation_id, sender_id, operation_key, payload, position
		FROM messages WHERE conversation_id=$1 AND position>$2
		ORDER BY position LIMIT $3
	`, conversationID, after, limit)
	if err != nil {
		return nil, fmt.Errorf("read message history: %w", err)
	}
	defer rows.Close()
	result := make([]Message, 0)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.OperationKey, &m.Payload, &m.Position); err != nil {
			return nil, fmt.Errorf("scan history message: %w", err)
		}
		result = append(result, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate history: %w", err)
	}
	return result, nil
}
