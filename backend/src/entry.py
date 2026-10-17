from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from workers import asgi
import json
import uuid

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None,
              telemetry={"tracing": False, "metrics": False, "logs": False})


@app.post("/api/lead")
async def lead(request: Request):
    env = request.scope["env"]
    try:
        body = await request.json()
        # Minimal smoke path; complete validation follows after deployment gate.
        if not isinstance(body, dict) or body.get("name") != "TEST: deployment smoke":
            return JSONResponse({"ok": False, "code": "validation_error"}, status_code=422)
        lead_id = str(uuid.uuid4())
        row = await env.DB.prepare(
            "INSERT INTO leads(id,name,phone,interest,telegram_status) VALUES(?,?,?,?,'disabled') RETURNING id"
        ).bind(lead_id, body["name"], "+375291110000", "question").first()
        return JSONResponse({"ok": bool(row), "code": "accepted" if row else "duplicate"}, status_code=201 if row else 409)
    except Exception:
        return JSONResponse({"ok": False, "code": "unavailable"}, status_code=503)


Default = asgi.entrypoint(app)
