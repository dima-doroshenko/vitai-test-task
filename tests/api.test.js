import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { normalizePhone } from '../public/phone.js';
import { handleLead, deliver, retryNotifications, validate, attribution } from '../backend/src/worker.js';
import { onRequest } from '../functions/api/lead.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  let now = 1199;
  sqlite.function('unixepoch', () => now);
  sqlite.exec(readFileSync(new URL('../backend/migrations/0001_leads.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let values = [];
    return { bind(...args) { values = args; return this; },
      async first() { return stmt.get(...values) ?? null; },
      async run() { return stmt.run(...values); },
      async all() { return { results: stmt.all(...values) }; }
    };
  } };
  return { DB, sqlite, time(value) { now = value; }, count() { return sqlite.prepare('SELECT count(*) n FROM leads').get().n; } };
}
const payload = (phone = '+375 29 491-19-11') => ({ name: 'TEST: automated', phone, interest: 'order', context: 'Эфиопия Иргачеффе', comment: 'Тест, не заказ', attribution: { first: { utm_source: 'instagram', entry_url: 'https://example.com/?utm_source=instagram&password=secret' }, current: { utm_source: 'yandex', yclid: 'test-click' }, submission_url: 'https://example.com/#lead' } });
const request = (body, overrides = {}) => new Request('https://leads.internal/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kvarta-Environment': 'preview' }, body: JSON.stringify(body), ...overrides });
const environment = (db, enabled = false) => ({ DB: db.DB, ENVIRONMENT: 'preview', TELEGRAM_ENABLED: String(enabled), TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: 'test-chat' });
const ctx = { waitUntil(p) { return p; } };

test('Belarus mobile, fixed and VoIP normalization; reject invalid numbering and syntax', () => {
  for (const number of ['+375 (29) 491-19-11', '375294911911', '8 (029) 491-19-11', '0294911911', '8294911911', '294911911', '810375294911911']) assert.equal(normalizePhone(number), '+375294911911');
  for (const number of ['+375152450911', '+375172123456', '+375249123456', '+375255123456', '+375331234567', '+375441234567']) assert.equal(normalizePhone(number), number);
  for (const number of ['', '+7 9991234567', '+375 29 0123456', '+375 258123456', '+375 991234567', '+37529123456', '+3752912345678', '+37529abc1234567', '++375291234567', '291234567 ext 1', '+291234567']) assert.equal(normalizePhone(number), null, number);
});

test('Validation constraints and attribution allowlist', () => {
  assert.deepEqual(validate(payload()).fields, {});
  for (const body of [{}, [], null, { ...payload(), name: '  ' }, { ...payload(), name: 'x'.repeat(81) }, { ...payload(), interest: 'other' }, { ...payload(), comment: 'x'.repeat(1001) }, { ...payload(), context: 'x'.repeat(121) }]) assert.ok(Object.keys(validate(body).fields).length);
  const value = attribution({ ...payload().attribution, secret: 'NO', first: { utm_source: 'x'.repeat(1000), fbclid: 'ok', unknown: 'NO', entry_url: 'https://example.com/?utm_source=test&token=NO', referrer: 'javascript:alert(1)' } });
  assert.equal(value.first.utm_source.length, 180);
  assert.equal(value.first.fbclid, 'ok');
  assert.ok(!JSON.stringify(value).includes('NO'));
  assert.equal(value.first.entry_url, 'https://example.com/?utm_source=test');
});

test('Sliding atomic D1 trigger: sequential, parallel, 599/600s, calendar boundary, independent numbers', async () => {
  const db = database(), env = environment(db);
  const first = await handleLead(request(payload()), env, ctx);
  assert.equal(first.status, 201);
  assert.equal((await handleLead(request(payload('8 (029) 491-19-11')), env, ctx)).status, 409);
  // At 1199 -> 1200 cross a calendar bucket, still reject.
  db.time(1200); assert.equal((await handleLead(request(payload()), env, ctx)).status, 409);
  db.time(1798); assert.equal((await handleLead(request(payload()), env, ctx)).status, 409);
  // Duplicates at 1200/1798 do not extend the window from 1199.
  db.time(1799); assert.equal((await handleLead(request(payload()), env, ctx)).status, 201);
  const responses = await Promise.all(Array.from({ length: 20 }, () => handleLead(request(payload('+375 33 123-45-67')), env, ctx)));
  assert.equal(responses.filter(r => r.status === 201).length, 1);
  assert.equal(responses.filter(r => r.status === 409).length, 19);
  const duplicate = await (await handleLead(request(payload()), env, ctx)).json();
  assert.deepEqual(duplicate, { ok: false, code: 'duplicate' });
  assert.equal(db.count(), 3);
  const row = db.sqlite.prepare('SELECT * FROM leads LIMIT 1').get();
  assert.equal(row.phone, '+375294911911'); assert.equal(row.created_at, 1199);
  assert.equal(JSON.parse(row.attribution).current.yclid, 'test-click');
});

test('Invalid requests and honeypot never write; bounded body and preview isolation', async () => {
  const db = database(), env = environment(db);
  for (const body of [{}, { ...payload(), phone: '+375991234567' }, { ...payload(), website: 'spam' }, { ...payload(), name: 'x'.repeat(81) }]) assert.equal((await handleLead(request(body), env, ctx)).status, 422);
  assert.equal((await handleLead(request(payload(), { body: '{' }), env, ctx)).status, 400);
  assert.equal((await handleLead(request(payload(), { body: 'x'.repeat(8193) }), env, ctx)).status, 413);
  assert.equal((await handleLead(request(payload()), { ...env, ENVIRONMENT: 'production' }, ctx)).status, 503);
  assert.equal(db.count(), 0);
});

test('D1 failure, uncertain network result, retry does not create another outbox record', async () => {
  const db = database(), env = environment(db);
  const broken = { ...env, DB: { prepare() { throw new Error('simulated database outage'); } } };
  assert.equal((await handleLead(request(payload()), broken, ctx)).status, 503);
  assert.equal(db.count(), 0);
  // Simulate lost successful HTTP response by discarding it, then retry.
  await handleLead(request(payload()), env, ctx);
  assert.equal((await handleLead(request(payload()), env, ctx)).status, 409);
  assert.equal(db.count(), 1);
});

test('D1 commits but loses acknowledgment: accepted row is retried by the outbox', async () => {
  const db = database(), env = environment(db, true);
  const uncertain = { ...env, DB: { prepare(query) {
    const stmt = db.DB.prepare(query);
    return { bind(...values) { stmt.bind(...values); return this; }, async first() { await stmt.first(); throw new Error('lost D1 acknowledgment'); } };
  } } };
  assert.equal((await handleLead(request(payload()), uncertain, ctx)).status, 503);
  assert.equal(db.count(), 1);
  assert.equal((await handleLead(request(payload()), env, ctx)).status, 409);
  const row = db.sqlite.prepare('SELECT id,telegram_status FROM leads').get();
  assert.equal(row.telegram_status, 'pending');
  await deliver(env, row.id, async () => Response.json({ ok: true }));
  assert.equal(db.sqlite.prepare('SELECT telegram_status FROM leads').get().telegram_status, 'sent');
});

test('Telegram timeout after persisted lead; 429 retry-after; lease concurrency; later delivery and attempt bound', async () => {
  const db = database(), env = environment(db);
  await handleLead(request(payload()), env, ctx);
  db.sqlite.exec("UPDATE leads SET telegram_status='pending'"); env.TELEGRAM_ENABLED = 'true';
  const id = db.sqlite.prepare('SELECT id FROM leads').get().id;
  await deliver(env, id, async () => { throw new Error('timeout'); });
  let row = db.sqlite.prepare('SELECT * FROM leads').get();
  assert.equal(row.telegram_status, 'pending'); assert.equal(row.telegram_attempts, 1); assert.equal(db.count(), 1);
  db.time(1259);
  await deliver(env, id, async () => Response.json({ ok: false, parameters: { retry_after: 180 } }, { status: 429 }));
  row = db.sqlite.prepare('SELECT * FROM leads').get(); assert.equal(row.telegram_next_at, 1439);
  db.time(1439); let calls = 0;
  const send = async (_url, options) => { calls++; assert.ok(options.body.includes(id)); assert.ok(options.body.includes('test-click')); return Response.json({ ok: true }); };
  await Promise.all([deliver(env, id, send), deliver(env, id, send)]);
  row = db.sqlite.prepare('SELECT * FROM leads').get(); assert.equal(row.telegram_status, 'sent'); assert.equal(calls, 1);
  await deliver(env, id, send); assert.equal(calls, 1);
  db.sqlite.exec("UPDATE leads SET telegram_status='sending',telegram_attempts=5,telegram_next_at=0");
  await retryNotifications(env); assert.equal(db.sqlite.prepare('SELECT telegram_status FROM leads').get().telegram_status, 'failed');
});

test('Telegram long attribution is attached intact rather than truncated', async () => {
  const db = database(), env = environment(db);
  await handleLead(request(payload()), env, ctx);
  const text = JSON.stringify({ first: { utm_campaign: 'x'.repeat(4500) } });
  db.sqlite.prepare("UPDATE leads SET telegram_status='pending',attribution=?").run(text); env.TELEGRAM_ENABLED = 'true';
  const id = db.sqlite.prepare('SELECT id FROM leads').get().id;
  await deliver(env, id, async (url, options) => { assert.ok(url.endsWith('/sendDocument')); assert.ok((await options.body.get('document').text()).includes('x'.repeat(4500))); return Response.json({ ok: true }); });
  assert.equal(db.sqlite.prepare('SELECT telegram_status FROM leads').get().telegram_status, 'sent');
});

test('Pages proxy origin/method/content type/body limits and service outage', async () => {
  const env = { ENVIRONMENT: 'preview', LEADS: { fetch: async () => { throw new Error('network down'); } } };
  const call = r => onRequest({ request: r, env });
  assert.equal((await call(new Request('https://example.com/api/lead'))).status, 405);
  assert.equal((await call(new Request('https://example.com/api/lead', { method: 'POST', headers: { Origin: 'https://evil.example' } }))).status, 403);
  assert.equal((await call(new Request('https://example.com/api/lead', { method: 'POST' }))).status, 415);
  assert.equal((await call(request(payload(), { body: 'x'.repeat(8193) }))).status, 413);
  assert.equal((await call(request(payload()))).status, 503);
});
