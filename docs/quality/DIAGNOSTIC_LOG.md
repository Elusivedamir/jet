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
