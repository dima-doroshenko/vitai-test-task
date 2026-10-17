"""Install only into the production Worker. No secrets in argv or output."""
import json
from pathlib import Path
from cf_api import api, ACCOUNT

path = Path(__file__).resolve().parent.parent / ".secrets/telegram.json"
values = json.loads(path.read_text())
for key in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
    value = str(values[key]).strip()
    if not value:
        raise SystemExit("Missing secret")
    api(f"accounts/{ACCOUNT}/workers/scripts/kvarta-api/secrets", "PUT", {"name": key, "text": value, "type": "secret_text"})
    print(key, "installed (value hidden)")
