"""Cloudflare operator helper. Never prints credentials or personal lead fields."""
import json
import os
from pathlib import Path
import tomllib
import urllib.request

ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "df138ae34c11f5802d6d5d47d1179cae")


def api(path, method="GET", body=None):
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        config = Path.home() / "Library/Preferences/.wrangler/config/default.toml"
        token = tomllib.loads(config.read_text())["oauth_token"]
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4/" + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    if not result.get("success"):
        raise RuntimeError("Cloudflare operation failed")
    return result["result"]


if __name__ == "__main__":
    for path in ["subscriptions", "workers/subdomain", "d1/database", "pages/projects"]:
        result = api(f"accounts/{ACCOUNT}/{path}")
        print(path, json.dumps(result, ensure_ascii=False)[:6000])
