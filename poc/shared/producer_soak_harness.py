#!/usr/bin/env python3
"""Repeatable producer-only soak for the shared durable-message PoCs."""
import argparse
import concurrent.futures
import json
import statistics
import time
import uuid

from contract_harness import percentile, request, validate_base_url


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--duration-seconds", type=int, default=30)
    parser.add_argument("--concurrency", type=int, default=16)
    args = parser.parse_args()
    validate_base_url(args.base_url)
    if not 1 <= args.duration_seconds <= 120 or not 1 <= args.concurrency <= 64:
        parser.error("duration must be 1..120 seconds and concurrency 1..64")

    started = time.monotonic()
    deadline = started + args.duration_seconds
    latencies = []
    errors = []

    def producer(worker_number):
        sequence = 0
        while time.monotonic() < deadline:
            operation = f"repeat-soak-{worker_number}-{sequence}-{uuid.uuid4()}"
            request_started = time.perf_counter()
            try:
                status, body = request(
                    args.base_url, "POST", "/v1/conversations/room-a/messages",
                    "alice", {"operation_key": operation, "payload": "repeated-capacity-soak"})
                elapsed = (time.perf_counter() - request_started) * 1000
                if status != 202:
                    errors.append(f"HTTP {status}: {body}")
                else:
                    latencies.append(elapsed)
            except Exception as error:
                errors.append(str(error))
            sequence += 1

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [executor.submit(producer, worker) for worker in range(args.concurrency)]
        for future in futures:
            future.result()

    elapsed = time.monotonic() - started
    if errors:
        raise AssertionError(f"producer soak had {len(errors)} request errors; first={errors[0]}")
    print(json.dumps({
        "soak": "PASS",
        "duration_seconds": round(elapsed, 3),
        "concurrency": args.concurrency,
        "successful_requests": len(latencies),
        "requests_per_second": round(len(latencies) / elapsed, 2),
        "p50_ms": percentile(latencies, 0.50) if latencies else None,
        "p95_ms": percentile(latencies, 0.95) if latencies else None,
        "p99_ms": percentile(latencies, 0.99) if latencies else None,
        "request_errors": len(errors),
    }, indent=2))


if __name__ == "__main__":
    main()
