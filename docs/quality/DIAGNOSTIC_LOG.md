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
**Follow-up full E2E run:** `45228512866` (queued at time of this entry); its result will determine the next narrow investigation. Build/unit run: `45228511324` (queued).  
**Status:** [НЕ ПРОЙДЕНО] end-to-end private message delivery. Transport and SDK connection gates are [ПРОЙДЕНЫ] in run 45226487329.
