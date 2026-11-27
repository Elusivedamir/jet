#!/usr/bin/env python3
"""Hard-kill/restart test for the durable outbox, shared by all three PoCs.

The harness starts the actual server executable (not go run/npm/mvn wrappers),
blocks a dispatch transaction inside PostgreSQL, SIGKILLs that server, verifies
rollback, waits for lease expiry, restarts the same executable and verifies
one durable inbox row plus idempotent client retry.
"""
import argparse
import json
import os
import platform
import shlex
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


def psql(database_url, sql, capture=True):
    result = subprocess.run(
        ["psql", database_url, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        check=True, text=True, stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip() if capture else ""


def http(base, method, path, account=None, payload=None, timeout=5):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if account:
        headers["X-Test-Account"] = account
    req = urllib.request.Request(base.rstrip("/") + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        return error.code, json.loads(raw) if raw else None


def wait_health(base, process, log_path, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"server exited with {process.returncode}; see {log_path}")
        try:
            status, _ = http(base, "GET", "/healthz", account="alice", timeout=1)
            if status in (200, 204):
                return
        except Exception:
            pass
        time.sleep(0.25)
    raise TimeoutError(f"server did not become healthy; see {log_path}")


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
    command = [sys.executable, args.contract_harness, "--base-url", args.base_url,
               "--rounds", str(args.rounds), "--per-round", str(args.per_round),
               "--concurrent-rounds", "3", "--soak-seconds", "30", "--soak-concurrency", "16"]
    started = time.monotonic()
    child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    peak_rss = 0
    cpu_start = proc_snapshot(process.pid)
    while child.poll() is None:
        snap = proc_snapshot(process.pid)
        if snap:
            peak_rss = max(peak_rss, snap["rss_kib"])
        time.sleep(0.2)
    stdout, stderr = child.communicate()
    elapsed = round(time.monotonic() - started, 3)
    if child.returncode != 0:
        raise RuntimeError(f"shared contract/benchmark failed:\n{stdout}\n{stderr}")
    final = proc_snapshot(process.pid)
    cpu_ticks = None
    if cpu_start and final:
        cpu_ticks = max(0, final["cpu_ticks"] - cpu_start["cpu_ticks"])
    return {
        "elapsed_seconds": elapsed,
        "peak_server_rss_kib_sampled": peak_rss,
        "server_cpu_ticks_delta": cpu_ticks,
        "kernel_clock_ticks_per_second": os.sysconf("SC_CLK_TCK"),
        "runtime_environment": {"platform": platform.platform(), "logical_cpus": os.cpu_count()},
        "contract_and_latency_probe": json.loads(stdout),
        "resource_metric_note": "Linux /proc sampling of the direct server PID every 200ms; excludes PostgreSQL and is runner-specific. CPU ticks use the runner kernel clock tick rate.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--contract-harness", required=True)
    parser.add_argument("--rounds", type=int, default=5)
    parser.add_argument("--per-round", type=int, default=100)
    parser.add_argument("--output", default="crash-recovery-results.json")
    parser.add_argument("--log", default="crash-recovery-server.log")
    parser.add_argument("--server-command", nargs=argparse.REMAINDER, required=True)
    args = parser.parse_args()
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
        status, message = http(args.base_url, "POST",
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
        status, retry = http(args.base_url, "POST",
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
            status, claim_message = http(args.base_url, "POST",
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
        status, claim_retry = http(args.base_url, "POST",
            f"/v1/conversations/{claim_conversation}/messages", "alice",
            {"operation_key": claim_operation_key, "payload": claim_payload})
        if status != 202 or claim_retry["message_id"] != claim_message_id:
            raise AssertionError(f"claim-boundary idempotent retry failed: HTTP {status}, {claim_retry}")
        evidence["claim_boundary"]["recovery"] = {
            "outbox_state": "completed", "recipient_inbox_rows": 1,
            "retry_returns_original_message": True,
        }
        evidence["crash_recovery_cases"] = 2


        # Standard black-box contract and comparable request-latency probe on room-a.
        # Ensure fixtures exist for all candidates, even when their DB started empty.
        psql(args.database_url, """
          INSERT INTO conversations(id) VALUES ('room-a'),('room-b') ON CONFLICT DO NOTHING;
          INSERT INTO conversation_members(conversation_id,account_id) VALUES
            ('room-a','alice'),('room-a','bob'),('room-b','alice'),('room-b','carol')
          ON CONFLICT DO NOTHING;
        """)
        evidence["performance"] = run_contract_and_sample(args, process)
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(evidence, handle, indent=2)
        print(json.dumps(evidence, indent=2))
    finally:
        if process is not None:
            stop_server(process, log, hard=False)


if __name__ == "__main__":
    main()
