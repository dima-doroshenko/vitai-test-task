# Кварта · обжарка кофе

Адаптивный учебный лендинг вымышленной мастерской, русский язык, BYN.

- Сайт: https://kvarta-minsk.pages.dev/
- Preview: https://staging.kvarta-minsk.pages.dev/
- Репозиторий: https://github.com/dima-doroshenko/vitai-test-task

## Архитектура

HTML/CSS/обычный JS → `/api/lead` → Pages Function → Service Binding →
JavaScript Worker → D1. Статика не проходит через API. Без корзины и оплаты.

**Изменение согласовано пользователем:** сначала опубликован Python/FastAPI
через pywrangler, но фактические 14–168 мс CPU превысили Free budget 10 мс.
Пользователь выбрал Free + JavaScript Worker. JS показал 0–5 мс в 27 реальных
запросах. Оплата не подключалась. Эксперимент: коммит `04cd9ea`,
[измерения Python](docs/cpu-smoke.json), [измерения JS](docs/cpu-javascript.json).

D1 хранит заявки и outbox. SQL trigger атомарно запрещает вторую заявку
с нормализованным телефоном в скользящие 600 секунд; повтор окно не
продлевает. Все SQL-запросы подготовленные, время задаёт D1 в UTC.

## Запуск

Нужны Node.js 24+, npm, uv. Сборка frontend не требуется.

```sh
npm ci
uv sync --project backend
uv run --project backend python -m http.server 4173 --directory public
```

Для работы формы локально (два терминала, локальная D1):

```sh
uv run --project backend python scripts/cloudflare.py worker d1 migrations apply kvarta-leads-preview --env preview --local
uv run --project backend python scripts/cloudflare.py worker dev --env preview
uv run --project backend python scripts/cloudflare.py pages pages dev public --env preview --service LEADS=kvarta-api-preview
```

Тесты: `npm test` (9 сценариев на Node test/sqlite). Реальные параллельные
запросы и D1: `uv run --project backend python scripts/check_remote.py`
(меняет только созданные этим скриптом тестовые записи preview).

## Публикация и секреты

Wrangler Direct Upload, не Git Integration. Публикуется только `public/`.
Конфигурации — `wrangler.jsonc` и `backend/wrangler.jsonc`, Wrangler закреплён.
Production/preview используют разные Workers и D1. Preview Telegram выключен.
Worker API не имеет публичного workers.dev URL; есть проверка окружения.

```sh
uv run --project backend python scripts/cloudflare.py worker d1 migrations apply kvarta-leads --remote
uv run --project backend python scripts/cloudflare.py worker deploy --env ''
uv run --project backend python scripts/cloudflare.py pages pages deploy public --project-name kvarta-minsk --branch main
```

Перед production: tests → preview → браузер → commit. Для preview используйте
`worker deploy --env preview` и `pages deploy ... --branch staging`.
Нужен действующий Cloudflare OAuth (`wrangler login`) или `CLOUDFLARE_API_TOKEN`.

Секреты только production Worker: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Оператор может установить их командой
`uv run --project backend python scripts/set_telegram_secrets.py` из
игнорируемого `.secrets/telegram.json`. Значения не выводятся и не коммитятся.
Переменные: `ENVIRONMENT`, `TELEGRAM_ENABLED`; bindings: `LEADS`, `DB`.

Telegram работает после записи через Cron (одна заявка за запуск раз в минуту). Атомарный lease,
максимум 5 попыток, timeout 8 секунд, backoff и retry_after. После
неоднозначного timeout возможна повторная доставка с тем же ID.

## Документация и проверки

- [Полный запуск, API-контракт, миграции и ограничения](docs/operations.md).
- [Источники и лицензии изображений, шрифтов и BY-метаданных](docs/materials.md).
- [Фактическая проверка](docs/verification.md), [D1/Telegram](docs/production-check.json).
- Lighthouse HTML/JSON: `output/lighthouse/`, параметры и медианы —
  `output/lighthouse/summary.json`. Отчёты не попадают в public.
- Исходный README пользователя сохранён: [original-readme.md](docs/original-readme.md).

Ограничения: общие квоты Cloudflare Free; диапазоны номеров требуют обновления
при смене плана нумерации; первая атрибуция живёт до конца browser session.
Реальная клавиатура телефона и превью ссылки в мессенджере не проверены.
Проверки HTML/OG, эмуляция экранов, axe и Lighthouse не равны WCAG-сертификации.
