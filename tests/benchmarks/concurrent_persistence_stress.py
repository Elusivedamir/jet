"""Concurrent persistence/outbox correctness and throughput smoke test.

Runs the same workload against SQLite, PostgreSQL fresh connections and a
bounded PostgreSQL pool. This is not a production load test or SLO.
"""
import json
import os
import platform
import statistics
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "postgres_adapter"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sqlite_adapter"))

import psycopg
from psycopg.conninfo import make_conninfo

from postgres_message_store import PostgreSQLMessageStore
from pooled_postgres_message_store import PooledPostgreSQLMessageStore
from sqlite_message_store import SQLiteMessageStore


MESSAGE_COUNT = int(os.environ.get("JET_STRESS_MESSAGES", "40"))
WORKER_COUNTS = (1, 4, 16)
LEASE_SECONDS = 600


def percentile(values, p):
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(len(ordered) * p + 0.999999) - 1))
    return ordered[index]


def metrics(samples_ns, operation_count, elapsed_ns):
    return {
        "operations": operation_count,
        "elapsed_ms": round(elapsed_ns / 1_000_000, 3),
        "p50_ms": round(percentile(samples_ns, 0.50) / 1_000_000, 3),
        "p95_ms": round(percentile(samples_ns, 0.95) / 1_000_000, 3),
        "operations_per_second": round(operation_count / (elapsed_ns / 1_000_000_000), 2),
    }


def run_scenario(store, label, workers):
    conversation_id = "stress-room"
    store.create_conversation(
        conversation_id, ("sender", "recipient-b", "recipient-c")
    )

    send_samples = []
    send_lock = threading.Lock()

    def send_one(index):
        started = time.perf_counter_ns()
        message_id = store.send(
            "sender", conversation_id, f"{label}-op-{index}", f"payload-{index}"
        )
        elapsed = time.perf_counter_ns() - started
        with send_lock:
            send_samples.append(elapsed)
        return message_id

    send_started = time.perf_counter_ns()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        message_ids = list(executor.map(send_one, range(MESSAGE_COUNT)))
    send_elapsed = time.perf_counter_ns() - send_started

    if len(set(message_ids)) != MESSAGE_COUNT:
        raise AssertionError(f"{label}: duplicate message IDs after concurrent sends")

    expected_outbox = MESSAGE_COUNT * 2
    claimed = set()
    completed = set()
    dispatch_samples = []
    state_lock = threading.Lock()
    deadline = time.monotonic() + 90
    logical_epoch = 1_000_000

    def dispatch(worker_index):
        while True:
            with state_lock:
                if len(completed) == expected_outbox:
                    return
            if time.monotonic() > deadline:
                raise TimeoutError(
                    f"{label}: dispatch timeout at {len(completed)}/{expected_outbox}"
                )
            now = logical_epoch + int(time.monotonic())
            token = f"{label}-{worker_index}-{uuid.uuid4().hex}"
            started = time.perf_counter_ns()
            claim = store.claim_next(
                f"worker-{worker_index}", token, now, LEASE_SECONDS
            )
            if claim is None:
                time.sleep(0.001)
                continue
            identity = (claim["message_id"], claim["recipient_id"])
            with state_lock:
                if identity in claimed:
                    raise AssertionError(f"{label}: duplicate concurrent claim {identity}")
                claimed.add(identity)
            store.acknowledge_dispatch(
                claim["message_id"], claim["recipient_id"], claim["claim_token"], now + 1
            )
            elapsed = time.perf_counter_ns() - started
            with state_lock:
                dispatch_samples.append(elapsed)
                completed.add(identity)

    dispatch_started = time.perf_counter_ns()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(dispatch, i) for i in range(workers)]
        for future in futures:
            future.result(timeout=100)
    dispatch_elapsed = time.perf_counter_ns() - dispatch_started

    messages, outbox, next_position = store.snapshot(conversation_id)
    positions = [row[1] for row in messages]
    if len(messages) != MESSAGE_COUNT or positions != list(range(1, MESSAGE_COUNT + 1)):
        raise AssertionError(f"{label}: message count/sequence invariant failed")
    if len(outbox) != expected_outbox or len(claimed) != expected_outbox:
        raise AssertionError(f"{label}: outbox count or unique claim count mismatch")
    if len(completed) != expected_outbox or any(row[2] != "dispatched" for row in outbox):
        raise AssertionError(f"{label}: outbox dispatch incomplete")

    # Verify each recipient has exactly one outbox item per message and that
    # the committed per-recipient sequence remains strictly increasing.
    position_by_message = {row[0]: row[1] for row in messages}
    recipient_positions = {"recipient-b": [], "recipient-c": []}
    for message_id, recipient_id, state in outbox:
        if recipient_id not in recipient_positions:
            raise AssertionError(f"{label}: unexpected outbox recipient {recipient_id}")
        recipient_positions[recipient_id].append(position_by_message[message_id])
    for recipient_id, positions_for_recipient in recipient_positions.items():
        if positions_for_recipient != list(range(1, MESSAGE_COUNT + 1)):
            raise AssertionError(
                f"{label}: missing, duplicate or out-of-order outbox items for {recipient_id}"
            )

    if next_position != MESSAGE_COUNT + 1:
        raise AssertionError(f"{label}: next sequence mismatch")

    return {
        "workers": workers,
        "messages": MESSAGE_COUNT,
        "outbox_items": expected_outbox,
        "unique_claims": len(claimed),
        "all_dispatched": True,
        "message_acceptance": metrics(send_samples, MESSAGE_COUNT, send_elapsed),
        "outbox_claim_and_ack": metrics(dispatch_samples, expected_outbox, dispatch_elapsed),
    }


def run_sqlite(workers):
    with tempfile.TemporaryDirectory() as temp:
        store = SQLiteMessageStore(Path(temp) / "stress.sqlite3")
        return run_scenario(store, f"sqlite-{workers}", workers)


def run_postgres(workers, pooled):
    base_dsn = os.environ["POSTGRES_DSN"]
    schema = "jet_stress_" + uuid.uuid4().hex
    with psycopg.connect(base_dsn) as db:
        db.execute(f'CREATE SCHEMA "{schema}"')
    dsn = make_conninfo(base_dsn, options=f"-c search_path={schema}")
    store = None
    try:
        if pooled:
            store = PooledPostgreSQLMessageStore(dsn, min_size=1, max_size=4, timeout=30)
            label = f"postgres-pool-{workers}"
        else:
            store = PostgreSQLMessageStore(dsn)
            label = f"postgres-fresh-{workers}"
        result = run_scenario(store, label, workers)
        result["connection_strategy"] = (
            "psycopg_pool min=1 max=4" if pooled else "new connection per operation"
        )
        return result
    finally:
        if pooled and store is not None:
            store.close()
        with psycopg.connect(base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


if __name__ == "__main__":
    if MESSAGE_COUNT < 1:
        raise SystemExit("JET_STRESS_MESSAGES must be positive")
    report = {
        "benchmark_type": "concurrent_correctness_and_smoke_throughput_not_load_test",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "message_count_per_scenario": MESSAGE_COUNT,
        "recipients_per_message": 2,
        "worker_counts": list(WORKER_COUNTS),
        "postgresql_fresh_connection": [],
        "postgresql_pooled": [],
        "sqlite": [],
        "limitations": [
            "short CI smoke workload, not a capacity or soak test",
            "SQLite local file and PostgreSQL service container have different topology",
            "pool max size is 4; worker count 16 intentionally tests pool contention",
            "no CPU, memory, lock-wait or connection-wait instrumentation",
            "no transport, device delivery, replication, failover or production tuning",
        ],
    }
    for workers in WORKER_COUNTS:
        report["postgresql_fresh_connection"].append(run_postgres(workers, pooled=False))
        report["postgresql_pooled"].append(run_postgres(workers, pooled=True))
        report["sqlite"].append(run_sqlite(workers))
    output = json.dumps(report, indent=2, sort_keys=True)
    print(output)
    Path("persistence-concurrency-stress.json").write_text(output + "\n", encoding="utf-8")
