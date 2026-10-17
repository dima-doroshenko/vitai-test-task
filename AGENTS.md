# Работа с проектом

## Устройство

- Учебный русскоязычный лендинг «Кварта», Минск, цены в BYN. Корзины и оплаты нет.
- Production: https://kvarta-minsk.pages.dev/; preview: https://staging.kvarta-minsk.pages.dev/.
- `public/` — HTML/CSS/ES modules и локальные WebP/WOFF2, без сборки и runtime-зависимостей.
- `/api/lead` → `functions/api/lead.js` → Service Binding `LEADS` → `backend/src/worker.js` → D1 `DB`. Статика не вызывает Worker.
- Backend работает на JavaScript. Python/FastAPI был удалён после превышения CPU-бюджета Free; не возвращайте старые зависимости. Python 3.11+ нужен только операторским скриптам, им достаточно стандартной библиотеки.
- `README.md` описывает результат и процесс работы с ИИ; технические инструкции поддерживайте здесь. Источники материалов и лицензии находятся в `docs/`.

## Установка и локальный запуск

Нужны Node.js 24+, npm; Python 3.11+ — для служебных скриптов (`python3` должен указывать на эту версию или новее, системный Python 3.9 не подходит). Wrangler закреплён в `package-lock.json`.
Все команды выполняются из корня репозитория.

```sh
npm ci
npm test
python3 -m http.server 4173 --directory public
```

HTTP-сервер показывает только статику. Для формы сначала примените локальную миграцию:

```sh
npx wrangler --cwd backend d1 migrations apply kvarta-leads-preview --env preview --local
```

Затем запустите Worker и Pages в отдельных терминалах:

```sh
npx wrangler --cwd backend dev --env preview
```

```sh
npx wrangler pages dev public --env preview --service LEADS=kvarta-api-preview
```

## Контракт и инварианты

- `POST /api/lead`, JSON до 8192 байт. Обязательные поля: `name` (1–80 символов), `phone`, `interest` (`subscription | order | question`). Необязательные: `comment` (до 1000), `context` (до 120), `attribution`. Honeypot `website` должен быть пустым.
- `201 accepted` означает сохранение в D1, независимо от Telegram; `409 duplicate` не раскрывает прошлую заявку; `422 validation_error` содержит `fields`. Некорректный JSON — 400, слишком большое тело — 413, тип — 415, origin — 403, метод — 405, недоступность/перепутанное окружение — 503.
- Общая нормализация BY mobile/fixed/VoIP находится в `public/phone.js`, её импортирует Worker. В D1 хранится `+375…`. Шаблоны проверяют диапазон и синтаксис, а не существование номера; при изменении плана нумерации их нужно обновлять.
- SQL-триггер в `backend/migrations/0001_leads.sql` атомарно запрещает второй INSERT с тем же номером за скользящие 600 секунд. На границе 600 новая заявка разрешена, повтор не продлевает окно. Время задаёт D1 в UTC; не заменяйте это проверкой SELECT → INSERT в приложении.
- Атрибуция: пять `utm_*`, `yclid/fbclid/gclid` до 180 символов; очищенные `entry_url`, `referrer`, `submission_url` до 600. Произвольные query/hash и URL credentials отбрасываются. Первый переход хранится в sessionStorage до конца сессии; имя и телефон в browser storage не сохраняются.
- Сохраняйте same-origin проверки, ограничение тела, honeypot, проверку окружения и подготовленные SQL-запросы. Публичного списка заявок нет. Не логируйте персональные данные, секреты или исключения с ними.
- Сама заявка — запись очереди уведомлений. Cron раз в минуту отправляет одну запись через `waitUntil`; lease 60 секунд, максимум 5 попыток, timeout 8 секунд, backoff и `retry_after` при 429. Постоянные 4xx завершают отправку; длинное уведомление уходит документом. После неоднозначного timeout возможен повтор с тем же ID.
- Для логотипа и стрелок используйте SVG. Не возвращайте принудительную прокрутку полей через `visualViewport` и отложенный autofocus: они вызывали скачки мобильного экрана. Шрифт полей и placeholder — не меньше 16 px; сохраняйте inline errors, live region и клавиатурную доступность.

## Проверки

- `npm test` — 9 сценариев на встроенных `node:test` и `node:sqlite`: номера и поля, атрибуция, окно 599/600 секунд, параллельные повторы, сбои D1/сети, Telegram, lease и лимиты. Тестовая БД находится в памяти, часы меняются только там.
- После правок frontend проверьте узкий экран, фокус полей, маску телефона, CTA и состояния формы. Проверка реальной экранной клавиатуры дополняет эмуляцию.
- `python3 scripts/check_remote.py` проверяет настоящую preview D1 через 20 параллельных HTTPS-запросов, создаёт тестовые записи и меняет только их время. Telegram в preview выключен. Результат пишется в игнорируемый `output/remote-check.json`.
- Скрипты `cf_api.py`, `check_remote.py`, `set_telegram_secrets.py` используют `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` либо OAuth Wrangler из защищённой конфигурации macOS. Не выводите значения токенов.
- `node scripts/lighthouse.mjs <pages-deployment-url> <worker-version>` измеряет основной публичный сайт: три mobile запуска и один desktop, новые профили Chrome, одинаковый mobile throttling. Аргументы — метаданные публикации. Нужен установленный Chrome. HTML/JSON создаются в игнорируемом `output/lighthouse/`.
- `output/lighthouse/summary.json` — сохранённое свидетельство замеров 17 октября 2026 до последующих правок frontend; его sourceCommit/hashes относятся к измеренной версии. Это единственный отслеживаемый файл в `output/`. Скриншоты в `screenshots/` — материалы к тестовому заданию; сохраняйте их и ссылки из README.

## Окружения и публикация

| | Production | Preview |
| --- | --- | --- |
| Worker | kvarta-api | kvarta-api-preview |
| D1 | kvarta-leads | kvarta-leads-preview |
| Telegram | включён | выключен |

Конфигурации: `wrangler.jsonc` (Pages) и `backend/wrangler.jsonc` (Worker). Workers не имеют публичных workers.dev/preview URL. Прокси передаёт `X-Kvarta-Environment`, Worker сверяет его с `ENVIRONMENT`. Не смешивайте bindings и базы окружений.

В исходном HTML абсолютные Open Graph / Twitter URL ведут на production. При preview-публикации замените origin только в `og:url`, `og:image` и `twitter:image` на `https://staging.kvarta-minsk.pages.dev`; после загрузки восстановите исходный HTML. Canonical остаётся production. Новому изображению превью задавайте новое имя файла.

Preview:

```sh
npx wrangler --cwd backend d1 migrations apply kvarta-leads-preview --env preview --remote
npx wrangler --cwd backend deploy --env preview
npx wrangler pages deploy public --project-name kvarta-minsk --branch staging
```

Production:

```sh
npx wrangler --cwd backend d1 migrations apply kvarta-leads --remote
npx wrangler --cwd backend deploy --env ''
npx wrangler pages deploy public --project-name kvarta-minsk --branch main
```

Публикация через Wrangler Direct Upload, не Git Integration: статика только из `public/`, Pages Functions из `functions/`. Документация, тесты, отчёты и секреты не входят в публичную статику. Перед production: тесты → preview → браузер → commit; после публикации проверьте результат. Нужен действующий Cloudflare OAuth (`npx wrangler login`) либо API token. Не включайте платные услуги без запроса пользователя.

Секреты `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` устанавливаются только в production Worker. `python3 scripts/set_telegram_secrets.py` читает игнорируемый `.secrets/telegram.json`; также доступен `npx wrangler --cwd backend secret put <NAME>`. Значения не должны попадать в Git, frontend, argv или логи. D1 IDs в конфигурации не являются секретами.

Разовые дампы, временные скриншоты и отчёты храните в игнорируемом `output/`; не добавляйте их в `docs/`. Не удаляйте рабочие миграции, исходники, используемые assets и лицензии ради сокращения числа файлов.
