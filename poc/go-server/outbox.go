package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

type ClaimedDelivery struct {
	ID           int64
	MessageID    string
	RecipientID  string
	LeaseToken   string
	AttemptCount int
}

func (s *Store) ClaimOutbox(ctx context.Context, batchSize int, lease time.Duration) ([]ClaimedDelivery, error) {
	if batchSize < 1 || batchSize > 100 || lease < time.Second {
		return nil, ErrInvalidRequest
	}
	token, err := newID()
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		WITH candidates AS (
			SELECT id FROM delivery_outbox
			WHERE available_at <= now()
			  AND (state IN ('pending', 'retry_wait')
			       OR (state = 'processing' AND lease_until < now()))
			ORDER BY id
			FOR UPDATE SKIP LOCKED
			LIMIT $1
		)
		UPDATE delivery_outbox AS o
		SET state='processing', attempt_count=o.attempt_count+1,
		    lease_until=now()+($2 * interval '1 millisecond'),
		    lease_token=$3, last_error=NULL
		FROM candidates
		WHERE o.id=candidates.id
		RETURNING o.id, o.message_id, o.recipient_id, o.lease_token, o.attempt_count
	`, batchSize, lease.Milliseconds(), token)
	if err != nil {
		return nil, fmt.Errorf("claim outbox: %w", err)
	}
	defer rows.Close()
	result := make([]ClaimedDelivery, 0)
	for rows.Next() {
		var item ClaimedDelivery
		if err := rows.Scan(&item.ID, &item.MessageID, &item.RecipientID, &item.LeaseToken, &item.AttemptCount); err != nil {
			return nil, fmt.Errorf("scan claimed outbox: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate claimed outbox: %w", err)
	}
	return result, nil
}

// Dispatch persists an idempotent recipient inbox record before marking the
// outbox complete. The lease token fences stale workers from completing work
// after another worker has reclaimed an expired lease.
func (s *Store) Dispatch(ctx context.Context, item ClaimedDelivery) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin dispatch transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var conversationID string
	var position int64
	err = tx.QueryRow(ctx, `
		SELECT conversation_id, position FROM messages WHERE id=$1
	`, item.MessageID).Scan(&conversationID, &position)
	if err != nil {
		return fmt.Errorf("load dispatch message: %w", err)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO recipient_inbox (message_id, recipient_id, conversation_id, position)
		VALUES ($1,$2,$3,$4) ON CONFLICT (message_id, recipient_id) DO NOTHING
	`, item.MessageID, item.RecipientID, conversationID, position)
	if err != nil {
		return fmt.Errorf("persist recipient inbox: %w", err)
	}
	tag, err := tx.Exec(ctx, `
		UPDATE delivery_outbox
		SET state='completed', completed_at=now(), lease_until=NULL, lease_token=NULL
		WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_until > clock_timestamp()
	`, item.ID, item.LeaseToken)
	if err != nil {
		return fmt.Errorf("complete outbox item: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("outbox lease lost for item %d", item.ID)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit dispatch: %w", err)
	}
	return nil
}

func (s *Store) RetryOutbox(ctx context.Context, item ClaimedDelivery, cause error) error {
	state := "retry_wait"
	delay := time.Second << min(item.AttemptCount, 8)
	if item.AttemptCount >= 8 {
		state = "terminal_failure"
		delay = 0
	}
	message := "dispatch failed"
	if cause != nil {
		message = cause.Error()
		if len(message) > 500 {
			message = message[:500]
		}
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE delivery_outbox
		SET state=$3, available_at=now()+($4 * interval '1 millisecond'),
		    lease_until=NULL, lease_token=NULL, last_error=$5
		WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_until > clock_timestamp()
	`, item.ID, item.LeaseToken, state, delay.Milliseconds(), message)
	if err != nil {
		return fmt.Errorf("schedule outbox retry: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("outbox lease lost while retrying item %d", item.ID)
	}
	return nil
}

// RunOutboxWorker claims durable batches and dispatches each batch with a
// strict concurrency bound. A batch is fully drained before the next claim,
// so the worker never accumulates an unbounded in-memory queue.
func RunOutboxWorker(ctx context.Context, store *Store, poll time.Duration, concurrency int) {
	if concurrency < 1 || concurrency > 16 {
		panic("outbox worker concurrency must be between 1 and 16")
	}
	ticker := time.NewTicker(poll)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// A full batch means the queue is still backlogged: claim the next
			// batch immediately after this one completes. The poll interval is
			// only the idle wait after an empty/partial batch or DB error.
			for {
				items, err := store.ClaimOutbox(ctx, 20, 15*time.Second)
				if err != nil || len(items) == 0 {
					break
				}
				sem := make(chan struct{}, concurrency)
				var workers sync.WaitGroup
				for _, item := range items {
					select {
					case sem <- struct{}{}:
						workers.Add(1)
						go func(delivery ClaimedDelivery) {
							defer workers.Done()
							defer func() { <-sem }()
							if err := store.Dispatch(ctx, delivery); err != nil {
								_ = store.RetryOutbox(ctx, delivery, err)
							}
						}(item)
					case <-ctx.Done():
						// Remaining committed claims are safely recovered after lease expiry.
						break
					}
					if ctx.Err() != nil {
						break
					}
				}
				workers.Wait()
				if ctx.Err() != nil || len(items) < 20 {
					break
				}
			}
		}
	}
}
