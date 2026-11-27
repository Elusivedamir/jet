package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func (s *Store) InboxAfter(ctx context.Context, accountID, conversationID string, after int64, limit int) ([]Message, error) {
	if accountID == "" || conversationID == "" || after < 0 || limit < 1 || limit > 100 {
		return nil, ErrInvalidRequest
	}
	var member bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2)
	`, conversationID, accountID).Scan(&member); err != nil {
		return nil, fmt.Errorf("check inbox membership: %w", err)
	}
	if !member {
		return nil, ErrNotMember
	}
	rows, err := s.pool.Query(ctx, `
		SELECT m.id, m.conversation_id, m.sender_id, m.operation_key, m.payload, m.position
		FROM recipient_inbox i
		JOIN messages m ON m.id=i.message_id
		WHERE i.recipient_id=$1 AND i.conversation_id=$2 AND i.position>$3
		ORDER BY i.position LIMIT $4
	`, accountID, conversationID, after, limit)
	if err != nil {
		return nil, fmt.Errorf("read recipient inbox: %w", err)
	}
	defer rows.Close()
	result := make([]Message, 0)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.OperationKey, &m.Payload, &m.Position); err != nil {
			return nil, fmt.Errorf("scan recipient inbox: %w", err)
		}
		result = append(result, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recipient inbox: %w", err)
	}
	return result, nil
}

func (s *Store) Acknowledge(ctx context.Context, accountID, messageID string) error {
	if accountID == "" || messageID == "" {
		return ErrInvalidRequest
	}
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO delivery_receipts (message_id, recipient_id)
		SELECT message_id, recipient_id FROM recipient_inbox
		WHERE message_id=$1 AND recipient_id=$2
		ON CONFLICT (message_id, recipient_id) DO NOTHING
	`, messageID, accountID)
	if err != nil {
		return fmt.Errorf("persist delivery acknowledgement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		if err := s.pool.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM delivery_receipts WHERE message_id=$1 AND recipient_id=$2)
		`, messageID, accountID).Scan(&exists); err != nil {
			return fmt.Errorf("check acknowledgement: %w", err)
		}
		if !exists {
			return ErrNotMember
		}
	}
	return nil
}

func (s *Store) IsAcknowledged(ctx context.Context, accountID, messageID string) (bool, error) {
	var acknowledged bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM delivery_receipts WHERE recipient_id=$1 AND message_id=$2)
	`, accountID, messageID).Scan(&acknowledged)
	if err != nil {
		return false, fmt.Errorf("read delivery receipt: %w", err)
	}
	return acknowledged, nil
}

var _ = pgx.ErrNoRows
