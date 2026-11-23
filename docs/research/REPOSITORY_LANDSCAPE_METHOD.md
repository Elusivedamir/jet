# Jetson repository landscape — research method

## Purpose

Learn from a broad body of public engineering work without treating any repository as Jetson's template or foundation. The discovery target is at least 1,000 candidate names, followed by evidence-based screening and deep inspection of a smaller shortlist. A raw search result is not counted as screened.

## Research tiers

| Tier | Target | Work | Output |
|---|---:|---|---|
| Discovery | At least 1,000 candidate names | Search by capability/category; capture URL, purpose and basic metadata | Candidate index |
| Screening | About 100 | Activity, license, maintainers, architecture, tests, security, docs, deployment | Scored shortlist with evidence |
| Deep review | 20–50 | Source and test inspection, failure paths, threat model, data model, reproducibility | Technical review dossiers |
| Synthesis | All shortlisted themes | Compare patterns, anti-patterns, gaps and trade-offs | Neutral pattern catalogue |
| Decision | Only after synthesis | Compare options against Jetson requirements and PoCs | ADRs, including rejected options |

Targets are research goals, not claims of completed inspection. Initial discovery has produced 1,185 unique repository names across two search batches. The first selected deep-dive comparison now covers six backends; see the linked progress files below. These counts do not mean all 1,185 have been screened. Report the actual number found, screened and deeply reviewed. If search coverage or rate limits prevent reaching a target, state the limitation rather than padding the count.

## Capability map

1. Messaging: direct, group, channels, threads, delivery/read state, ordering and history.
2. Protocols and server designs: client/server contracts, realtime transports, federation and interoperability.
3. Offline-first and synchronization: cursors, conflict resolution, multi-device, reconnect and local storage.
4. Identity and security: registration, authentication, sessions, devices, authorization, abuse and recovery.
5. E2EE and cryptographic lifecycle: protocol implementations, key verification, group membership, revocation and backup.
6. Media: uploads, downloads, access control, transcoding, storage and encrypted attachments.
7. Push and background execution: delivery, retries, idempotency, queues, scheduling and reconciliation.
8. Business features: CRM, contact history, consent, segmentation, campaigns, templates and reports.
9. Analytics: event definitions, attribution, KPI formulas and data pipelines.
10. Billing: trials, entitlements, renewals, cancellation, refunds and payment failure.
11. Reliability: state machines, transactional outbox/inbox, race protection, recovery and disaster testing.
12. Operations: observability, deployment, scaling, backups, incident response and cost.
13. Client UX: Android/iOS/web/desktop, accessibility, responsive design and design systems.
14. Quality: test architecture, CI, fuzzing, security scanning, release provenance and dependency management.

## Candidate record template

For every repository capture:
- project name, URL, owner, exact commit/tag and date reviewed;
- capability category and reason for inclusion;
- license, copyright and code-reuse constraints;
- current maintenance/release activity;
- primary languages/frameworks as observed facts;
- architecture and component boundaries;
- protocol/API and data model;
- auth, privacy and security model;
- tests, CI and reproducibility;
- deployment and operations;
- documented incidents, advisories and recurring issue themes;
- measured performance vs claimed performance;
- strengths, weaknesses, anti-patterns and missing capabilities;
- ideas/patterns worth testing in Jetson;
- what must not be copied;
- relevance to each approved Jetson requirement;
- confidence and unresolved unknowns.

## Evaluation principles

- Popularity is not quality. Stars are metadata, not an acceptance criterion.
- A README claim is not proof. Prefer source, tests, release history, security advisories and reproducible measurements.
- Distinguish maintained upstream projects from abandoned forks.
- Check the license before considering source reuse.
- Do not assume a project that is good at chat is also good at identity, CRM, billing or operations.
- Compare multiple independent implementations for every important pattern.
- Include failed projects and documented incidents to learn what not to do.
- Avoid choosing a stack before requirements and comparative research.
- Any adopted pattern must be justified independently; no repository is adopted wholesale.

## Current progress (2026-11-23)

- [Consolidated discovery index](CONSOLIDATED_DISCOVERY_INDEX.md): 1,185 unique names from two batches.
- [Batch 01](candidate-catalogue-batch-01.md) and [batch 02](candidate-catalogue-batch-02.md): raw search-result catalogues.
- [Initial README screening](INITIAL_README_SCREENING.md): first selected-project reading pass.
- [Repository metadata screening](REPOSITORY_METADATA_SCREENING.md): GitHub metadata for 20 repositories.
- [Deep-dive backend comparison 01](DEEP_DIVE_BACKEND_COMPARISON_01.md): six backend projects, with deployment, license, security-policy and test-structure evidence.
- [Deep-dive message delivery 02](DEEP_DIVE_MESSAGE_DELIVERY_02.md): source-level traces of persistence, ordering, queue acknowledgement, offline history and reconnect behavior in four projects.
- [Candidate scorecard template](CANDIDATE_SCORECARD_TEMPLATE.md): neutral, unweighted evidence matrix.

## Initial research outputs

- searchable candidate index;
- shortlist and scoring rubric;
- deep-review dossiers;
- capability-by-capability comparison matrix;
- pattern/anti-pattern catalogue;
- unresolved questions;
- candidate PoC matrix with common acceptance tests.

## Named prior projects

JuggleIM, Matrix, Chatwoot, Zulip and LansetSpBot may be included if relevant. They receive no privileged status and are not presumed to be candidates for adoption. Their inclusion does not prejudge the result.
