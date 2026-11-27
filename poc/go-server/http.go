package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
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
	return testIdentityOnly(mux)
}

// testIdentityOnly is intentionally unsuitable for production authentication.
// It exists solely to isolate the persistence contract in the local PoC.
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
	after, err := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	if r.URL.Query().Get("after") == "" {
		after = 0
	} else if err != nil {
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
