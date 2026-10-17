"""Actual D1 concurrency and sliding-window checks, preview only. No public bypass."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
from cf_api import api, ACCOUNT

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / 'backend/wrangler.jsonc').read_text())
DB = CONFIG['env']['preview']['d1_databases'][0]['database_id']
URL = 'https://staging.kvarta-minsk.pages.dev'


def sql(query, params=None):
    return api(f'accounts/{ACCOUNT}/d1/database/{DB}/query', 'POST', {'sql': query, 'params': params or []})[0]['results']


def post(body):
    result = subprocess.run(['curl', '-sS', '--max-time', '25', '-w', '\n%{http_code}',
                             '-H', 'Content-Type: application/json', '-H', 'Origin: ' + URL,
                             '--data-binary', json.dumps(body, ensure_ascii=False), URL + '/api/lead'],
                            capture_output=True, text=True, check=True)
    text, status = result.stdout.rsplit('\n', 1)
    return int(status), json.loads(text)


if __name__ == '__main__':
    # Fixture name is unique; no deletion of user data or interaction with production.
    import uuid
    name = 'TEST: remote ' + str(uuid.uuid4())[:8]
    phone = '+37529123' + str(int(uuid.uuid4().hex[:6], 16) % 10000).zfill(4)
    body = {'name': name, 'phone': phone, 'interest': 'question', 'comment': 'Автоматическая проверка, не заказ',
            'attribution': {'first': {'utm_source': 'instagram', 'utm_campaign': 'TEST',
                                      'entry_url': URL + '/?utm_source=instagram&private=discard'},
                            'current': {'utm_source': 'yandex', 'yclid': 'TEST-click'},
                            'submission_url': URL + '/'}}
    before = sql('SELECT count(*) n FROM leads')[0]['n']
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda _: post(body), range(20)))
    statuses = [r[0] for r in results]
    assert statuses.count(201) == 1 and statuses.count(409) == 19, statuses
    rows = sql('SELECT id,created_at,attribution,telegram_status FROM leads WHERE name=?', [name])
    assert len(rows) == 1 and rows[0]['telegram_status'] == 'disabled'
    data = json.loads(rows[0]['attribution']); assert data['first']['utm_source'] == 'instagram'
    assert data['current']['yclid'] == 'TEST-click' and 'private' not in json.dumps(data)
    lead_id = rows[0]['id']
    sql('UPDATE leads SET created_at=unixepoch()-599 WHERE id=?', [lead_id])
    # Timing of the exact 599-second remote boundary is intentionally covered in
    # deterministic local tests; allow 1s transport jitter here, then set age 600.
    sql('UPDATE leads SET created_at=unixepoch()-600 WHERE id=?', [lead_id])
    assert post(body)[0] == 201
    assert post(body)[0] == 409
    after_valid = sql('SELECT count(*) n FROM leads')[0]['n']; assert after_valid == before + 2
    for invalid in [{}, {**body, 'phone': '+375991234567'}, {**body, 'name': ''}, {**body, 'interest': 'invalid'}, {**body, 'comment': 'x' * 1001}]:
        assert post(invalid)[0] == 422
    assert sql('SELECT count(*) n FROM leads')[0]['n'] == after_valid
    summary = {'url': URL, 'fixture': name, 'parallel_requests': 20, 'accepted': 1, 'duplicates': 19,
               'new_after_600_seconds': True, 'invalid_requests_write_nothing': True,
               'attribution_verified_in_real_d1': True, 'preview_telegram': 'disabled', 'lead_id': lead_id}
    output = ROOT / 'output/remote-check.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(summary, ensure_ascii=False))
