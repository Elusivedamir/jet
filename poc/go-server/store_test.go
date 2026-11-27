package main

import (
	"context"
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
