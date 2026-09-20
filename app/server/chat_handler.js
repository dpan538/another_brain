// Server-held key: the one endpoint between visitors and the language provider.
//
// Visitors have no key of their own, so the owner's key lives in the server
// environment and never reaches a browser. This endpoint is deliberately not a
// general proxy. The caller sends conversation turns and nothing else; the
// persona, the model, the token ceiling and every other request field are fixed
// here. A stolen URL can therefore only ever buy short efish answers.

import { buildPersonaSystemPrompt } from "../src/engine/persona_prompt.js";

export const UPSTREAM_URL = "https://api.deepseek.com/chat/completions";
// DeepSeek's current name for its Flash model (served by V4.1-Flash as of 2026-09). The older
// "deepseek-v4-flash" is a retired alias that is still accepted and routed to the same model.
export const MODEL = "deepseek-flash";
export const MAX_TOKENS = 160;            // two sentences
// About twenty exchanges. Measured: the persona is ~2,150 tokens (≈93 % served from the provider's
// cache) and a two-sentence exchange is ~25, so a full window adds ~500 tokens to a request.
export const MAX_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 600;
export const MAX_TOTAL_CHARS = 8000;
export const MAX_BODY_BYTES = 49_152;       // 8000 characters of Chinese in UTF-8, plus JSON
export const PER_MINUTE = 12;
export const PER_DAY = 200;

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
});

// Best effort only: a serverless instance does not share memory with its
// siblings. The provider balance is prepaid, which is the hard ceiling; a
// platform firewall rule is the right place for a strict limit.
const hits = new Map();
export function rateLimited(ip, now = Date.now(), { perMinute = PER_MINUTE, perDay = PER_DAY } = {}) {
  const day = 86_400_000;
  const list = (hits.get(ip) || []).filter((t) => now - t < day);
  const lastMinute = list.filter((t) => now - t < 60_000).length;
  if (lastMinute >= perMinute || list.length >= perDay) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size <= 2500) break; }
  return false;
}
export function resetRateLimit() { hits.clear(); }

function originAllowed(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return false;                                    // browsers always send it on a POST
  let host;
  try { host = new URL(request.url).host; } catch { host = request.headers.get("host") || ""; }
  try { if (new URL(origin).host === (request.headers.get("x-forwarded-host") || host)) return true; } catch { return false; }
  const extra = String(env.EFISH_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

export function validateMessages(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) return null;
  const out = []; let total = 0;
  for (const m of input) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;   // no system role from outside
    const content = m.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) return null;
    total += content.length; out.push({ role: m.role, content });
  }
  if (total > MAX_TOTAL_CHARS || out[out.length - 1].role !== "user") return null;
  return out;
}

export async function handleChat(request, { env = {}, fetchImpl = globalThis.fetch, upstreamUrl = UPSTREAM_URL, now = () => Date.now() } = {}) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });
  if (!originAllowed(request, env)) return json(403, { error: "origin_not_allowed" });

  const key = env.DEEPSEEK_API_KEY;
  if (!key) return json(503, { error: "not_configured" });

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip, now())) return json(429, { error: "rate_limited" }, { "retry-after": "60" });

  let raw;
  try { raw = await request.text(); } catch { return json(400, { error: "bad_request" }); }
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return json(400, { error: "bad_json" }); }
  const messages = validateMessages(parsed?.messages);
  if (!messages) return json(400, { error: "bad_messages" });

  const body = {
    model: env.EFISH_MODEL || MODEL,
    messages: [{ role: "system", content: buildPersonaSystemPrompt() }, ...messages],
    thinking: { type: "disabled" },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: MAX_TOKENS
  };

  let upstream;
  try {
    upstream = await fetchImpl(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: request.signal          // the visitor hanging up stops the generation and the spend
    });
  } catch {
    return json(502, { error: "upstream_unreachable" });
  }
  if (!upstream.ok || !upstream.body) {
    // Never forward the provider's error body: it can echo part of the key.
    const map = { 401: "upstream_auth", 402: "upstream_balance", 429: "upstream_rate_limited" };
    return json(upstream.status === 429 ? 429 : 502, { error: map[upstream.status] || "upstream_error" });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" }
  });
}
