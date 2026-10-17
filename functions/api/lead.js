// Only transport and trust-boundary checks; lead logic lives in Python.
export async function onRequest({ request, env }) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (status, code) => Response.json({ ok: false, code }, { status, headers });
  if (request.method !== "POST") return fail(405, "method_not_allowed");
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return fail(403, "origin_rejected");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return fail(403, "origin_rejected");
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return fail(415, "json_required");
  if (Number(request.headers.get("Content-Length")) > 8192) return fail(413, "body_too_large");
  // Stream with an actual byte cap: Content-Length can be missing or false.
  const reader = request.body?.getReader();
  const chunks = []; let size = 0;
  if (!reader) return fail(400, "invalid_json");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); return fail(413, "body_too_large"); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try {
    const response = await env.LEADS.fetch("https://leads.internal/api/lead", {
      method: "POST", body,
      headers: { "Content-Type": "application/json", "X-Kvarta-Environment": env.ENVIRONMENT },
      signal: AbortSignal.timeout(15000)
    });
    return new Response(response.body, { status: response.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
  } catch { return fail(503, "unavailable"); }
}
