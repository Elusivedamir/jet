package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// applySchema intentionally supports this simple semicolon-delimited PoC schema
// only; it is not a general SQL migration parser.
func applySchema(ctx context.Context, pool *pgxpool.Pool, source string) error {
	for i, statement := range strings.Split(source, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := pool.Exec(ctx, statement); err != nil {
			return fmt.Errorf("schema statement %d: %w", i+1, err)
		}
	}
	return nil
}
