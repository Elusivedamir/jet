package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; PostgreSQL integration tests skipped")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	schema, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	if err := applySchema(ctx, pool, string(schema)); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		"TRUNCATE delivery_outbox, messages, conversation_counters, conversation_members, conversations CASCADE",
		"INSERT INTO conversations (id) VALUES ('room-a'), ('room-b')",
		"INSERT INTO conversation_members (conversation_id, account_id) VALUES ('room-a','alice'), ('room-a','bob'), ('room-b','alice'), ('room-b','carol')",
	} {
		if _, err := pool.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	return NewStore(pool)
}

func TestSendIsIdempotentAndOutboxIsAtomic(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	first, err := store.Send(ctx, "alice", "room-a", "op-1", "hello")
	if err != nil {
		t.Fatal(err)
	}
	retry, err := store.Send(ctx, "alice", "room-a", "op-1", "hello")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != retry.ID || first.Position != retry.Position {
		t.Fatalf("retry changed identity: first=%+v retry=%+v", first, retry)
	}
	var messages, outbox int
	if err := store.pool.QueryRow(ctx, "SELECT count(*) FROM messages").Scan(&messages); err != nil {
		t.Fatal(err)
	}
	if err := store.pool.QueryRow(ctx, "SELECT count(*) FROM delivery_outbox").Scan(&outbox); err != nil {
		t.Fatal(err)
	}
	if messages != 1 || outbox != 1 {
		t.Fatalf("want 1 message and 1 recipient outbox row, got messages=%d outbox=%d", messages, outbox)
	}
}

func TestOperationKeyCannotChangeConversationOrPayload(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	if _, err := store.Send(ctx, "alice", "room-a", "op-2", "hello"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Send(ctx, "alice", "room-a", "op-2", "changed"); err != ErrConflict {
		t.Fatalf("want ErrConflict for changed payload, got %v", err)
	}
	if _, err := store.Send(ctx, "alice", "room-b", "op-2", "hello"); err != ErrConflict {
		t.Fatalf("want ErrConflict for changed conversation, got %v", err)
	}
	var count int
	if err := store.pool.QueryRow(ctx, "SELECT count(*) FROM messages").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("conflicting retry created another message: %d", count)
	}
}

func TestSameOperationKeyHasIndependentSenderScope(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	a, err := store.Send(ctx, "alice", "room-a", "shared-op", "from alice")
	if err != nil {
		t.Fatal(err)
	}
	b, err := store.Send(ctx, "bob", "room-a", "shared-op", "from bob")
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == b.ID {
		t.Fatal("different senders unexpectedly shared a message")
	}
}

func TestConcurrentRetriesCreateOneLogicalMessage(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	const workers = 12
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	ids := make(chan string, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			message, err := store.Send(ctx, "alice", "room-a", "parallel-op", "same")
			if err != nil {
				errs <- err
				return
			}
			ids <- message.ID
		}()
	}
	wg.Wait()
	close(errs)
	close(ids)
	for err := range errs {
		t.Fatal(err)
	}
	var expected string
	for id := range ids {
		if expected == "" {
			expected = id
		} else if id != expected {
			t.Fatalf("concurrent retry returned multiple IDs: %s vs %s", expected, id)
		}
	}
	var count int
	if err := store.pool.QueryRow(ctx, "SELECT count(*) FROM messages").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("want one message after concurrent retry, got %d", count)
	}
}

func TestHistoryIsConversationMemberScoped(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	if _, err := store.Send(ctx, "alice", "room-a", "history-op", "private"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.History(ctx, "mallory", "room-a", 0, 50); err != ErrNotMember {
		t.Fatalf("want ErrNotMember for unrelated account, got %v", err)
	}
	messages, err := store.History(ctx, "bob", "room-a", 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Payload != "private" {
		t.Fatalf("authorized member did not receive expected history: %+v", messages)
	}
}

func TestOutboxDispatchIsDurableAndAcknowledgementIsRecipientScoped(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	message, err := store.Send(ctx, "alice", "room-a", "dispatch-op", "durable")
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := store.ClaimOutbox(ctx, 10, time.Second)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("claim: items=%d err=%v", len(claimed), err)
	}
	if err := store.Dispatch(ctx, claimed[0]); err != nil {
		t.Fatal(err)
	}
	inbox, err := store.InboxAfter(ctx, "bob", "room-a", 0, 10)
	if err != nil || len(inbox) != 1 || inbox[0].ID != message.ID {
		t.Fatalf("inbox: messages=%+v err=%v", inbox, err)
	}
	if err := store.Acknowledge(ctx, "mallory", message.ID); err != ErrNotMember {
		t.Fatalf("unrelated account ack should be forbidden, got %v", err)
	}
	if err := store.Acknowledge(ctx, "bob", message.ID); err != nil {
		t.Fatal(err)
	}
	ack, err := store.IsAcknowledged(ctx, "bob", message.ID)
	if err != nil || !ack {
		t.Fatalf("acknowledgement not persisted: ack=%v err=%v", ack, err)
	}
}

func TestOutboxLeaseFencesStaleWorker(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	if _, err := store.Send(ctx, "alice", "room-a", "lease-op", "fenced"); err != nil {
		t.Fatal(err)
	}
	first, err := store.ClaimOutbox(ctx, 1, time.Second)
	if err != nil || len(first) != 1 {
		t.Fatalf("first claim: items=%d err=%v", len(first), err)
	}
	if _, err := store.pool.Exec(ctx, "UPDATE delivery_outbox SET lease_until=now()-interval '1 second' WHERE id=$1", first[0].ID); err != nil {
		t.Fatal(err)
	}
	second, err := store.ClaimOutbox(ctx, 1, time.Second)
	if err != nil || len(second) != 1 {
		t.Fatalf("reclaim: items=%d err=%v", len(second), err)
	}
	if first[0].LeaseToken == second[0].LeaseToken {
		t.Fatal("reclaimed lease reused the old fencing token")
	}
	if err := store.Dispatch(ctx, first[0]); err == nil {
		t.Fatal("stale worker unexpectedly completed reclaimed work")
	}
	var inboxCount int
	if err := store.pool.QueryRow(ctx, "SELECT count(*) FROM recipient_inbox").Scan(&inboxCount); err != nil {
		t.Fatal(err)
	}
	if inboxCount != 0 {
		t.Fatalf("stale dispatch leaked inbox record: %d", inboxCount)
	}
	if err := store.Dispatch(ctx, second[0]); err != nil {
		t.Fatal(err)
	}
}

func TestOutboxFailureSchedulesRetry(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	if _, err := store.Send(ctx, "alice", "room-a", "retry-op", "retry"); err != nil {
		t.Fatal(err)
	}
	items, err := store.ClaimOutbox(ctx, 1, time.Second)
	if err != nil || len(items) != 1 {
		t.Fatalf("claim: items=%d err=%v", len(items), err)
	}
	if err := store.RetryOutbox(ctx, items[0], errors.New("injected dispatch failure")); err != nil {
		t.Fatal(err)
	}
	var state, lastError string
	if err := store.pool.QueryRow(ctx, "SELECT state,last_error FROM delivery_outbox WHERE id=$1", items[0].ID).Scan(&state, &lastError); err != nil {
		t.Fatal(err)
	}
	if state != "retry_wait" || lastError != "injected dispatch failure" {
		t.Fatalf("unexpected retry state: %s %s", state, lastError)
	}
}

func TestExpiredLeaseCannotDispatchBeforeAnotherWorkerReclaims(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	if _, err := store.Send(ctx, "alice", "room-a", "expired-lease-op", "lease expired"); err != nil {
		t.Fatal(err)
	}
	items, err := store.ClaimOutbox(ctx, 1, time.Second)
	if err != nil || len(items) != 1 {
		t.Fatalf("claim: items=%d err=%v", len(items), err)
	}
	if _, err := store.pool.Exec(ctx, "UPDATE delivery_outbox SET lease_until=now()-interval '1 second' WHERE id=$1", items[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := store.Dispatch(ctx, items[0]); err == nil {
		t.Fatal("worker dispatched after its lease expired, before reclaim")
	}
	if err := store.RetryOutbox(ctx, items[0], errors.New("late failure")); err == nil {
		t.Fatal("expired worker rescheduled work after its lease expired")
	}
	var inboxCount int
	if err := store.pool.QueryRow(ctx, "SELECT count(*) FROM recipient_inbox").Scan(&inboxCount); err != nil {
		t.Fatal(err)
	}
	if inboxCount != 0 {
		t.Fatalf("expired worker created inbox item: %d", inboxCount)
	}
}

func TestParallelWorkersNeverClaimSameOutboxRow(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		if _, err := store.Send(ctx, "alice", "room-a", fmt.Sprintf("claim-%d", i), "parallel claim"); err != nil {
			t.Fatal(err)
		}
	}
	const workers = 5
	var wg sync.WaitGroup
	claimed := make(chan ClaimedDelivery, 10)
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			items, err := store.ClaimOutbox(ctx, 2, 5*time.Second)
			if err != nil {
				errs <- err
				return
			}
			for _, item := range items {
				claimed <- item
			}
		}()
	}
	wg.Wait()
	close(errs)
	close(claimed)
	for err := range errs {
		t.Fatal(err)
	}
	seen := map[int64]bool{}
	for item := range claimed {
		if seen[item.ID] {
			t.Fatalf("outbox row %d was claimed twice", item.ID)
		}
		seen[item.ID] = true
	}
	if len(seen) != 10 {
		t.Fatalf("want 10 uniquely claimed rows, got %d", len(seen))
	}
}

func TestOutboxStopsAfterMaximumAttempts(t *testing.T) {
	store := testStore(t)
	ctx := context.Background()
	if _, err := store.Send(ctx, "alice", "room-a", "terminal-op", "terminal"); err != nil {
		t.Fatal(err)
	}
	items, err := store.ClaimOutbox(ctx, 1, 5*time.Second)
	if err != nil || len(items) != 1 {
		t.Fatalf("claim: items=%d err=%v", len(items), err)
	}
	items[0].AttemptCount = 8
	if err := store.RetryOutbox(ctx, items[0], errors.New("injected final failure")); err != nil {
		t.Fatal(err)
	}
	var state string
	if err := store.pool.QueryRow(ctx, "SELECT state FROM delivery_outbox WHERE id=$1", items[0].ID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != "terminal_failure" {
		t.Fatalf("want terminal_failure after maximum attempts, got %s", state)
	}
}
