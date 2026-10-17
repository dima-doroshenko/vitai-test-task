# План и проверка архитектуры

Дата: 2026-10-17. Пользовательский README сохранён в original-readme.md.
Удалённый репозиторий до начала работ пуст; GitHub OAuth доступен.

1. Минимальный публичный Pages → JS proxy → FastAPI ASGI → D1;
   проверка плана аккаунта, реальной записи, CPU.
2. Мобильный лендинг, нормализация телефона, атомарное окно 600 секунд,
   атрибуция и доступная форма; локальные и удалённые проверки.
3. Telegram outbox и ограниченные повторы, метаданные, изображения,
   браузерная проверка, финальная публикация, Lighthouse.

Документация Cloudflare проверена 2026-10-17:
- https://developers.cloudflare.com/workers/languages/python/packages/fastapi/
- https://developers.cloudflare.com/workers/languages/python/packages/
- https://developers.cloudflare.com/workers/languages/python/how-python-workers-work/
- https://developers.cloudflare.com/d1/examples/query-d1-from-python-workers/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/pages/functions/bindings/#service-bindings
- https://developers.cloudflare.com/pages/functions/routing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/

Документированные Free лимиты: 100 000 Worker запросов/сутки, 10 мс CPU,
128 МБ; D1: 5 млн чтений, 100 000 записей/сутки, 500 МБ/БД,
5 ГБ на аккаунт, до 10 БД. Доступные квоты аккаунта проверяются отдельно.

Публикация: Wrangler Direct Upload (не Git Integration), только public/.
На первом этапе preview использовал отдельный Python Worker и отдельную D1,
Telegram выключен. В финальной версии оба Worker работают на JavaScript.
Worker не имеет публичного workers.dev URL; доступ через Service Binding.

## Согласованное изменение 2026-10-17
Пользователь выбрал Free + JavaScript Worker после воспроизводимого превышения CPU Python/FastAPI (docs/cpu-smoke.json). Итог: Pages → JS proxy → JS Worker → D1. Оплата не подключалась. Неиспользуемый Python smoke удалён из текущих исходников; эксперимент и его зависимости доступны в истории Git, коммит `04cd9ea`.
