import { normalizePhone } from '../../public/phone.js';

const json = (status, code, extra = {}) => Response.json(
  { ok: status === 201, code, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
const interests = ['subscription', 'order', 'question'];
export const tags = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'fbclid', 'gclid'];

export function cleanUrl(value) {
  if (typeof value !== 'string' || value.length > 1200) return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    const clean = new URL(url.origin + url.pathname);
    for (const key of tags) {
      const v = url.searchParams.get(key);
      if (v) clean.searchParams.set(key, v.slice(0, 180));
    }
    return clean.href.slice(0, 600);
  } catch { return ''; }
}

export function attribution(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result = {};
  for (const touch of ['first', 'current']) {
    if (!input[touch] || typeof input[touch] !== 'object') continue;
    const data = {};
    for (const key of tags) if (typeof input[touch][key] === 'string' && input[touch][key]) data[key] = input[touch][key].slice(0, 180);
    for (const key of ['entry_url', 'referrer']) {
      const value = cleanUrl(input[touch][key]);
      if (value) data[key] = value;
    }
    if (Object.keys(data).length) result[touch] = data;
  }
  const url = cleanUrl(input.submission_url);
  if (url) result.submission_url = url;
  return result;
}

export function validate(input) {
  const fields = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { fields: { form: 'Нужен JSON-объект.' } };
  const string = (key, max, required = false) => {
    const raw = input[key] ?? '';
    if (typeof raw !== 'string' || raw.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)) {
      fields[key] = `Используйте текст до ${max} символов.`; return '';
    }
    const value = raw.trim();
    if (required && !value) fields[key] = 'Заполните это поле.';
    return value;
  };
  const name = string('name', 80, true);
  const phone = normalizePhone(input.phone);
  if (!phone) fields.phone = 'Укажите белорусский номер с кодом оператора или города, например +375 29 491-19-11.';
  const interest = input.interest;
  if (!interests.includes(interest)) fields.interest = 'Выберите, что вас интересует.';
  const comment = string('comment', 1000);
  const context = string('context', 120);
  return { fields, value: { name, phone, interest, comment, context, attribution: attribution(input.attribution) } };
}

export const insertLead = `INSERT INTO leads(id,name,phone,interest,comment,context,attribution,telegram_status)
  VALUES(?,?,?,?,?,?,?,?) RETURNING id,created_at`;

export async function handleLead(request, env, ctx) {
  if (new URL(request.url).pathname !== '/api/lead') return json(404, 'not_found');
  if (request.method !== 'POST') return json(405, 'method_not_allowed');
  // Fail closed if a preview binding is accidentally wired to production.
  if (request.headers.get('X-Kvarta-Environment') !== env.ENVIRONMENT) return json(503, 'environment_mismatch');
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json(415, 'json_required');
  let input;
  try {
    const reader = request.body?.getReader(); let size = 0; const chunks = [];
    if (!reader) return json(400, 'invalid_json');
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return json(413, 'body_too_large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return json(400, 'invalid_json'); }
  if (input?.website) return json(422, 'validation_error', { fields: { form: 'Не удалось отправить. Обновите страницу и попробуйте ещё раз.' } });
  const { fields, value } = validate(input);
  if (Object.keys(fields).length) return json(422, 'validation_error', { fields });
  const id = crypto.randomUUID();
  try {
    const row = await env.DB.prepare(insertLead).bind(id, value.name, value.phone, value.interest, value.comment,
      value.context, JSON.stringify(value.attribution), env.TELEGRAM_ENABLED === 'true' ? 'pending' : 'disabled').first();
    if (!row) return json(409, 'duplicate');
    if (env.TELEGRAM_ENABLED === 'true') ctx.waitUntil(deliver(env, id).catch(() => {}));
    return json(201, 'accepted', { id: row.id });
  } catch { return json(503, 'unavailable'); }
}

export function telegramText(row) {
  const label = { subscription: 'Подписка', order: 'Разовый заказ', question: 'Вопрос' };
  return [ 'Кварта · новая заявка', `ID: ${row.id}`, `UTC: ${new Date(row.created_at * 1000).toISOString()}`,
    `Имя: ${row.name}`, `Телефон: ${row.phone}`, `Интерес: ${label[row.interest]}`,
    row.context && `Кофе: ${row.context}`, row.comment && `Комментарий: ${row.comment}`,
    `Атрибуция: ${JSON.stringify(JSON.parse(row.attribution), null, 2)}` ].filter(Boolean).join('\n');
}

export async function deliver(env, id, send = fetch) {
  if (env.TELEGRAM_ENABLED !== 'true') return;
  const lease = crypto.randomUUID();
  // Atomic lease and attempt counter prevent two cron/request deliveries.
  // A crashed sender can be retried after 60s, with bounded attempts (5).
  const row = await env.DB.prepare(`UPDATE leads SET telegram_status='sending',
    telegram_attempts=telegram_attempts+1,telegram_next_at=unixepoch()+60,telegram_lease=?
    WHERE id=? AND telegram_status IN ('pending','sending') AND telegram_attempts<5
    AND telegram_next_at<=unixepoch() RETURNING *`).bind(lease, id).first();
  if (!row) return;
  let status = 'pending', error = null, delay = Math.min(3600, 30 * 2 ** row.telegram_attempts);
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('missing_secret');
    const text = telegramText(row);
    // Telegram caps text at 4096 chars. Limit field metadata, then attach full
    // attribution as a small JSON document in the same message if necessary.
    const long = text.length > 4000;
    let body, method;
    if (long) {
      body = new FormData(); body.set('chat_id', env.TELEGRAM_CHAT_ID);
      body.set('caption', `Кварта · заявка ${row.id}\nПолные поля и атрибуция — в приложении.`);
      body.set('document', new Blob([text], { type: 'text/plain;charset=utf-8' }), `lead-${row.id}.txt`);
      method = 'sendDocument';
    } else {
      body = JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, link_preview_options: { is_disabled: true } });
      method = 'sendMessage';
    }
    const response = await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', body, signal: AbortSignal.timeout(8000),
      ...(long ? {} : { headers: { 'Content-Type': 'application/json' } })
    });
    const result = await response.json();
    if (response.ok && result.ok) status = 'sent';
    else if (response.status === 429 || result.error_code === 429) {
      delay = Math.max(delay, Math.min(86400, Number(result.parameters?.retry_after) || 60)); error = 'rate_limited';
    } else if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      status = 'failed'; error = 'telegram_rejected';
    } else error = 'telegram_unavailable';
  } catch { error = 'network_or_configuration'; }
  if (status === 'pending' && row.telegram_attempts >= 5) status = 'failed';
  await env.DB.prepare(`UPDATE leads SET telegram_status=?,telegram_error=?,
    telegram_next_at=unixepoch()+?,telegram_lease=NULL WHERE id=? AND telegram_lease=?`)
    .bind(status, error, delay, id, lease).run();
}

export async function retryNotifications(env) {
  if (env.TELEGRAM_ENABLED !== 'true') return;
  // Mark exhausted leases too (a crash on attempt five must not remain sending).
  await env.DB.prepare(`UPDATE leads SET telegram_status='failed',telegram_error='attempts_exhausted'
    WHERE telegram_status IN ('pending','sending') AND telegram_attempts>=5 AND telegram_next_at<=unixepoch()`).run();
  const { results } = await env.DB.prepare(`SELECT id FROM leads WHERE telegram_status IN ('pending','sending')
    AND telegram_attempts<5 AND telegram_next_at<=unixepoch() ORDER BY telegram_next_at LIMIT 5`).all();
  for (const row of results) await deliver(env, row.id);
}

export default {
  fetch: handleLead,
  scheduled(_event, env, ctx) { ctx.waitUntil(retryNotifications(env)); }
};
