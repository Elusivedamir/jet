#!/data/data/com.termux/files/usr/bin/bash
# Jetson Messenger Android-side CI monitor.
# Read-only: never pushes, edits code, reruns workflows, or accesses secrets.
set -Eeuo pipefail

REPO="${JETSON_REPO:-Elusivedamir/jet}"
BRANCH="${JETSON_BRANCH:-project/foundation-and-juggleim-poc}"
WORKFLOW="${JETSON_WORKFLOW:-juggleim-e2e.yml}"
INTERVAL="${JETSON_POLL_SECONDS:-300}"
ROOT="${JETSON_AGENT_HOME:-$HOME/jetson-agent}"
STATE="$ROOT/state"
REPORTS="$ROOT/reports"
mkdir -p "$STATE" "$REPORTS"
LAST_FILE="$STATE/last-seen-run-id"

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$ROOT/monitor.log"; }

for cmd in gh jq; do
  command -v "$cmd" >/dev/null 2>&1 || { log "ERROR: missing $cmd; install it with pkg install $cmd"; exit 2; }
done

gh auth status >/dev/null 2>&1 || { log "ERROR: GitHub CLI is not authenticated. Run: gh auth login"; exit 3; }

summarize_failure() {
  local run_id="$1" url="$2" sha="$3" tmp report
  tmp="$(mktemp)"
  report="$REPORTS/run-$run_id.txt"
  log "Failure detected: run=$run_id sha=$sha"

  # gh masks GitHub Actions secrets in logs; still avoid printing raw logs to terminal.
  if ! gh run view "$run_id" --repo "$REPO" --log-failed >"$tmp" 2>"$ROOT/last-fetch-error.txt"; then
    printf 'Could not download failed logs. See %s\n' "$ROOT/last-fetch-error.txt" >"$report"
  else
    {
      printf 'JETSON MESSENGER CI FAILURE\nRun: %s\nCommit: %s\nURL: %s\nDetected: %s\n\n' "$run_id" "$sha" "$url" "$(date -Iseconds)"
      printf '%s\n' '--- Relevant diagnostic lines (filtered) ---'
      grep -Ei 'POC_|MSG-Sync|CONV-Sync|MSG-UploadPubKey|CON-Conn|error|exception|failed|timed out|failure' "$tmp" | tail -n 180 || true
      printf '\n%s\n' '--- End ---'
    } >"$report"
  fi
  rm -f "$tmp"
  log "Report saved: $report"
  if command -v termux-notification >/dev/null 2>&1; then
    termux-notification --title "Jetson Messenger: CI failure" --content "Run $run_id failed. Report: $report" --id 7319 || true
  fi
}

log "Monitor started: repo=$REPO branch=$BRANCH workflow=$WORKFLOW interval=${INTERVAL}s"
while true; do
  if runs="$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --branch "$BRANCH" --limit 1 --json databaseId,status,conclusion,headSha,url 2>"$ROOT/last-poll-error.txt")"; then
    run_id="$(printf '%s' "$runs" | jq -r '.[0].databaseId // empty')"
    if [[ -n "$run_id" ]]; then
      status="$(printf '%s' "$runs" | jq -r '.[0].status')"
      conclusion="$(printf '%s' "$runs" | jq -r '.[0].conclusion // empty')"
      sha="$(printf '%s' "$runs" | jq -r '.[0].headSha')"
      url="$(printf '%s' "$runs" | jq -r '.[0].url')"
      last="$(cat "$LAST_FILE" 2>/dev/null || true)"
      if [[ "$status" == "completed" && "$run_id" != "$last" ]]; then
        if [[ "$conclusion" != "success" ]]; then
          summarize_failure "$run_id" "$url" "$sha"
        else
          log "Latest run passed: run=$run_id sha=$sha ($url)"
          if command -v termux-notification >/dev/null 2>&1; then
            termux-notification --title "Jetson Messenger: CI passed" --content "Run $run_id passed." --id 7319 || true
          fi
        fi
        printf '%s' "$run_id" >"$LAST_FILE"
      else
        log "Latest run: id=$run_id status=$status conclusion=${conclusion:-pending}"
      fi
    else
      log "No matching workflow runs found yet."
    fi
  else
    log "GitHub poll failed; see $ROOT/last-poll-error.txt"
  fi
  sleep "$INTERVAL"
done
