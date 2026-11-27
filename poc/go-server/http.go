package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type API struct{ store *Store }

func NewAPI(store *Store) http.Handler {
	api := &API{store: store}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /v1/conversations/{conversationID}/messages", api.send)
	mux.HandleFunc("GET /v1/conversations/{conversationID}/messages", api.history)
	mux.HandleFunc("GET /v1/conversations/{conversationID}/events", api.events)
	mux.HandleFunc("POST /v1/messages/{messageID}/ack", api.acknowledge)
	return testIdentityOnly(mux)
}

// testIdentityOnly is intentionally unsuitable for production authentication.
// It exists solely to isolate the persistence contract in the local PoC.
// The health endpoint is also behind this wrapper; the shared harness sends the test identity.
func testIdentityOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		account := strings.TrimSpace(r.Header.Get("X-Test-Account"))
		if account == "" {
			http.Error(w, "missing test identity", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), accountContextKey{}, account)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type accountContextKey struct{}

func accountFromContext(r *http.Request) string {
	account, _ := r.Context().Value(accountContextKey{}).(string)
	return account
}

func (a *API) send(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OperationKey string `json:"operation_key"`
		Payload      string `json:"payload"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	message, err := a.store.Send(r.Context(), accountFromContext(r), r.PathValue("conversationID"), body.OperationKey, body.Payload)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidRequest):
			http.Error(w, "invalid message request", http.StatusBadRequest)
		case errors.Is(err, ErrNotMember):
			http.Error(w, "not a conversation member", http.StatusForbidden)
		case errors.Is(err, ErrConflict):
			http.Error(w, "operation key conflict", http.StatusConflict)
		default:
			http.Error(w, "message persistence failed", http.StatusInternalServerError)
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(message)
}

func (a *API) history(w http.ResponseWriter, r *http.Request) {
	after, err := parseCursor(r)
	if err != nil {
		http.Error(w, "invalid cursor", http.StatusBadRequest)
		return
	}
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil {
			http.Error(w, "invalid limit", http.StatusBadRequest)
			return
		}
	}
	messages, err := a.store.History(r.Context(), accountFromContext(r), r.PathValue("conversationID"), after, limit)
	if err != nil {
		if errors.Is(err, ErrInvalidRequest) {
			http.Error(w, "invalid history request", http.StatusBadRequest)
		} else if errors.Is(err, ErrNotMember) {
			http.Error(w, "not a conversation member", http.StatusForbidden)
		} else {
			http.Error(w, "history unavailable", http.StatusInternalServerError)
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(messages)
}

func parseCursor(r *http.Request) (int64, error) {
	raw := r.Header.Get("Last-Event-ID")
	if raw == "" {
		raw = r.URL.Query().Get("after")
	}
	if raw == "" {
		return 0, nil
	}
	cursor, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || cursor < 0 {
		return 0, ErrInvalidRequest
	}
	return cursor, nil
}

func (a *API) events(w http.ResponseWriter, r *http.Request) {
	if _, err := a.store.InboxAfter(r.Context(), accountFromContext(r), r.PathValue("conversationID"), 0, 1); err != nil {
		if errors.Is(err, ErrNotMember) {
			http.Error(w, "not a conversation member", http.StatusForbidden)
		} else {
			http.Error(w, "event stream unavailable", http.StatusBadRequest)
		}
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	cursor, err := parseCursor(r)
	if err != nil {
		http.Error(w, "invalid cursor", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ticker := time.NewTicker(750 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			messages, err := a.store.InboxAfter(r.Context(), accountFromContext(r), r.PathValue("conversationID"), cursor, 50)
			if err != nil {
				return
			}
			for _, message := range messages {
				payload, err := json.Marshal(message)
				if err != nil {
					return
				}
				if _, err := fmt.Fprintf(w, "id: %d\nevent: message\ndata: %s\n\n", message.Position, payload); err != nil {
					return
				}
				cursor = message.Position
			}
			if len(messages) == 0 {
				if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
					return
				}
			}
			flusher.Flush()
		}
	}
}

func (a *API) acknowledge(w http.ResponseWriter, r *http.Request) {
	if err := a.store.Acknowledge(r.Context(), accountFromContext(r), r.PathValue("messageID")); err != nil {
		if errors.Is(err, ErrNotMember) {
			http.Error(w, "message not available to account", http.StatusForbidden)
		} else {
			http.Error(w, "acknowledgement failed", http.StatusBadRequest)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
