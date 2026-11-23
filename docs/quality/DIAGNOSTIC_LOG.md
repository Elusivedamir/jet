# Журнал диагностики Jetson Messenger

Журнал сохраняет реальные ошибки, проверенные гипотезы, исправления и результаты. Неудачные попытки не удаляются.

## 2026-11-23 — JuggleIM Android PoC: цепочка подключения

**Ветка:** project/foundation-and-juggleim-poc  
**Область:** изолированный Android/JuggleIM PoC; не production.

| Этап | Наблюдение / доказательство | Вывод / действие | Статус |
|---|---|---|---|
| SDK connect parameters | Ранее SDK завершался с IllegalArgumentException: Empty key в SecretKeySpec. | Перед connect(token) добавлен setConnectParams(signKey, Collections.emptyMap()). | Исправление внесено; дальнейшая авторизация отдельно не доказана. |
| Android TLS trust | В run 45216629316 независимая транспортная проба завершилась SSLHandshakeException / CertPathValidatorException: Trust anchor for certification path not found. | Добавлен Android Network Security Config с system CA и сгенерированным PoC CA; bootstrap копирует только публичный CA в raw resource и проверяет server cert. Коммиты 06009b5, dafb1ee, 71e384d, 3805fa0. | Код внесён. Следующая диагностика показала, что TLS handshake проходит. |
| WebSocket Upgrade | В run 45218304996 TLS прошёл, но проба получила HTTP 200 вместо ожидаемого 101. | Проверка исходного кода JuggleIM показала, что фактический путь подключения — /im. Прежняя проба использовала /, поэтому её HTTP 200 не доказывал отказ WebSocket сервера. | Диагностическая гипотеза исправлена. |
| Correct WebSocket path | TransportProbe изменён: если путь не задан явно, используется /im. Коммит 7f29de1efcf5a9a70ded9b9bd24b0fa877813da9. | Проверить точный Upgrade на /im; затем отдельно SDK handshake, auth и Alice/Bob round-trip. | [НЕ ПРОВЕРЕНО] на момент записи. |
| Full E2E CI | Run 45220003331 был автоматически запущен push-триггером до отключения автоматического E2E. | С этого изменения полный эмуляторный E2E переведён на ручной workflow_dispatch. | Новый триггер закоммичен; старый уже запущенный run может завершиться отдельно. |

### Следующие обязательные действия

1. Проверить сборку/unit tests на текущем commit.
2. Запустить узкий Android transport probe на /im; требуемый результат — HTTP 101.
3. Если Upgrade прошёл — проверить SDK handshake/callbacks.
4. Затем отдельно проверить авторизацию.
5. Только после прохождения предыдущих gates запускать полный E2E Alice/Bob и подтверждать round-trip сообщения.

### Важные ограничения

- TLS handshake success не доказывает WebSocket Upgrade.
- HTTP 200 на / не доказывает неисправность /im.
- WebSocket Upgrade success не доказывает авторизацию JuggleIM.
- Успешное подключение одного клиента не доказывает обмен сообщениями между двумя клиентами.
- Ни один этап не объявляется пройденным без конкретного лога/CI результата.

## 2026-11-23 — Standalone Android build: missing generated CA resource

**CI run:** 45220003218  
**Failing step:** Build Alice and Bob debug APKs  
**Observed error:** AAPT resource linking failed: resource raw/juggle_poc_ca not found.  
**Root cause:** Network Security Config references the per-run CA resource. The standalone build/unit workflow did not run the bootstrap step that generated that resource. This was a build-pipeline dependency gap, not a TLS handshake failure.

**Fix:**
- Added deploy/juggleim-poc/scripts/prepare-android-ca-resource.sh. It generates/validates local PoC certificates, copies only the public CA certificate into Android raw resources, and verifies the server certificate and IP SAN.
- Updated bootstrap.sh to reuse the shared preparation script instead of duplicating the logic.
- Updated android-poc.yml to run the preparation script before Gradle and to trigger when that script changes.
- Private CA/server keys remain outside Android resources and APKs.

**Commits:** 7e89ef3, 092eb0f, 885d42f.  
**Verification:** In CI run 45220625174, the new “Prepare per-run Android PoC TLS trust resource” step completed successfully. APK build and unit tests are still pending/in progress; do not mark build/unit as passed until the full workflow succeeds.


## 2026-11-23 — WebSocket Upgrade rejected with HTTP 400

**CI run:** 45220003331  
**Failing stage:** independent_wss_transport_probe  
**Observed:** Android emulator completed TLS 1.3 handshake with the local Caddy endpoint, then received `HTTP/1.1 400 Bad Request` for the WebSocket request to `/im`. The server and Caddy containers started. The app had not yet begun SDK authentication. The diagnostic snapshot contains no TLS trust error and no Android application exception.

**Interpretation:** TLS trust is no longer the failing layer. The request reaches an HTTP endpoint, but the Upgrade is rejected. The prior probe discarded response headers/body, so the precise rejecting component and reason are not yet proven. Do not attribute this to JuggleIM auth or to the SDK.

**Diagnostic improvement:** `TransportProbe` now records only allowlisted response metadata (`Server`, `Content-Type`, `Content-Length`, `Sec-WebSocket-Version`) and a bounded, sanitized error-body excerpt. It sends no credentials or message content. The probe's /im path comment was also cleaned up.

**Build gate:** CI run 45220625174 completed successfully: CA resource preparation, Alice/Bob debug APK builds, unit tests, APK verification, and artifact upload all passed. Artifact: `jetson-android-poc-debug` (SHA-256 `21d8346af509341ca6aed84979ff805f04e78a25e0f245ce5f058842c544fab3`).

**Diagnostic instrumentation commits:** `a948c61062ce95221c702d425a8ad67136c50539` and `f9a3317cccba3bd712dc24120169421bcd14a792`.

**Next gate:** run the focused transport probe with the new response diagnostics, inspect the HTTP response metadata/body, and only then change the handshake request or proxy configuration. SDK handshake/auth and Alice/Bob round-trip remain unverified.


## 2026-11-23 — Transport probe runner configuration defect

**CI run:** 45222366250  
**Failing step:** Run TLS and WebSocket Upgrade probe  
**Artifact evidence:** `transport-probe.log` records:
- `PoC is not configured. No IM connection will be opened.`
- `POC_TRANSPORT_PROBE_FAILED type=IllegalArgumentException`
- `Configured endpoint is not a valid WSS URI`

**Root cause:** The isolated probe workflow built Bob APK without passing Gradle properties `juggleAppKey` and `juggleWssUrl`. `MainActivity` therefore compiled with an empty `BuildConfig.JUGGLE_WSS_URL`, and the debug-only probe was called with an empty endpoint. The emulator, CA installation, APK installation and app launch all completed; no HTTP request was sent. This run does **not** establish any server-side WebSocket failure or success.

**Fix:** Workflow build command now passes the ephemeral `JUGGLE_APP_KEY` and `JUGGLE_WSS_URL` provisioned by bootstrap as Gradle properties. The App Secret and user tokens are not passed to the probe APK. Commit: `718d09ab501d02b8f983d18396f8ee27f13fcc5c`.

**Next gate:** rerun the isolated probe. Required evidence is a TLS handshake followed by HTTP 101. If the probe still fails, inspect its bounded response metadata/body and server logs. SDK handshake/auth and Alice/Bob round-trip remain separate unverified gates.


## 2026-11-23 — Full Android E2E: clients connect, recipient callback not observed

**CI run:** 45226487329  
**Branch / commit:** `project/foundation-and-juggleim-poc` / `9dd3200a09bcb307fa8736c164e4a43ba2eec2a9`  
**Failing stage:** `wait_for:POC_MESSAGE_RECEIVED package=com.jetson.poc.bob`

**Verified from emulator diagnostics:**
- Isolated JuggleIM server and test-user provisioning completed.
- Alice and Bob APKs built successfully.
- Independent Android TLS 1.3 and WebSocket Upgrade both passed; server returned HTTP 101.
- Bob SDK connection reached `CONNECTED code=0`.
- Alice SDK connection reached `CONNECTED code=0`.
- Alice send callback returned success and emitted `POC_MESSAGE_SENT`.
- The Bob listener did not emit the expected `POC_MESSAGE_RECEIVED` marker within the test timeout.
- The captured diagnostics do not establish whether Bob's listener received a non-TextMessage, whether the server routed/stored the message, or whether the SDK callback was absent. No message body or credentials were captured.

**Conclusion:** The failure is isolated to the message-delivery/recipient-observation layer after both SDK sessions connected and Alice's send callback succeeded. Do not re-run or modify TLS/WebSocket transport based on this evidence.

**Next diagnostic change:** Add bounded, body-free metadata logging at the very start of Bob's `onMessageReceive` callback: message ID, sender ID, conversation type/ID, content type/class, and whether the content matches the synthetic expected message. This distinguishes no callback from unexpected message content/type without exposing message text or tokens.

**Instrumentation commit:** `085b5afbe0d59586b2e2b3edbf08aaca7bd603c8`.  
**Follow-up full E2E run:** `45228512866` completed and failed at the same receive marker. Its diagnostics contained no `POC_MESSAGE_RECEIVE_CALLBACK` line, so Bob's application listener was not invoked at all. This rules out only a text-comparison mismatch; it does not yet locate the loss between server routing and SDK sync.

**Status:** [НЕ ПРОЙДЕНО] end-to-end private message delivery. Transport and SDK connection gates are [ПРОЙДЕНЫ] in run 45226487329.


## 2026-11-23 — Initial JuggleIM message synchronization gate

**Source inspection:** Official Android SDK repository `juggleim/imsdk-android`, `MessageManager.java` (current master; SDK dependency in this PoC is 1.9.0). The SDK's `onMessageReceive(ConcreteMessage)` returns without dispatching ordinary incoming messages while `mSyncProcessing` is true. During initial synchronization it expects the message-sync flow to complete; the public completion signal is `IMessageManager.IMessageSyncListener.onMessageSyncComplete()`.

**Test gap identified:** The PoC E2E waited only for `ConnectionStatus.CONNECTED` before starting Alice and sending. It did not wait for Bob's initial message-history synchronization to complete. Alice's send was also triggered immediately on CONNECTED, before Alice's own sync completion.

**Change made on `project/foundation-and-juggleim-poc`:**
- Added a message-sync listener and body-free `POC_MESSAGE_SYNC_COMPLETE` marker.
- Alice now sends the synthetic message only after its own initial sync callback.
- E2E now waits for Bob's initial sync completion before starting Alice, and waits for Alice's sync completion before requiring send success.
- Added metadata-only send-request logging for recipient ID, conversation type, conversation ID and message state. No message body or credentials are logged.

**Commits:** `b622cc18ccbd67ff0690ce33c8dc3f8ab7886973`, `85267844e477e204a6a1e99eb4fa503d6e30b4c1`, `32ac66c2cda6b452a8bffd6b825d371efc1574a3`.

**Interpretation:** This is a real sequencing defect in the previous test and a plausible explanation for the missing receive callback, but it is not yet a proven root cause. The next E2E must show both sync-complete markers, then Alice send success, then Bob receive callback. If Bob still receives nothing, inspect server-side routing and message sync response next. Do not rerun TLS/WebSocket transport: this change does not affect that layer.


## 2026-11-23 — E2E sync gate not observed; CI trigger path corrected

**CI run:** 45231261826 (commit `85267844e477e204a6a1e99eb4fa503d6e30b4c1`).  
**Artifact:** `jetson-android-emulator-diagnostics-45231261826-1` (artifact ID `14845918862`).  
**Failing stage:** `wait_for:POC_MESSAGE_SENT package=com.jetson.poc.alice`.

**Verified from artifact:**
- JuggleIM server and two test users provisioned; Alice/Bob APKs built.
- Independent TLS 1.3 and WebSocket Upgrade returned HTTP 101.
- Bob and Alice both reached SDK `CONNECTED code=0`.
- Neither `POC_MESSAGE_SYNC_COMPLETE` marker appears in the captured JetsonPoC log lines.
- Alice never emitted `POC_MESSAGE_SENT`; the failure occurred before any evidence of message submission.
- The diagnostic snapshot does not contain a JuggleIM SDK exception explaining the absent sync callback. Firebase/Google Play Services authentication warnings are present but are not evidence of a JuggleIM failure.

**Interpretation:** This run does not test recipient delivery. The current blocking point is the absence of the SDK message-sync completion callback (or its observable marker) after connection. The earlier sync sequencing hypothesis remains unverified; investigate callback semantics/registration and SDK sync behavior before changing routing or transport.

**CI configuration defect found:** The E2E workflow push path filter included `.github/workflows/juggleim-e2e.yml` and `MainActivity.java`, but omitted `deploy/juggleim-poc/scripts/run-android-e2e.sh`. Therefore changes to the test script alone did not trigger E2E. Added the script to the path filter.

**Fix commit:** `cd0783822400112db08dcf386dc0d98d6662df95`.  
**New full E2E run:** `45233202404` on the corrected branch head; started and pending at time of this entry. It includes the Bob and Alice sync gates from the latest script. Do not report E2E as passed until the run emits both sync markers, Alice send success, and Bob receive success.


## 2026-11-23 — Root-cause narrowing: SDK sync callback is downstream of multiple gates

**CI run:** 45233202404, commit `cd0783822400112db08dcf386dc0d98d6662df95`.  
**Artifact:** `jetson-android-emulator-diagnostics-45233202404-1`, artifact ID `14847669744`.  
**Observed:** Bob reaches `CONNECTED code=0`; TLS and WebSocket Upgrade pass; the E2E waits 120 seconds for `POC_MESSAGE_SYNC_COMPLETE` and times out. Alice is not started.

**Important source-level correction:** Inspection of the official Android SDK's `ConnectionManager.onConnectComplete` shows the order is:
1. Set user/session and call `MessageManager.connectSuccess()`.
2. Emit the connection-complete event (the app can observe `CONNECTED`).
3. Call `MessageManager.checkAndUploadPubKey(...)`.
4. Only after that callback, call `ConversationManager.syncConversations(...)`.
5. Only after conversation sync completes, call `MessageManager.syncMessage()`.
6. Only after message-history sync completes does `IMessageSyncListener.onMessageSyncComplete()` fire.

The public sync listener is therefore **not** a direct signal that follows CONNECTED immediately. Its absence can mean the E2EE public-key upload or conversation sync has not completed; it does not by itself prove the message-history request is failing. SDK implementation references: `ConnectionManager.java` method `onConnectComplete`; `MessageManager.java` methods `checkAndUploadPubKey`, `syncMessage`, and `onMessageReceive`; `ConversationManager.java` method `internalSyncConversations`.

**Diagnostic change:** Enable verbose JuggleIM SDK console logging in the PoC using the same `JLogConfig` / `InitConfig` pattern used by the official demo. Extend the bounded failure log filter to include only relevant SDK stage tags (`MSG-Sync`, `CONV-Sync`, `MSG-UploadPubKey`, `CON-Conn`) plus existing app/TLS markers. No tokens, secrets, or message bodies are intentionally logged.

**Commits:** `0b400ebb425fbbf58aeb67b156b06e22f8d2cea8`, `fbce7f3f90209345488ec9cae098792994d23b0b`.  
**Final result for run 45235367532:** completed with `failure` (job `137905535856`). The workflow again verified Bob `CONNECTED code=0`, TLS and WebSocket `101 Switching Protocols`, then timed out after 120 seconds waiting for `POC_MESSAGE_SYNC_COMPLETE`. Alice was not started. APK builds and unit tests completed successfully before the emulator step. The diagnostics artifact was uploaded as `jetson-android-emulator-diagnostics-45235367532-1` (artifact ID `14848518615`). This confirms the blocker remains in the SDK post-connect initialization/synchronization chain; it does not prove which internal request is stuck.


## 2026-11-23 — SDK post-connect blocker identified: unsupported public-key upload topic

**CI run:** 45235367532; job 137905535856; diagnostics artifact 14848518615.  
**New evidence from the full emulator artifact:**
- Bob reaches `CONNECTED code=0` and the independent TLS 1.3 / WebSocket HTTP 101 probe passes.
- Immediately after CONNECTED, SDK logs repeatedly report `[JLogger:MSG-UploadPubKey] error, code is 11013`.
- No conversation-sync or message-sync completion follows; the test times out waiting for Bob's `POC_MESSAGE_SYNC_COMPLETE`.
- The emulator is also reported `offline` by ADB at the end of the run. ADB instability is real, but it does not explain away the repeated protocol-level 11013 response observed while the app was running.

**Root cause evidence (source inspection):**
- In the official Android SDK, `ConnectionManager.onConnectComplete` calls `MessageManager.checkAndUploadPubKey(...)` before conversation sync and message-history sync.
- When E2EE is enabled and no keypair is cached, `checkAndUploadPubKey` sends `uploadPubKey(...)`; its completion callback is the gate that starts conversation sync. On error, the SDK retries and does not advance the callback.
- The exact pinned JuggleIM server source commit used by this PoC is `471425fe0acfa0f9658e62eff69a3ba5bb622515`. In that source, error code `11013` is `IMErrorCode_CONNECT_UNSUPPORTEDTOPIC`. The server's publish-topic fallback returns that code for an unsupported topic.
- The SDK's `PBData.uploadPubKey` sends the query topic `upload_pubkey` (paired with `batch_qry_pubkeys` for lookup). The pinned server source tree contains no public-key/E2EE topic implementation; its unsupported-topic fallback returns 11013. The repository's current upstream `master` resolves to the same server commit SHA, so there is no newer upstream server revision available in that repository at this check. The SDK's `upload_pubkey` request therefore receives the server's unsupported-topic response, leaving the SDK permanently before conversation/message sync. This is a concrete SDK/server protocol compatibility mismatch, not a TLS, WebSocket, user-token, or Alice/Bob message-routing failure.

**Status:** Root cause for the current sync gate is identified with high confidence from the paired SDK and pinned-server source paths. Do not weaken the E2E by skipping the key-upload gate, and do not disable E2EE merely to make the test green.

**Next narrow action:**
1. Check the current upstream JuggleIM server revision for support for the SDK's public-key upload topic and identify the earliest compatible server commit/release.
2. Compare that revision against the pinned commit, review its migration/configuration implications, and update the PoC pin only if compatibility is confirmed.
3. Add a small compatibility regression check that confirms the server accepts the SDK's public-key upload before running the full Android E2E.
4. Keep emulator/ADB reliability as a separate follow-up; do not conflate it with the 11013 protocol failure.

**Security:** No tokens, AppSecret values, public-key bytes, or message bodies were added to this entry.


## 2026-11-23 — JuggleIM protocol incompatibility follow-up (isolated agent run)

**Branch:** `agent/klinch-45250374246`.

**Reported evidence rechecked in this checkout:** the prior entry documents the emulator result (`CONNECTED`, successful TLS/WebSocket 101, then repeated `MSG-UploadPubKey` code `11013`) and its earlier source analysis: SDK topics `upload_pubkey` / `batch_qry_pubkeys`, server error `CONNECT_UNSUPPORTEDTOPIC`, and no corresponding server handlers at pin `471425fe0acfa0f9658e62eff69a3ba5bb622515`. This checkout contains no JuggleIM server source or SDK source files/artifacts with which to independently re-open those handlers. Thus these protocol claims remain grounded in the documented prior inspection and runtime artifact, not a fresh source verification in this run.

**Investigation blocker:** outbound GitHub access failed DNS resolution for `github.com` / `raw.githubusercontent.com`; no compatible server revision could be checked. No local server checkout/cache was present. The precise SDK payload/schema and server-side request tests could not be independently verified here.

**Smallest proven cause:** the previous runtime evidence places failure after transport and at the public-key upload stage, with an explicit unsupported-topic response. The exact topic-to-error mapping is recorded by prior source inspection but could not be reproduced from source in this isolated checkout. No safe runtime fix or compatible server pin is therefore proven by this run. E2EE remains enabled and no protocol gate was bypassed.

**Checks:** `gradle --no-daemon --stacktrace :app:assembleAliceDebug :app:assembleBobDebug :app:testAliceDebugUnitTest :app:testBobDebugUnitTest` failed before project configuration: Gradle could not load `libnative-platform.so` while initializing native services. Available environment is Gradle 9.9.1 / JDK 25, not the configured CI Gradle 8.7 / JDK 17 toolchain. Full Android E2E was not run.

**Outcome / remaining risk:** no runtime code or focused test was added because the protocol contract and compatible server revision could not be verified. Next required evidence is accessible pinned SDK and server source (or immutable source archives) plus server request tests/compatible release history; then add a narrow compatibility test before changing the pin. No credentials, key material, or message bodies are recorded here.
