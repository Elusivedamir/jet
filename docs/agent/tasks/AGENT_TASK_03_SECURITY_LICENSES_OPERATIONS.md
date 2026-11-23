# Agent task 03 — security, licensing, maintenance and operating-cost evidence

**Mode:** research only. Do not implement or select a technology.

## Authority and constraints
Read the current master prompt, verified business-plan baseline, product requirements and repository evaluation criteria first. Jetson is greenfield and technology-neutral. Existing projects are evidence sources, not a prescribed stack. Do not alter product requirements, choose a final stack, or edit application code. Do not change `main`.

## Research assignment
Conduct a comparative diligence pass on:
- SimpleX Chat (`simplex-chat/simplex-chat`)
- Zulip (`zulip/zulip`)
- Mattermost (`mattermost/mattermost`)
- Rocket.Chat (`RocketChat/Rocket.Chat`)
- Signal Server (`signalapp/Signal-Server`)
- Fluxer (`fluxerapp/fluxer`)
- OpenIM Server (`OpenIMSDK/Open-IM-Server`)
- Tinode (`tinode/chat`)

For every project inspect:
1. License at repository root AND nested enterprise/edition directories; identify code, assets, dependencies and generated binaries separately. Do not summarize mixed licensing as a single badge.
2. Security policy, disclosure channel, advisories/CVEs and response evidence.
3. Release cadence, last meaningful release, commit activity, maintainers, contributor concentration, unresolved issues/PRs where accessible.
4. CI/test coverage signals and whether they are reproducible.
5. Deployment dependencies, backup/restore, upgrade/migration process, observability and operational burden.
6. Performance claims: identify exact workload, date, hardware, methodology and independent vs vendor source. No generic throughput claims.
7. Data export/migration and lock-in.
8. Third-party independent repository health scores only if the individual project page, date and methodology are verifiable. Record provider scores separately; never invent a score and never mix unlike rating systems.

## Cost lens
Do not fabricate cloud bills. Instead identify cost drivers and what would need measurement:
- messages/storage/attachments;
- online connection fanout and push;
- queue throughput and retention;
- CRM and campaign audience size;
- analytics event volume and retention;
- AI requests/tokens;
- backups, monitoring, support and on-call.
Suggest a reproducible cost-model worksheet and the workload inputs needed for a future estimate.

## Deliverable
Create `docs/research/AGENT_REPORT_SECURITY_LICENSES_OPERATIONS.md`:
- exact reviewed commit SHAs and review date;
- license boundary matrix with source file/path evidence;
- security policy/advisory table;
- maintenance/release health table;
- operational dependency matrix;
- benchmark/throughput claim audit;
- cost-driver model (no invented prices);
- third-party grades only when verified;
- non-compensable gate results (Pass/Fail/Unknown);
- Jetson-specific implications and further checks.

Do not execute destructive actions, do not claim a security audit, and do not treat popularity as quality.
