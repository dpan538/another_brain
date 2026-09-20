// One turn in, at most two sentences out.
//
// Order of work: local commands, easter eggs, then one streamed model call. The
// stream is cut the instant the second sentence closes, which enforces the
// two-sentence rule and also saves the rest of the generation.

import { buildPersonaSystemPrompt, PERSONA_PROMPT_ID } from "./persona_prompt.js";
import { buildRequest, streamCompletion, StreamError, DEFAULT_MODEL } from "./deepseek_stream.js";
import { limitSentences } from "./sentence_limit.js";
import { findEgg } from "./easter_eggs.js";
import { findGuide } from "./croc_keys.js";
import { hasKey, readKey, redactKeyMaterial } from "./key_store.js";

// Two sentences need far fewer tokens than the 192 the latency figures were
// measured at, so the 3.5 s answer budget holds with room to spare.
export const MAX_TOKENS = 160;
export const SESSION_REQUEST_LIMIT = 200;

export function createAnswerPath({ getKey = readKey, keyPresent = hasKey, proxyUrl = "", fetchImpl, model = DEFAULT_MODEL } = {}) {
  let requests = 0;
  let primed = false;
  let proxyDown = false;      // the endpoint answered "not configured": stop asking it this session
  const telemetry = [];
  const live = new Set();

  const viaProxy = () => Boolean(proxyUrl) && !proxyDown;
  const canCall = () => viaProxy() || Boolean(keyPresent());

  async function run(request, { onText, signal, stopAtFirst = false }) {
    const controller = new AbortController();
    live.add(controller);
    if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener("abort", () => controller.abort(), { once: true }); }
    const started = performance.now();
    let raw = ""; let firstAt = null; let usage = null; let cut = false;
    try {
      for await (const ev of streamCompletion(request, { apiKey: viaProxy() ? "" : getKey(), proxyUrl: viaProxy() ? proxyUrl : "", signal: controller.signal, fetchImpl })) {
        if (ev.type === "content") {
          if (firstAt === null) firstAt = performance.now();
          raw += ev.content;
          if (stopAtFirst) { cut = true; controller.abort(); break; }     // priming only needs the prefix read
          const limited = limitSentences(raw);
          onText?.(limited.text);
          if (limited.complete) { cut = true; controller.abort(); break; }
        } else if (ev.type === "usage") usage = ev;
      }
    } catch (error) {
      if (!(cut && error instanceof StreamError && error.category === "user_cancel")) throw error;
    } finally {
      live.delete(controller);
    }
    const final = limitSentences(raw);
    return { text: final.text, truncated: cut || final.truncated, usage,
             firstTokenMs: firstAt === null ? null : Math.round(firstAt - started), totalMs: Math.round(performance.now() - started) };
  }

  return {
    get telemetry() { return telemetry.slice(); },
    get requests() { return requests; },
    available: canCall,
    cancel() { for (const c of live) c.abort(); },

    // Sends the stable prefix once so the first real answer skips its prefill.
    async prime() {
      if (primed || !canCall() || requests >= SESSION_REQUEST_LIMIT) return { ok: false, skipped: true };
      primed = true; requests += 1;
      try {
        const r = await run(buildRequest({ systemPrompt: buildPersonaSystemPrompt(), conversation: [{ role: "user", content: "." }], model, maxTokens: 1 }), { stopAtFirst: true });
        telemetry.push({ kind: "prime", total_ms: r.totalMs, cache_hit_tokens: r.usage?.cache_hit_tokens ?? null });
        return { ok: true };
      } catch { return { ok: false }; }
    },

    /** Resolves { ok, source: "guide"|"egg"|"model", text, ... } or { ok:false, category, reason } */
    async answer({ userText, conversation = [], onText, signal, preset } = {}) {
      const typed = String(userText ?? "");
      // a key of the 鳄 board was pressed: the answer is part of the product, not of the model
      const guide = preset ? findGuide(preset) : null;
      if (guide) { onText?.(guide.reply); return { ok: true, source: "guide", guide: guide.id, text: guide.reply }; }
      const egg = findEgg(typed);
      if (egg) { onText?.(egg.reply); return { ok: true, source: "egg", egg: egg.id, text: egg.reply }; }

      const trimmed = typed.trim();
      if (!trimmed) return { ok: false, category: "empty", reason: "empty" };
      if (!canCall()) return { ok: false, category: "no_language_layer", reason: "api_key_absent" };
      if (requests >= SESSION_REQUEST_LIMIT) return { ok: false, category: "session_limit", reason: "session_request_limit" };

      const request = buildRequest({ systemPrompt: buildPersonaSystemPrompt(), conversation: [...conversation, { role: "user", content: trimmed }], model, maxTokens: MAX_TOKENS });
      let attempt = 0;
      while (true) {
        attempt += 1; requests += 1;
        try {
          const r = await run(request, { onText, signal });
          if (!r.text) throw new StreamError("empty_content", true, "empty_content");
          telemetry.push({ kind: "answer", persona: PERSONA_PROMPT_ID, first_token_ms: r.firstTokenMs, total_ms: r.totalMs,
                           cut_at_two_sentences: r.truncated, input_tokens: r.usage?.input_tokens ?? null, cache_hit_tokens: r.usage?.cache_hit_tokens ?? null });
          return { ok: true, source: "model", text: r.text, first_token_ms: r.firstTokenMs, total_ms: r.totalMs, truncated: r.truncated };
        } catch (error) {
          const e = error instanceof StreamError ? error : new StreamError("network", true, "unexpected");
          // No server key yet: fall back to a key on this device, if the owner stored one.
          if (e.category === "not_configured" && !proxyDown) { proxyDown = true; if (keyPresent()) continue; }
          if (e.retriable && e.beforeFirstToken && attempt < 2 && e.category !== "user_cancel") continue;
          telemetry.push({ kind: "error", category: e.category });
          return { ok: false, category: e.category, reason: redactKeyMaterial(e.message) };
        }
      }
    }
  };
}

// Plain system notes. These are the app speaking, never efish, and are shown in
// the typewriter face so nobody mistakes them for an answer.
export function systemNote(category) {
  switch (category) {
    case "no_language_layer":
    case "not_configured": return "language layer not connected.";
    case "proxy_rejected": return "this page may not talk to the server.";
    case "auth_rejected": return "key rejected. type /key";
    case "insufficient_balance": return "balance empty.";
    case "rate_limited": return "too fast. wait.";
    case "session_limit": return "session limit reached. reload.";
    case "user_cancel": return "stopped.";
    default: return "no signal. try again.";
  }
}
