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
