# Message reliability reference model

This directory contains a deliberately small, dependency-free Python reference model and executable tests for the contracts in:

- `docs/testing/MESSAGE_RELIABILITY_TEST_PLAN.md`
- `docs/testing/MESSAGE_STATE_MACHINE_CONTRACT.md`

It is **not** Jetson production code and does not select Python (or any other technology) for the product. The in-memory `Store` stands in for a durable transactional adapter; process reconstruction reuses that store to model restart over durable state. `FakeDevice` models recipient-side deduplication by stable message ID.

Run with Python 3.10+:

```sh
python -m unittest discover -s tests/reference_model -p 'test_*.py' -v
```

The suite covers commit/unknown-outcome boundaries, idempotency, concurrent submissions, retry after a worker crash, sync replay, authorization and a seeded sequence of 1,000 operations.

## Important limits

Passing these tests proves only that this reference model satisfies its own stated assertions. It does **not** prove a database transaction, message broker, network, real client, multi-device protocol, backup/restore, E2EE, production authorization, throughput or Jetson implementation is correct. Those require adapter-level integration tests and fault injection against the selected implementation.

The seeded randomized test is reproducible via seed `20261124`; it is not a statistical reliability or load test.
