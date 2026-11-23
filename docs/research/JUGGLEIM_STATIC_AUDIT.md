# JuggleIM evaluation — static audit

Date: 2026-11-23  
Status: [ВЫВОД] static source review only; runtime PoC NOT RUN.

## Repository inspected

- Upstream: https://github.com/juggleim/im-server
- Branch: `master`
- Commit inspected: `c01fa241723bfb41fa882ac62134ec5f390a9908` (2026-11-16)
- Architecture: https://github.com/juggleim/im-server/blob/master/docs/architecture.md
- API docs: https://juggle.im/docs/server/api/
- Server API quickstart: https://github.com/juggleim/im-server/blob/master/docs/server-api-quickstart.md

## Preliminary integration boundary

Proposed for evaluation only:

Jetson clients → Jetson Backend → JuggleIM Server.

Jetson Backend must remain authoritative for Jetson identity, account mapping, permissions/business rights, subscription/payment state, CRM, campaigns, consent/unsubscribe, analytics, and AI. JuggleIM may provide transport and messaging capabilities such as WebSocket sessions, private/group messaging, ACK/delivery, history/sync, and offline messaging.

Never expose JuggleIM `app_secret`, `app_secure_key`, or privileged Server API endpoints to clients. Jetson Backend must enforce authorization, consent, moderation, and business rules independently.

## Static findings requiring runtime verification

1. `services/apigateway/apis/signature.go`: request signature uses SHA1(app_secret + nonce + timestamp). In the inspected function, required fields and signature are checked, but timestamp freshness and nonce replay protection were not visible. Treat as a replay-risk test case, not proof that no other layer protects it.
2. `services/apigateway/apis/user.go`: registration accepts caller-supplied UserId and IsAdmin. Jetson must generate IM IDs server-side and keep privileged APIs internal.
3. `services/group/services/groupmsgservice.go`: API-origin group message path skips some group-membership checks. This may be intentional for trusted server API calls; Jetson Backend must enforce permissions and consent.
4. `services/commonservices/interceptors/custominterceptor.go`: callback failure/non-200/invalid response may result in Pass; API-origin messages bypass the interceptor. A callback must not be the sole enforcement point for Jetson authorization or moderation.
5. `services/commonservices/appinfocache.go`: defaults observed include TokenEffectiveMinute=0, OfflineMsgSaveTime=10, OfflineCmdMsgSaveTime=10080, HisMsgSaveDay=180. Units for offline retention fields must be confirmed. Token expiry is disabled when TokenEffectiveMinute=0.
6. `services/connectmanager/services/logincheck.go`: expiry is checked only when configured >0; user bans are checked. No explicit AppKey equality check was visible in this inspected login path, while `services/navigator/apis/checktoken.go` does check AppKey. Test this discrepancy; do not call it exploitable without proof.
7. `services/navigator/apis/checktoken.go`: checks x-appkey, x-token, AppKey in token, signature using AppSecureKey, and token expiry.
8. Upstream Docker Compose exposes API, Navigator, WebSocket, Admin, pprof, and MySQL with development defaults (including admin/123456 and MySQL password juggleim). These are local-test defaults only; isolate management/API/DB/pprof, rotate credentials, and use TLS/firewall/secret management before any deployment.
9. Upstream benchmark harness includes a smoke run: 20 clients, 50 publishes/sec, 10 seconds, Apple M2. Reported ACK/s 49.9; P95 ACK 2.37ms private / 4.54ms group; P95 delivery 8.47ms private / 35.29ms group. This is not production capacity evidence.
10. Checked LICENSE files for im-server, Android/iOS/Web SDKs, Go SDK, and jugglechat-server: Apache 2.0. Transitive dependency and all ancillary repository licensing remain unchecked; perform full SBOM/SCA/license review.

## Capability matrix — current evidence

| Capability | Current status |
|---|---|
| Private messaging | Feature appears present; runtime integration test pending |
| Groups | Feature appears present; API authorization test pending |
| Channels | Not yet proven equivalent to Jetson channel semantics |
| History | Feature present; retention and pagination need tests |
| ACK/offline/sync | Docs/source indicate support; runtime test pending |
| Multi-device | Claimed; runtime test pending |
| Attachments | Feature appears present; authorization, upload-token, URL access, malware checks pending |
| Push | Mechanism exists; provider/platform configuration not validated |
| Presence | Claimed; event semantics/load pending |
| Blocking/moderation | Partial; Jetson policy remains backend-owned |
| Authentication | Tokens supported; privileged APIs must remain server-side |
| Horizontal scaling | Community edition documented as single-process/single-node; do not assume horizontal scale |
| Licensing | Selected LICENSE files Apache 2.0; full dependency/license review pending |

## Runtime PoC blocker in the previous execution environment

- Docker was not installed.
- Installed Go was 1.23.2.
- Inspected `go.mod` requires Go 1.25.12.

Therefore no runtime Docker/Go tests were executed in that environment. Do not report the PoC as passed. Continue with a compatible isolated runtime before making a selection decision.

## Required PoC tests

- Provision clean isolated server and DB; rotate all defaults.
- Register/login/token lifecycle, expiry, revocation, logout, multi-device.
- Verify request signature timestamp freshness and nonce replay handling.
- Verify AppKey isolation and token cross-app rejection across every connection/API path.
- Attempt privilege escalation via UserId/IsAdmin and direct Server API access.
- Verify group membership, bans, mutes, block lists, and API-origin message enforcement.
- Test interceptor timeout/failure semantics.
- Test offline queue, ACK, duplicate/replay, history pagination/retention.
- Test attachment authorization, signed URLs, expiry, and cross-user access.
- Test channel semantics against Jetson requirements.
- Measure latency/throughput under representative load; document hardware, concurrency, message sizes, and error rates.
- Produce SBOM, dependency vulnerability report, and license report.

## Current conclusion

[НЕ СОГЛАСОВАНО] JuggleIM is not selected for Jetson Messenger. Static evidence is sufficient to define a focused PoC and integration boundaries, but not to approve the dependency for production.
