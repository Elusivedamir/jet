"""Five-trial serial comparison of SQLite and PostgreSQL connection strategies.

This is a repeatability smoke benchmark, not a production load test or SLO.
"""
import json
import os
import platform
import sqlite3
import statistics
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
TRIALS = int(os.environ.get("JET_BENCH_TRIALS", "5"))


def percentile(values, p):
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) * p + 0.999999) - 1)))
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


def postgres_schema():
    base_dsn = os.environ["POSTGRES_DSN"]
    schema = "jet_bench_" + uuid.uuid4().hex
    with psycopg.connect(base_dsn) as db:
        db.execute(f'CREATE SCHEMA "{schema}"')
    return base_dsn, schema, make_conninfo(base_dsn, options=f"-c search_path={schema}")


def run_postgres_fresh(trial):
    base_dsn, schema, dsn = postgres_schema()
    try:
        store = PostgreSQLMessageStore(dsn)
        with psycopg.connect(dsn) as db:
            version = db.execute("SHOW server_version").fetchone()[0]
        result = exercise(store, f"postgres-fresh-{trial}")
        result.update(server_version=version, connection_strategy="new connection per operation")
        return result
    finally:
        with psycopg.connect(base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


def run_postgres_pooled(trial):
    base_dsn, schema, dsn = postgres_schema()
    store = None
    try:
        store = PooledPostgreSQLMessageStore(dsn, min_size=1, max_size=4)
        with psycopg.connect(dsn) as db:
            version = db.execute("SHOW server_version").fetchone()[0]
        result = exercise(store, f"postgres-pool-{trial}")
        result.update(
            server_version=version,
            connection_strategy="psycopg_pool min_size=1 max_size=4",
            pool_min_size=1,
            pool_max_size=4,
        )
        return result
    finally:
        if store is not None:
            store.close()
        with psycopg.connect(base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


def run_sqlite(trial):
    with tempfile.TemporaryDirectory() as temp:
        store = SQLiteMessageStore(Path(temp) / "benchmark.sqlite3")
        return exercise(store, f"sqlite-{trial}")


def aggregate(trials):
    output = {}
    for metric in ("message_acceptance", "outbox_claim_and_ack"):
        output[metric] = {}
        for field in ("p50_ms", "p95_ms", "operations_per_second"):
            values = [trial[metric][field] for trial in trials]
            output[metric][field] = round(statistics.median(values), 3)
            output[metric][field + "_min"] = round(min(values), 3)
            output[metric][field + "_max"] = round(max(values), 3)
    output["trial_count"] = len(trials)
    output["all_trials_dispatched"] = all(trial["all_dispatched"] for trial in trials)
    return output


if __name__ == "__main__":
    if MESSAGE_COUNT < 1 or TRIALS < 3:
        raise SystemExit("JET_BENCH_MESSAGES must be positive and JET_BENCH_TRIALS >= 3")
    results = {
        "postgresql_fresh_connection": [],
        "postgresql_pooled": [],
        "sqlite": [],
    }
    runners = {
        "postgresql_fresh_connection": run_postgres_fresh,
        "postgresql_pooled": run_postgres_pooled,
        "sqlite": run_sqlite,
    }
    # Rotate candidate order to reduce systematic first/last position bias.
    names = list(runners)
    for trial in range(TRIALS):
        order = names[trial % len(names):] + names[:trial % len(names)]
        for name in order:
            results[name].append(runners[name](trial + 1))

    report = {
        "benchmark_type": "five_trial_serial_comparison_not_load_test",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "message_count_per_trial": MESSAGE_COUNT,
        "recipients_per_message": 2,
        "trials": TRIALS,
        "sqlite_version": sqlite3.sqlite_version,
        "postgresql_fresh_connection": {
            "aggregate_median": aggregate(results["postgresql_fresh_connection"]),
            "raw_trials": results["postgresql_fresh_connection"],
        },
        "postgresql_pooled": {
            "aggregate_median": aggregate(results["postgresql_pooled"]),
            "raw_trials": results["postgresql_pooled"],
        },
        "sqlite": {
            "aggregate_median": aggregate(results["sqlite"]),
            "raw_trials": results["sqlite"],
        },
        "methodology": [
            "each trial uses a fresh SQLite file or isolated PostgreSQL schema",
            "one serial sender and one serial dispatcher",
            "100 accepted messages and 200 outbox items per default trial",
            "adapter operation lifecycle is included in timing",
            "candidate execution order rotates between trials",
            "pooled PostgreSQL pool size is fixed at min=1 max=4",
        ],
        "limitations": [
            "SQLite uses a local file; PostgreSQL is a service container over the runner network",
            "single serial sender and dispatcher; no concurrent throughput yet",
            "pool warm-up and connection setup are not separately reported",
            "no controlled cold/warm cache or dedicated benchmark host",
            "five trials are a repeatability check, not statistical capacity certification",
            "not a production SLO or architecture decision",
        ],
    }
    output = json.dumps(report, indent=2, sort_keys=True)
    print(output)
    Path("persistence-benchmark.json").write_text(output + "\n", encoding="utf-8")
