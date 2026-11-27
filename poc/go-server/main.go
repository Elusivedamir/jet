package main

import (
	"context"
	"embed"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaFS embed.FS

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		log.Fatalf("parse PostgreSQL configuration: %v", err)
	}
	poolMax := envInt("DATABASE_POOL_MAX_CONNS", 40, 4, 100)
	poolConfig.MaxConns = int32(poolMax)
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		log.Fatalf("create PostgreSQL pool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("connect to PostgreSQL: %v", err)
	}
	schema, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		log.Fatalf("read embedded schema: %v", err)
	}
	if err := applySchema(ctx, pool, string(schema)); err != nil {
		log.Fatalf("apply PoC schema: %v", err)
	}

	store := NewStore(pool)
	workerConcurrency := envInt("OUTBOX_WORKER_CONCURRENCY", 1, 1, 16)
	log.Printf("outbox worker concurrency=%d database pool max_conns=%d", workerConcurrency, poolMax)
	go RunOutboxWorker(ctx, store, 250*time.Millisecond, workerConcurrency)

	server := &http.Server{
		Addr:              envOr("LISTEN_ADDR", ":8080"),
		Handler:           NewAPI(store),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	log.Printf("Go durable-message PoC listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("HTTP server: %v", err)
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback, minValue, maxValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minValue || parsed > maxValue {
		log.Fatalf("%s must be an integer between %d and %d", key, minValue, maxValue)
	}
	return parsed
}
