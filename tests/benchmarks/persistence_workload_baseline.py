"""Small, repeatable persistence adapter workload baseline.

This is a comparative smoke benchmark, not a production load test or SLO.
"""
import json
import os
import platform
import sqlite3
import sys
import tempfile
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "postgres_adapter"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sqlite_adapter"))

import psycopg
from psycopg.conninfo import make_conninfo

from postgres_message_store import PostgreSQLMessageStore
from pooled_postgres_message_store import PooledPostgreSQLMessageStore
from sqlite_message_store import SQLiteMessageStore


MESSAGE_COUNT = int(os.environ.get("JET_BENCH_MESSAGES", "100"))


def percentile(values, p):
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) * p + 0.999999)) - 1))
    return ordered[index]


def summarize(samples_ns):
    total_seconds = sum(samples_ns) / 1_000_000_000
    return {
        "operations": len(samples_ns),
        "total_ms": round(total_seconds * 1000, 3),
        "p50_ms": round(percentile(samples_ns, 0.50) / 1_000_000, 3),
        "p95_ms": round(percentile(samples_ns, 0.95) / 1_000_000, 3),
        "operations_per_second": round(len(samples_ns) / total_seconds, 2) if total_seconds else None,
    }


def exercise(store, label):
    store.create_conversation("bench-room", ("sender", "recipient-b", "recipient-c"))

    send_samples = []
    for i in range(MESSAGE_COUNT):
        started = time.perf_counter_ns()
        store.send("sender", "bench-room", f"bench-op-{i}", f"payload-{i}")
        send_samples.append(time.perf_counter_ns() - started)

    dispatch_samples = []
    dispatched = 0
    logical_now = 1_000_000
    while True:
        started = time.perf_counter_ns()
        claim = store.claim_next(
            "bench-worker", f"{label}-claim-{dispatched}", logical_now, 60
        )
        if claim is None:
            break
        store.acknowledge_dispatch(
            claim["message_id"], claim["recipient_id"],
            claim["claim_token"], logical_now + 1,
        )
        dispatch_samples.append(time.perf_counter_ns() - started)
        dispatched += 1
        logical_now += 2

    messages, outbox, next_position = store.snapshot("bench-room")
    expected_outbox = MESSAGE_COUNT * 2
    if len(messages) != MESSAGE_COUNT or len(outbox) != expected_outbox:
        raise AssertionError(f"{label}: unexpected persisted row counts")
    if any(row[2] != "dispatched" for row in outbox):
        raise AssertionError(f"{label}: not all outbox items were dispatched")
    if dispatched != expected_outbox or next_position != MESSAGE_COUNT + 1:
        raise AssertionError(f"{label}: dispatch count or sequence mismatch")

    return {
        "message_acceptance": summarize(send_samples),
        "outbox_claim_and_ack": summarize(dispatch_samples),
        "messages": len(messages),
        "outbox_items": len(outbox),
        "all_dispatched": True,
    }


def run_sqlite():
    with tempfile.TemporaryDirectory() as temp:
        store = SQLiteMessageStore(Path(temp) / "benchmark.sqlite3")
        return exercise(store, "sqlite")


def run_postgres_fresh():
    base_dsn = os.environ["POSTGRES_DSN"]
    schema = "jet_bench_fresh_" + uuid.uuid4().hex
    with psycopg.connect(base_dsn) as db:
        db.execute(f'CREATE SCHEMA "{schema}"')
    try:
        dsn = make_conninfo(base_dsn, options=f"-c search_path={schema}")
        store = PostgreSQLMessageStore(dsn)
        with psycopg.connect(dsn) as db:
            version = db.execute("SHOW server_version").fetchone()[0]
        result = exercise(store, "postgres-fresh")
        result["server_version"] = version
        result["connection_strategy"] = "new connection per operation"
        return result
    finally:
        with psycopg.connect(base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


def run_postgres_pooled():
    base_dsn = os.environ["POSTGRES_DSN"]
    schema = "jet_bench_pool_" + uuid.uuid4().hex
    with psycopg.connect(base_dsn) as db:
        db.execute(f'CREATE SCHEMA "{schema}"')
    store = None
    try:
        dsn = make_conninfo(base_dsn, options=f"-c search_path={schema}")
        store = PooledPostgreSQLMessageStore(dsn, min_size=1, max_size=4)
        with psycopg.connect(dsn) as db:
            version = db.execute("SHOW server_version").fetchone()[0]
        result = exercise(store, "postgres-pool")
        result["server_version"] = version
        result["connection_strategy"] = "psycopg_pool min=1 max=4"
        return result
    finally:
        if store is not None:
            store.close()
        with psycopg.connect(base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


if __name__ == "__main__":
    report = {
        "benchmark_type": "small_serial_comparison_not_load_test",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "message_count": MESSAGE_COUNT,
        "recipients_per_message": 2,
        "sqlite_version": sqlite3.sqlite_version,
        "postgresql_fresh_connection": run_postgres_fresh(),
        "postgresql_pooled": run_postgres_pooled(),
        "sqlite": run_sqlite(),
        "limitations": [
            "single CI runner and one serial workload",
            "no concurrent throughput, network transport or real devices",
            "no cold/warm cache separation or repeated statistical trials",
            "not a production SLO or architecture decision",
        ],
    }
    output = json.dumps(report, indent=2, sort_keys=True)
    print(output)
    Path("persistence-benchmark.json").write_text(output + "\n", encoding="utf-8")
