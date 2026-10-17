# Кварта · обжарка кофе

Адаптивный учебный лендинг вымышленной мастерской, русский язык, BYN.

- Сайт: https://kvarta-minsk.pages.dev/
- Изолированное preview: https://staging.kvarta-minsk.pages.dev/
- Репозиторий: https://github.com/dima-doroshenko/vitai-test-task

## Архитектура

Статические HTML/CSS/ES modules → `/api/lead` → Pages Function
`functions/api/lead.js` → Service Binding `LEADS` → JS Worker
`backend/src/worker.js` → D1 `DB`. Статика не вызывает Worker.

Изначально опубликован и проверен Python/FastAPI ASGI Worker через актуальный
pywrangler. Фактический CPU 14–168 мс превысил Free budget 10 мс. После
отдельного согласования пользователь выбрал **Free + JavaScript Worker**.
Архитектура изменена с разрешения, платный тариф не подключался.
Эксперимент воспроизводим из коммита `04cd9ea`; измерения —
`docs/cpu-smoke.json`, JS — `docs/cpu-javascript.json`.

D1 выбрана для долговременных заявок, атомарной защиты и outbox без
дополнительной инфраструктуры. `BEFORE INSERT` trigger и индекс `(phone,
created_at DESC)` атомарно пропускают только одну заявку с номером за
скользящие 600 секунд. Повтор не обновляет время. В 600 секунд новая заявка
допустима. Время задаётся D1 `unixepoch()` в UTC, не браузером.

## Запуск и проверки

Нужны Node.js 24+, npm, uv. Frontend без сборки, внешних runtime-зависимостей
и фреймворков. CLI Wrangler закреплён `4.151.1`, lock-файлы в репозитории.
Команды из корня:

```sh
npm ci
uv sync --project backend
uv run --project backend python -m http.server 4173 --directory public
```

Этот сервер показывает только статику: для формы нужны локальные Workers.
В двух терминалах:

```sh
uv run --project backend python scripts/cloudflare.py worker dev --env preview
uv run --project backend python scripts/cloudflare.py pages pages dev public --env preview --service LEADS=kvarta-api-preview
```

Локальная D1 не является рабочей D1. Сначала применить локальную миграцию:

```sh
uv run --project backend python scripts/cloudflare.py worker d1 migrations apply kvarta-leads-preview --env preview --local
uv run --project backend python -c "import subprocess; raise SystemExit(subprocess.call(['npm','test']))"
```

Тесты используют Node `node:test` и встроенный `node:sqlite`, управляют
временем только в тестовой БД. Проверяются номера BY, поля и лимиты,
скользящее окно, повторы, атрибуция, сбои D1/сети, outbox, timeout, 429,
lease и ограничение попыток. Параллельность настоящей D1 дополнительно
проверена через 20 одновременных HTTPS-запросов.

```sh
uv run --project backend python scripts/check_remote.py
```

Последняя команда меняет **только явно созданные тестовые записи preview**,
включая их время, и не отправляет Telegram. Никакого публичного bypass нет.
Для authenticated D1 проверок нужен Cloudflare OAuth Wrangler или API token.
`scripts/cf_api.py` на macOS читает защищённую конфигурацию Wrangler;
на других ОС используйте `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`.

## Контракт формы

`POST /api/lead`, `Content-Type: application/json`, не более 8192 байт.

```json
{
  "name": "Имя, 1–80 символов",
  "phone": "+375 29 491-19-11",
  "interest": "subscription",
  "comment": "Необязательно, до 1000 символов",
  "context": "Необязательно, до 120 символов",
  "website": "",
  "attribution": {
    "first": {"utm_source": "instagram", "entry_url": "https://kvarta-minsk.pages.dev/"},
    "current": {"utm_source": "yandex"},
    "submission_url": "https://kvarta-minsk.pages.dev/"
  }
}
```

`interest`: `subscription | order | question`.

| HTTP | code | Значение |
| --- | --- | --- |
| 201 | accepted | `{ok:true,code:"accepted",id:"…"}`; сохранено независимо от Telegram |
| 409 | duplicate | Только `{ok:false,code:"duplicate"}`, без данных прошлой заявки |
| 422 | validation_error | `{ok:false,code:"validation_error",fields:{phone:"…"}}` |
| 400 | invalid_json | Повреждённый JSON/UTF-8 |
| 413 / 415 | body_too_large / json_required | Лимит тела / неправильный тип |
| 403 / 405 | origin_rejected / method_not_allowed | Межсайтовая отправка / метод |
| 503 | unavailable / environment_mismatch | Повторить с теми же данными |

Проверка номера общая для браузера и Worker: подмножество актуальных
BY-метаданных libphonenumber (мобильные, стационарные, VoIP). Поддерживаются
`+375`, `375`, `8 0`, `0`, `8` и 9-значная национальная запись. В БД только
`+375…`; длина и допустимые диапазоны проверяются, существование номера нет.

Первая атрибуция хранится в sessionStorage; текущий рекламный переход
фиксируется отдельно. Оба передаются в D1 и Telegram. Только пять `utm_*`,
`yclid/fbclid/gclid` (до 180 символов), очищенные URL входа, отправки и
referrer (до 600). Произвольные query/hash и URL credentials отбрасываются.
Имя и телефон не хранятся в browser storage. Honeypot, same-origin checks,
лимит тела и дедупликация — простая защита; против целевой bot-атаки
понадобится дополнительное ограничение запросов.

## Окружения, секреты и публикация

| | Production | Preview |
| --- | --- | --- |
| Worker | kvarta-api | kvarta-api-preview |
| D1 | kvarta-leads | kvarta-leads-preview |
| Telegram | включён | выключен, секреты не установлены |

Публичные `workers.dev` и preview URL API выключены. Worker дополнительно
сверяет окружение, переданное доверенным прокси: перепутанная привязка
не должна записать preview-заявку в production.

Секреты Worker: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; значения никогда не
попадают в frontend/Git/логи. Игнорируемый `.secrets/telegram.json` может
использоваться оператором для `uv run --project backend python scripts/set_telegram_secrets.py`.
CLI также поддерживает обычный `wrangler secret put`.

Конфигурация хранится в двух `wrangler.jsonc`; IDs D1 не секреты.
Миграции и публикация:

```sh
uv run --project backend python scripts/cloudflare.py worker d1 migrations apply kvarta-leads-preview --env preview --remote
uv run --project backend python scripts/cloudflare.py worker deploy --env preview
uv run --project backend python scripts/cloudflare.py pages pages deploy public --project-name kvarta-minsk --branch staging

uv run --project backend python scripts/cloudflare.py worker d1 migrations apply kvarta-leads --remote
uv run --project backend python scripts/cloudflare.py worker deploy --env ''
uv run --project backend python scripts/cloudflare.py pages pages deploy public --project-name kvarta-minsk --branch main
```

Проект создан в режиме **Direct Upload**, не Git Integration. Это даёт
воспроизводимую публикацию Pages Functions через CLI; папка public — весь
публичный артефакт. Документация, тесты, данные, секреты и отчёты вне её.
Обновление: tests → preview → браузер → commit → Worker/Pages production →
удалённая проверка. Preview Pages автоматически получает noindex.

## Telegram

Заявка сама является outbox-записью. HTTP 201 возвращается после D1, доставка
выполняется Cron каждую минуту, по одной pending-записи за запуск. Это
отделяет CPU приёма от доставки. В Cron используется `waitUntil`.
Атомарный lease на 60 секунд предотвращает параллельные отправки.
Не более 5 попыток, timeout 8 секунд, exponential backoff и `retry_after`
при 429. Постоянные 4xx помечаются failed, повторы формы не создают outbox.
В уведомлении ID, UTC, все поля и атрибуция; длинное сообщение уходит как
документ без потери метаданных. При неоднозначном timeout возможен дубль
доставки с тем же ID. Строго exactly-once не обещается.

Данные заявок и исключения с PII не логируются. Cloudflare persisted logs
выключены; CPU собирался временным tail. Публичного списка заявок нет.

## Материалы и фактическая проверка

Источники и лицензии: `docs/materials.md`. Исходный пользовательский README
сохранён в `docs/original-readme.md`. Технический план и источники Cloudflare:
`docs/implementation.md`. Результаты: `docs/remote-check.json`,
`docs/production-check.json`, `docs/verification.md`.

Lighthouse HTML/JSON: `output/lighthouse/`. Итоговые условия, версия и
медианы — `output/lighthouse/summary.json` и `docs/verification.md`.
Три финальных mobile измерения и desktop относятся к публичному HTTPS,
а не локальному серверу. Команда:

```sh
node node_modules/lighthouse/cli/index.js https://kvarta-minsk.pages.dev/ --output html --output json --output-path output/lighthouse/mobile-1 --chrome-flags='--headless' --only-categories=performance,accessibility,best-practices,seo
```

Ограничения: бесплатные общие квоты аккаунта, шаблон номера требует
обновления при смене плана нумерации, sessionStorage сбрасывается после
сессии. Автоматический axe/Lighthouse и ручная клавиатура не являются
сертификацией WCAG. Реальная экранная клавиатура телефона и фактическое
превью ссылки в мессенджере отдельно не проверены; HTTP/HTML/OG-картинка
проверены. Форма не является оплатой или заказом: детали уточняет менеджер.
