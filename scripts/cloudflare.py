"""Reproducible Wrangler commands through uv; never handles secret values."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
target, *args = sys.argv[1:]
if target not in ("worker", "pages"):
    raise SystemExit("Usage: uv run --project backend python scripts/cloudflare.py worker|pages <wrangler args>")
raise SystemExit(subprocess.call(["npx", "--yes", "wrangler@4.151.1", *args],
                                cwd=ROOT / "backend" if target == "worker" else ROOT,
                                env={**os.environ, "WRANGLER_SEND_METRICS": "false"}))
