#!/usr/bin/env python3
"""Same black-box HTTP/SSE contract and five-round latency probe for all PoCs."""
import argparse
import concurrent.futures
import http.client
import json
import platform
import statistics
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
        raise ValueError("base URL must be an http(s) origin without credentials, path, query or fragment")
    try:
        _ = parsed.port
    except ValueError as error:
        raise ValueError("base URL contains an invalid port") from error
    return parsed


def request(base, method, path, account, payload=None):
    parsed = validate_base_url(base)
    data = None if payload is None else json.dumps(payload).encode()
    connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_type(parsed.hostname, parsed.port, timeout=15)
    try:
        connection.request(
            method,
            path,
            body=data,
            headers={"X-Test-Account": account, "Content-Type": "application/json"},
        )
        response = connection.getresponse()
        raw = response.read()
        if not raw:
            return response.status, None
        try:
            return response.status, json.loads(raw)
        except json.JSONDecodeError:
            return response.status, raw.decode("utf-8", errors="replace")
    finally:
        connection.close()


def sse_event(base, conversation, after, timeout=12, use_last_event_id=False):
    parsed = urllib.parse.urlsplit(base)
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=timeout)
    path = f"/v1/conversations/{conversation}/events?after={after}"
    headers = {"X-Test-Account": "bob", "Accept": "text/event-stream"}
    if use_last_event_id:
        path = f"/v1/conversations/{conversation}/events?after=0"
        headers["Last-Event-ID"] = str(after)
    conn.request("GET", path, headers=headers)
    response = conn.getresponse()
    if response.status != 200:
        raise AssertionError(f"SSE returned HTTP {response.status}")
    data = None
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            line = response.readline()
            if not line:
                break
            if line.startswith(b"data: "):
                data = json.loads(line[6:])
                break
    finally:
        conn.close()
    if data is None:
        raise AssertionError("SSE did not deliver a message before timeout")
    return data


def reconnect_has_no_duplicate(base, conversation, after, consumed_message_id):
    parsed = urllib.parse.urlsplit(base)
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=2)
    conn.request("GET", f"/v1/conversations/{conversation}/events?after={after}",
                 headers={"X-Test-Account": "bob", "Accept": "text/event-stream"})
    response = conn.getresponse()
    if response.status != 200:
        raise AssertionError(f"SSE reconnect returned HTTP {response.status}")
    deadline = time.monotonic() + 1.7
    duplicate = False
    try:
        while time.monotonic() < deadline:
            try:
                line = response.readline()
            except TimeoutError:
                break
            if not line:
                break
            if line.startswith(b"data: "):
                event = json.loads(line[6:])
                duplicate = event["message_id"] == consumed_message_id
                break
    finally:
        conn.close()
    if duplicate:
        raise AssertionError("reconnect cursor replayed an already-consumed message")


def percentile(values, p):
    ordered = sorted(values)
    index = max(0, min(len(ordered)-1, int((len(ordered)-1)*p)))
    return round(ordered[index], 3)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--rounds", type=int, default=5)
    parser.add_argument("--per-round", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=16)
    parser.add_argument("--concurrent-requests", type=int, default=200)
    parser.add_argument("--concurrent-rounds", type=int, default=3)
    parser.add_argument("--soak-seconds", type=int, default=30)
    parser.add_argument("--soak-concurrency", type=int, default=16)
    args = parser.parse_args()
    base = args.base_url
    validate_base_url(base)
    conversation = "room-a"

    # Idempotency and post-commit acceptance.
    key = "contract-" + str(uuid.uuid4())
    status, first = request(base, "POST", f"/v1/conversations/{conversation}/messages",
                            "alice", {"operation_key": key, "payload": "contract-check"})
    assert status == 202, (status, first)
    status, retry = request(base, "POST", f"/v1/conversations/{conversation}/messages",
                            "alice", {"operation_key": key, "payload": "contract-check"})
    assert status == 202 and retry["message_id"] == first["message_id"], (status, retry)
    status, _ = request(base, "POST", f"/v1/conversations/{conversation}/messages",
                        "alice", {"operation_key": key, "payload": "changed"})
    assert status == 409, f"changed payload should conflict, got {status}"

    # Concurrent retries must converge to one logical message.
    parallel_key = "parallel-" + str(uuid.uuid4())
    def send_parallel(_):
        return request(base, "POST", f"/v1/conversations/{conversation}/messages",
                       "alice", {"operation_key": parallel_key, "payload": "same"})
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        results = list(executor.map(send_parallel, range(12)))
    assert all(status == 202 for status, _ in results), results
    assert len({body["message_id"] for _, body in results}) == 1, results

    # Membership isolation and cursor validation.
    status, _ = request(base, "GET", f"/v1/conversations/{conversation}/messages?after=0",
                        "mallory")
    assert status == 403, f"non-member history should be forbidden, got {status}"
    status, _ = request(base, "GET", f"/v1/conversations/{conversation}/messages?after=-1",
                        "alice")
    assert status == 400, f"negative history cursor should be rejected, got {status}"
    status, _ = request(base, "GET", f"/v1/conversations/{conversation}/events?after=-1",
                        "bob")
    assert status == 400, f"negative SSE cursor should be rejected, got {status}"

    # A recipient sees a durable inbox item, acknowledges it, and resumes after its cursor.
    event = sse_event(base, conversation, 0)
    status, _ = request(base, "POST", f"/v1/messages/{event['message_id']}/ack", "bob", {})
    assert status == 204, f"recipient acknowledgement returned {status}"
    status, _ = request(base, "POST", f"/v1/messages/{event['message_id']}/ack", "bob", {})
    assert status == 204, f"repeated acknowledgement should be idempotent, got {status}"
    resumed = sse_event(base, conversation, int(event["position"]), use_last_event_id=True)
    assert int(resumed["position"]) > int(event["position"]), "Last-Event-ID did not resume after the supplied cursor"
    status, _ = request(base, "POST", f"/v1/messages/{resumed['message_id']}/ack", "bob", {})
    assert status == 204, f"resumed recipient acknowledgement returned {status}"
    reconnect_has_no_duplicate(base, conversation, int(event["position"]), event["message_id"])

    # Five independent sequential request-latency rounds; no capacity claim is made.
    benchmark = []
    for round_no in range(args.rounds):
        latencies = []
        for i in range(args.per_round):
            op = f"bench-{round_no}-{i}-{uuid.uuid4()}"
            started = time.perf_counter()
            status, body = request(base, "POST", f"/v1/conversations/{conversation}/messages",
                                   "alice", {"operation_key": op, "payload": "benchmark"})
            elapsed = (time.perf_counter() - started) * 1000
            if status != 202:
                raise AssertionError(f"benchmark send failed: HTTP {status}, {body}")
            latencies.append(elapsed)
        benchmark.append({
            "round": round_no + 1,
            "requests": len(latencies),
            "p50_ms": percentile(latencies, 0.50),
            "p95_ms": percentile(latencies, 0.95),
            "p99_ms": percentile(latencies, 0.99),
            "mean_ms": round(statistics.mean(latencies), 3),
        })

    # Repeat the same concurrent write workload to reduce hosted-runner noise.
    concurrent_probes = []
    for round_number in range(1, args.concurrent_rounds + 1):
        concurrent_latencies = []
        concurrent_started = time.perf_counter()
        def send_benchmark(index):
            op = f"concurrent-{round_number}-{index}-{uuid.uuid4()}"
            started = time.perf_counter()
            status, body = request(base, "POST", f"/v1/conversations/{conversation}/messages",
                                   "alice", {"operation_key": op, "payload": "concurrent-benchmark"})
            elapsed = (time.perf_counter() - started) * 1000
            if status != 202:
                raise AssertionError(f"concurrent benchmark send failed: HTTP {status}, {body}")
            return elapsed
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            concurrent_latencies = list(executor.map(send_benchmark, range(args.concurrent_requests)))
        concurrent_elapsed = time.perf_counter() - concurrent_started
        concurrent_probes.append({
            "round": round_number,
            "requests": len(concurrent_latencies),
            "concurrency": args.concurrency,
            "elapsed_seconds": round(concurrent_elapsed, 3),
            "requests_per_second": round(len(concurrent_latencies) / concurrent_elapsed, 2),
            "p50_ms": percentile(concurrent_latencies, 0.50),
            "p95_ms": percentile(concurrent_latencies, 0.95),
            "p99_ms": percentile(concurrent_latencies, 0.99),
            "mean_ms": round(statistics.mean(concurrent_latencies), 3),
        })
    concurrent_summary = {
        "rounds": args.concurrent_rounds,
        "requests_per_round": args.concurrent_requests,
        "concurrency": args.concurrency,
        "median_requests_per_second": round(statistics.median(x["requests_per_second"] for x in concurrent_probes), 2),
        "median_p50_ms": round(statistics.median(x["p50_ms"] for x in concurrent_probes), 3),
        "median_p95_ms": round(statistics.median(x["p95_ms"] for x in concurrent_probes), 3),
        "median_p99_ms": round(statistics.median(x["p99_ms"] for x in concurrent_probes), 3),
        "runs": concurrent_probes,
    }

    # Short sustained-write soak after the repeatable microbenchmark.
    soak_started = time.monotonic()
    soak_deadline = soak_started + args.soak_seconds
    soak_latencies = []
    soak_errors = []
    def soak_worker(worker_number):
        sequence = 0
        while time.monotonic() < soak_deadline:
            operation = f"soak-{worker_number}-{sequence}-{uuid.uuid4()}"
            started = time.perf_counter()
            try:
                status, body = request(base, "POST", f"/v1/conversations/{conversation}/messages",
                                       "alice", {"operation_key": operation, "payload": "sustained-soak"})
                elapsed_ms = (time.perf_counter() - started) * 1000
                if status != 202:
                    soak_errors.append(f"HTTP {status}: {body}")
                else:
                    soak_latencies.append(elapsed_ms)
            except Exception as error:
                soak_errors.append(str(error))
            sequence += 1
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.soak_concurrency) as executor:
        futures = [executor.submit(soak_worker, worker) for worker in range(args.soak_concurrency)]
        for future in futures:
            future.result()
    soak_elapsed = time.monotonic() - soak_started
    if soak_errors:
        raise AssertionError(f"sustained soak had {len(soak_errors)} request errors; first={soak_errors[0]}")
    sustained_soak = {
        "duration_seconds": round(soak_elapsed, 3),
        "concurrency": args.soak_concurrency,
        "successful_requests": len(soak_latencies),
        "requests_per_second": round(len(soak_latencies) / soak_elapsed, 2),
        "p50_ms": percentile(soak_latencies, 0.50) if soak_latencies else None,
        "p95_ms": percentile(soak_latencies, 0.95) if soak_latencies else None,
        "p99_ms": percentile(soak_latencies, 0.99) if soak_latencies else None,
        "request_errors": len(soak_errors),
    }

    print(json.dumps({
        "contract": "PASS",
        "candidate": base,
        "runtime_environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "logical_cpus": __import__("os").cpu_count(),
        },
        "sequential_rounds": benchmark,
        "concurrent_write_probe": concurrent_summary,
        "sustained_soak": sustained_soak,
        "note": "Same CI runner class and workload intent, but separate hosted runners introduce noise. The short soak is not a production capacity or SLO claim.",
    }, indent=2))


if __name__ == "__main__":
    main()
