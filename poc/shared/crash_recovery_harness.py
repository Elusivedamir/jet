#!/usr/bin/env python3
"""Hard-kill/restart test for the durable outbox, shared by all three PoCs.

The harness starts the actual server executable (not go run/npm/mvn wrappers),
blocks a dispatch transaction inside PostgreSQL, SIGKILLs that server, verifies
rollback, waits for lease expiry, restarts the same executable and verifies
one durable inbox row plus idempotent client retry.
"""
import argparse
import http.client
import json
import os
import platform
import shlex
import signal
import subprocess
import sys
import time
import urllib.parse
import uuid


def validate_base_url(base):
    parsed = urllib.parse.urlsplit(base)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("base URL must be an http_request(s) origin without credentials, path, query or fragment")
    try:
        _ = parsed.port
    except ValueError as error:
        raise ValueError("base URL contains an invalid port") from error
    return parsed


def psql(database_url, sql, capture=True):
    result = subprocess.run(
        ["psql", database_url, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        check=True, text=True, stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip() if capture else ""


def http_request(base, method, path, account=None, payload=None, timeout=5):
    parsed = validate_base_url(base)
    data = None if payload is None else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if account:
        headers["X-Test-Account"] = account
    connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_type(parsed.hostname, parsed.port, timeout=timeout)
    try:
        connection.request(method, path, body=data, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        return response.status, json.loads(raw) if raw else None
    finally:
        connection.close()


def wait_health(base, process, log_path, timeout=45):
    deadline = time.monotonic() + timeout
    last_error = "no health response received"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"server exited with {process.returncode}; see {log_path}")
        try:
            status, _ = http_request(base, "GET", "/healthz", account="alice", timeout=1)
            if status in (200, 204):
                return
            last_error = f"unexpected HTTP status {status}"
        except Exception as error:
            last_error = f"{type(error).__name__}: {error}"
        time.sleep(0.25)
    raise TimeoutError(
        f"server did not become healthy; last probe: {last_error}; see {log_path}"
    )


def start_server(command, env, log_path):
    log = open(log_path, "ab", buffering=0)
    process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT,
                               start_new_session=True)
    return process, log


def stop_server(process, log, hard=False):
    if process.poll() is None:
        if hard:
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
    log.close()


def post_without_reading_response(base, path, account, payload, database_url, commit_sql, timeout=20):
    """Send a request, wait for its DB commit without reading the response, then close."""
    parsed = validate_base_url(base)
    connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_type(parsed.hostname, parsed.port, timeout=5)
    body = json.dumps(payload).encode()
    try:
        connection.request(
            "POST",
            path,
            body=body,
            headers={"Content-Type": "application/json", "X-Test-Account": account},
        )
        # Keep the socket open while a separate DB connection observes commit.
        # The HTTP response is intentionally never read by this client.
        return wait_for_sql_value(database_url, commit_sql, timeout=timeout)
    finally:
        connection.close()


def wait_for_sql_value(database_url, sql, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = psql(database_url, sql)
        if value:
            return value
        time.sleep(0.2)
    raise TimeoutError(f"database value did not appear: {sql}")


def wait_for_sql(database_url, sql, expected, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if psql(database_url, sql) == expected:
            return
        time.sleep(0.2)
    raise TimeoutError(f"database condition not reached: {sql}")


def proc_snapshot(pid):
    """Linux /proc RSS and CPU counters for the server process."""
    try:
        status = open(f"/proc/{pid}/status", encoding="utf-8").read()
        stat = open(f"/proc/{pid}/stat", encoding="utf-8").read().split()
        rss_kib = int(next(line.split()[1] for line in status.splitlines()
                           if line.startswith("VmRSS:")))
        return {"rss_kib": rss_kib, "cpu_ticks": int(stat[13]) + int(stat[14])}
    except (OSError, StopIteration, ValueError, IndexError):
        return None


def run_contract_and_sample(args, process):
    producer_harness = os.path.join(os.path.dirname(os.path.abspath(args.contract_harness)),
                                    "producer_soak_harness.py")
    started = time.monotonic()
    cpu_start = proc_snapshot(process.pid)
    peak_rss = 0
    rss_samples = []
    probes = []
    for repetition in range(1, args.soak_repetitions + 1):
        if repetition == 1:
            command = [sys.executable, args.contract_harness, "--base-url", args.base_url,
                       "--rounds", str(args.rounds), "--per-round", str(args.per_round),
                       "--concurrent-rounds", "3", "--soak-seconds", "30", "--soak-concurrency", "16"]
        else:
            command = [sys.executable, producer_harness, "--base-url", args.base_url,
                       "--duration-seconds", "30", "--concurrency", "16"]
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        while child.poll() is None:
            snap = proc_snapshot(process.pid)
            if snap:
                peak_rss = max(peak_rss, snap["rss_kib"])
                rss_samples.append(snap["rss_kib"])
            time.sleep(0.2)
        stdout, stderr = child.communicate()
        if child.returncode != 0:
            raise RuntimeError(f"producer/contract repetition {repetition} failed:\n{stdout}\n{stderr}")
        probes.append(json.loads(stdout))
    elapsed = round(time.monotonic() - started, 3)
    final = proc_snapshot(process.pid)
    cpu_ticks = None
    if cpu_start and final:
        cpu_ticks = max(0, final["cpu_ticks"] - cpu_start["cpu_ticks"])
    clock_ticks = os.sysconf("SC_CLK_TCK")
    cpu_seconds = (cpu_ticks / clock_ticks) if cpu_ticks is not None else None
    cpu_percent_one_core = (cpu_seconds / elapsed * 100) if cpu_seconds is not None and elapsed else None
    logical_cpus = os.cpu_count() or 1
    return {
        "elapsed_seconds": elapsed,
        "repetitions": len(probes),
        "peak_server_rss_kib_sampled": peak_rss,
        "mean_server_rss_kib_sampled": round(sum(rss_samples) / len(rss_samples), 1) if rss_samples else None,
        "rss_sample_count": len(rss_samples),
        "server_cpu_ticks_delta": cpu_ticks,
        "server_cpu_seconds": round(cpu_seconds, 3) if cpu_seconds is not None else None,
        "server_cpu_percent_one_core": round(cpu_percent_one_core, 2) if cpu_percent_one_core is not None else None,
        "server_cpu_percent_host": round(cpu_percent_one_core / logical_cpus, 2) if cpu_percent_one_core is not None else None,
        "kernel_clock_ticks_per_second": clock_ticks,
        "runtime_environment": {"platform": platform.platform(), "logical_cpus": logical_cpus},
        "repeated_contract_and_capacity_probes": probes,
        "resource_metric_note": "Linux /proc sampling of the direct server PID every 200ms across all repetitions; excludes PostgreSQL and is runner-specific. CPU percentage is derived from process CPU ticks divided by elapsed wall time; one-core and whole-host-normalized figures are both reported.",
    }


def read_outbox_snapshot(database_url):
    raw = psql(database_url, """
      SELECT json_build_object(
        'total', count(*),
        'completed', count(*) FILTER (WHERE state='completed'),
        'pending', count(*) FILTER (WHERE state='pending'),
        'processing', count(*) FILTER (WHERE state='processing'),
        'retry_wait', count(*) FILTER (WHERE state='retry_wait'),
        'terminal_failure', count(*) FILTER (WHERE state='terminal_failure'),
        'open', count(*) FILTER (WHERE state IN ('pending','processing','retry_wait')),
        'p95_completed_delivery_ms', COALESCE(
          percentile_cont(0.95) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (completed_at-created_at))*1000
          ) FILTER (WHERE state='completed'), 0
        ),
        'oldest_open_delivery_age_seconds', COALESCE(
          CEIL(EXTRACT(EPOCH FROM (
            clock_timestamp() - MIN(created_at) FILTER (
              WHERE state IN ('pending','processing','retry_wait')
            )
          ))), 0
        )
      )::text
      FROM delivery_outbox
    """)
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--contract-harness", required=True)
    parser.add_argument("--rounds", type=int, default=5)
    parser.add_argument("--per-round", type=int, default=100)
    parser.add_argument("--soak-repetitions", type=int, default=3)
    parser.add_argument("--drain-seconds", type=int, default=60)
    parser.add_argument("--drain-sample-seconds", type=int, default=5)
    parser.add_argument("--output", default="crash-recovery-results.json")
    parser.add_argument("--log", default="crash-recovery-server.log")
    parser.add_argument("--server-command", nargs=argparse.REMAINDER, required=True)
    args = parser.parse_args()
    if not 1 <= args.soak_repetitions <= 5 or not 0 <= args.drain_seconds <= 300 or not 1 <= args.drain_sample_seconds <= 30:
        parser.error("soak repetitions must be 1..5, drain seconds 0..300, sample interval 1..30")
    validate_base_url(args.base_url)
    command = args.server_command
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("--server-command must be followed by an executable and arguments")

    env = os.environ.copy()
    env["DATABASE_URL"] = args.database_url
    env["TEST_DATABASE_URL"] = args.database_url
    env["LISTEN_ADDR"] = env.get("LISTEN_ADDR", ":8080")
    env["PORT"] = env.get("PORT", "8081")
    env["SERVER_PORT"] = env.get("SERVER_PORT", "8082")
    conversation = "crash-room"
    operation_key = "hard-crash-" + str(uuid.uuid4())
    payload = "crash-recovery-payload-" + str(uuid.uuid4())
    process = None
    log = None
    evidence = {"harness_version": 2, "test": "hard-process-kill-during-recipient-inbox-transaction",
                "server_command": command, "operation_key": operation_key}

    try:
        process, log = start_server(command, env, args.log)
        wait_health(args.base_url, process, args.log)

        # Isolated disposable test fixture and trigger: only this conversation pauses.
        psql(args.database_url, f"""
          DELETE FROM conversations WHERE id='{conversation}';
          INSERT INTO conversations(id) VALUES ('{conversation}');
          INSERT INTO conversation_members(conversation_id,account_id)
            VALUES ('{conversation}','alice'),('{conversation}','bob');
          CREATE OR REPLACE FUNCTION jetson_crash_pause_dispatch() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            PERFORM pg_sleep(5);
            RETURN NEW;
          END $$;
          DROP TRIGGER IF EXISTS jetson_crash_pause_dispatch_trigger ON recipient_inbox;
          CREATE TRIGGER jetson_crash_pause_dispatch_trigger
          BEFORE INSERT ON recipient_inbox
          FOR EACH ROW WHEN (NEW.conversation_id = '{conversation}')
          EXECUTE FUNCTION jetson_crash_pause_dispatch();
        """)
        status, message = http_request(args.base_url, "POST",
            f"/v1/conversations/{conversation}/messages", "alice",
            {"operation_key": operation_key, "payload": payload})
        if status != 202:
            raise AssertionError(f"send failed before crash injection: HTTP {status}, {message}")
        message_id = message["message_id"]
        evidence["message_id"] = message_id

        wait_for_sql(args.database_url,
            "SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep' "
            "AND datname=current_database()", "1", timeout=20)
        evidence["dispatch_pause_observed"] = True
        stop_server(process, log, hard=True)
        process = None
        log = None
        evidence["server_sigkill_confirmed"] = True

        # The in-flight inbox insert and outbox completion share one transaction.
        inbox_after_kill = psql(args.database_url,
            f"SELECT count(*) FROM recipient_inbox WHERE message_id='{message_id}'")
        outbox_state = psql(args.database_url,
            f"SELECT state FROM delivery_outbox WHERE message_id='{message_id}'")
        if inbox_after_kill != "0" or outbox_state != "processing":
            raise AssertionError(f"crash did not roll back dispatch atomically: inbox={inbox_after_kill}, outbox={outbox_state}")
        evidence["post_kill"] = {"recipient_inbox_rows": int(inbox_after_kill),
                                 "outbox_state": outbox_state}

        psql(args.database_url, """
          DROP TRIGGER IF EXISTS jetson_crash_pause_dispatch_trigger ON recipient_inbox;
          DROP FUNCTION IF EXISTS jetson_crash_pause_dispatch();
        """)
        lease_remaining = psql(args.database_url,
            f"SELECT GREATEST(0,CEIL(EXTRACT(EPOCH FROM (lease_until-clock_timestamp()))))::int "
            f"FROM delivery_outbox WHERE message_id='{message_id}'")
        remaining_seconds = int(lease_remaining or "0")
        if remaining_seconds < 1:
            raise AssertionError("worker lease expired before SIGKILL; crash test did not exercise an unexpired lease")
        wait_seconds = remaining_seconds + 2
        evidence["lease_remaining_at_kill_seconds"] = remaining_seconds
        evidence["lease_expiry_wait_seconds"] = wait_seconds
        time.sleep(wait_seconds)

        process, log = start_server(command, env, args.log)
        wait_health(args.base_url, process, args.log)
        wait_for_sql(args.database_url,
            f"SELECT state FROM delivery_outbox WHERE message_id='{message_id}'",
            "completed", timeout=35)
        recovered_inbox = psql(args.database_url,
            f"SELECT count(*) FROM recipient_inbox WHERE message_id='{message_id}' AND recipient_id='bob'")
        if recovered_inbox != "1":
            raise AssertionError(f"expected exactly one recovered inbox row, got {recovered_inbox}")
        status, retry = http_request(args.base_url, "POST",
            f"/v1/conversations/{conversation}/messages", "alice",
            {"operation_key": operation_key, "payload": payload})
        if status != 202 or retry["message_id"] != message_id:
            raise AssertionError(f"idempotent retry after restart failed: HTTP {status}, {retry}")
        evidence["recovery"] = {"outbox_state": "completed", "recipient_inbox_rows": 1,
                                "retry_returns_original_message": True}
        evidence["crash_recovery"] = "PASS"

        # Second boundary: the worker has committed its lease claim, but its
        # recipient-inbox INSERT is blocked before dispatch can begin.
        claim_conversation = "claim-crash-room"
        claim_operation_key = "claim-crash-" + str(uuid.uuid4())
        claim_payload = "claim-crash-payload-" + str(uuid.uuid4())
        psql(args.database_url, f"""
          DELETE FROM conversations WHERE id='{claim_conversation}';
          INSERT INTO conversations(id) VALUES ('{claim_conversation}');
          INSERT INTO conversation_members(conversation_id,account_id)
            VALUES ('{claim_conversation}','alice'),('{claim_conversation}','bob');
        """)
        lock_holder = subprocess.Popen(
            ["psql", args.database_url, "-X", "-v", "ON_ERROR_STOP=1", "-c",
             "BEGIN; LOCK TABLE recipient_inbox IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(90);"],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
            start_new_session=True)
        try:
            wait_for_sql(args.database_url,
                "SELECT count(*) FROM pg_locks WHERE relation='recipient_inbox'::regclass "
                "AND mode='AccessExclusiveLock' AND granted", "1", timeout=15)
            status, claim_message = http_request(args.base_url, "POST",
                f"/v1/conversations/{claim_conversation}/messages", "alice",
                {"operation_key": claim_operation_key, "payload": claim_payload})
            if status != 202:
                raise AssertionError(f"claim-boundary send failed: HTTP {status}, {claim_message}")
            claim_message_id = claim_message["message_id"]
            wait_for_sql(args.database_url,
                f"SELECT state FROM delivery_outbox WHERE message_id='{claim_message_id}'",
                "processing", timeout=20)
            wait_for_sql(args.database_url,
                "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' "
                "AND query ILIKE '%recipient_inbox%' AND datname=current_database()",
                "1", timeout=20)
            claim_lease_remaining = int(psql(args.database_url,
                f"SELECT GREATEST(0,CEIL(EXTRACT(EPOCH FROM (lease_until-clock_timestamp()))))::int "
                f"FROM delivery_outbox WHERE message_id='{claim_message_id}'") or "0")
            if claim_lease_remaining < 1:
                raise AssertionError("claim lease expired before worker reached blocked inbox insert")
            stop_server(process, log, hard=True)
            process = None
            log = None
            evidence["claim_boundary_sigkill_confirmed"] = True
        finally:
            if lock_holder.poll() is None:
                os.killpg(lock_holder.pid, signal.SIGTERM)
                try:
                    lock_holder.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(lock_holder.pid, signal.SIGKILL)
                    lock_holder.wait(timeout=5)
        claim_inbox_after_kill = psql(args.database_url,
            f"SELECT count(*) FROM recipient_inbox WHERE message_id='{claim_message_id}'")
        claim_outbox_after_kill = psql(args.database_url,
            f"SELECT state FROM delivery_outbox WHERE message_id='{claim_message_id}'")
        if claim_inbox_after_kill != "0" or claim_outbox_after_kill != "processing":
            raise AssertionError("claim-boundary SIGKILL did not preserve the committed claim without an inbox row: "
                                 f"inbox={claim_inbox_after_kill}, outbox={claim_outbox_after_kill}")
        claim_wait_seconds = claim_lease_remaining + 2
        evidence["claim_boundary"] = {
            "server_sigkill_confirmed": True,
            "committed_claim_state_after_kill": claim_outbox_after_kill,
            "recipient_inbox_rows_after_kill": int(claim_inbox_after_kill),
            "lease_remaining_at_kill_seconds": claim_lease_remaining,
            "lease_expiry_wait_seconds": claim_wait_seconds,
        }
        time.sleep(claim_wait_seconds)
        process, log = start_server(command, env, args.log)
        wait_health(args.base_url, process, args.log)
        wait_for_sql(args.database_url,
            f"SELECT state FROM delivery_outbox WHERE message_id='{claim_message_id}'",
            "completed", timeout=35)
        claim_recovered_inbox = psql(args.database_url,
            f"SELECT count(*) FROM recipient_inbox WHERE message_id='{claim_message_id}' AND recipient_id='bob'")
        if claim_recovered_inbox != "1":
            raise AssertionError(f"expected one inbox row after claim-boundary recovery, got {claim_recovered_inbox}")
        status, claim_retry = http_request(args.base_url, "POST",
            f"/v1/conversations/{claim_conversation}/messages", "alice",
            {"operation_key": claim_operation_key, "payload": claim_payload})
        if status != 202 or claim_retry["message_id"] != claim_message_id:
            raise AssertionError(f"claim-boundary idempotent retry failed: HTTP {status}, {claim_retry}")
        evidence["claim_boundary"]["recovery"] = {
            "outbox_state": "completed", "recipient_inbox_rows": 1,
            "retry_returns_original_message": True,
        }
        evidence["crash_recovery_cases"] = 2

        # Third boundary: the message/outbox transaction commits, but the
        # client intentionally discards the acceptance response and retries
        # after an immediate process kill/restart.
        lost_conversation = "lost-response-room"
        lost_operation_key = "lost-response-" + str(uuid.uuid4())
        lost_payload = "lost-response-payload-" + str(uuid.uuid4())
        psql(args.database_url, f"""
          DELETE FROM conversations WHERE id='{lost_conversation}';
          INSERT INTO conversations(id) VALUES ('{lost_conversation}');
          INSERT INTO conversation_members(conversation_id,account_id)
            VALUES ('{lost_conversation}','alice'),('{lost_conversation}','bob');
        """)
        committed_message_id = post_without_reading_response(
            args.base_url,
            f"/v1/conversations/{lost_conversation}/messages",
            "alice",
            {"operation_key": lost_operation_key, "payload": lost_payload},
            args.database_url,
            f"SELECT id FROM messages WHERE sender_id='alice' AND operation_key='{lost_operation_key}'",
            timeout=20,
        )
        # The client closes without reading the server's acceptance response.
        stop_server(process, log, hard=True)
        process = None
        log = None
        process, log = start_server(command, env, args.log)
        wait_health(args.base_url, process, args.log)
        wait_for_sql(args.database_url,
            f"SELECT state FROM delivery_outbox WHERE message_id='{committed_message_id}'",
            "completed", timeout=35)
        lost_inbox_rows = psql(args.database_url,
            f"SELECT count(*) FROM recipient_inbox WHERE message_id='{committed_message_id}' AND recipient_id='bob'")
        if lost_inbox_rows != "1":
            raise AssertionError(f"lost-response recovery expected one inbox row, got {lost_inbox_rows}")
        status, lost_retry = http_request(args.base_url, "POST",
            f"/v1/conversations/{lost_conversation}/messages", "alice",
            {"operation_key": lost_operation_key, "payload": lost_payload})
        if status != 202 or lost_retry["message_id"] != committed_message_id:
            raise AssertionError(f"lost-response idempotent retry failed: HTTP {status}, {lost_retry}")
        evidence["lost_acceptance_response"] = {
            "server_sigkill_after_commit": True,
            "client_discarded_acceptance_response": True,
            "durable_message_found_after_restart": True,
            "outbox_state": "completed",
            "recipient_inbox_rows": 1,
            "retry_returns_original_message": True,
        }
        evidence["crash_recovery_cases"] = 3


        # Standard black-box contract and comparable request-latency probe on room-a.
        # Ensure fixtures exist for all candidates, even when their DB started empty.
        psql(args.database_url, """
          INSERT INTO conversations(id) VALUES ('room-a'),('room-b') ON CONFLICT DO NOTHING;
          INSERT INTO conversation_members(conversation_id,account_id) VALUES
            ('room-a','alice'),('room-a','bob'),('room-b','alice'),('room-b','carol')
          ON CONFLICT DO NOTHING;
        """)
        evidence["worker_configuration"] = {
            "concurrency": int(env.get("OUTBOX_WORKER_CONCURRENCY", env.get("JET_WORKER_CONCURRENCY", "1"))),
            "database_pool_max_connections": int(env.get("DATABASE_POOL_MAX_CONNS", env.get("SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE", "40"))),
            "claim_batch_size": 20,
            "poll_interval_ms": 250,
            "lease_duration_ms": 15000,
        }
        evidence["performance"] = run_contract_and_sample(args, process)
        evidence["outbox_state_after_soak"] = read_outbox_snapshot(args.database_url)
        drain_started = time.monotonic()
        drain_samples = []
        while True:
            snapshot = read_outbox_snapshot(args.database_url)
            drain_samples.append({
                "elapsed_seconds": round(time.monotonic() - drain_started, 1),
                **snapshot,
            })
            if snapshot["open"] == 0:
                break
            remaining = args.drain_seconds - (time.monotonic() - drain_started)
            if remaining <= 0:
                break
            time.sleep(min(args.drain_sample_seconds, remaining))
        evidence["queue_drain"] = {
            "window_seconds": args.drain_seconds,
            "sample_interval_seconds": args.drain_sample_seconds,
            "actual_elapsed_seconds": round(time.monotonic() - drain_started, 2),
            "drained_to_zero": drain_samples[-1]["open"] == 0,
            "samples": drain_samples,
            "final": drain_samples[-1],
        }
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(evidence, handle, indent=2)
        print(json.dumps(evidence, indent=2))
    finally:
        if process is not None:
            stop_server(process, log, hard=False)


if __name__ == "__main__":
    main()
