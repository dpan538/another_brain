// Asks efish a question through the relay, exactly as the app does, and prints what came back.
//   npm --prefix app run ask -- "你是谁？"            local dev server (http://localhost:5190)
//   npm --prefix app run ask -- --prod "你是谁？"     the live site
//   npm --prefix app run ask -- "第一句" "第二句"      several turns of one conversation
// The key is never read here: it stays on the server side of /api/chat.
import { limitSentences } from "../src/engine/sentence_limit.js";
import { windowConversation } from "../src/engine/deepseek_stream.js";

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const base = (args.find((a) => a.startsWith("--url="))?.slice(6)) || (prod ? "https://www.efishother.com" : "http://localhost:5190");
const questions = args.filter((a) => !a.startsWith("--"));
if (!questions.length) { console.error('usage: npm --prefix app run ask -- "your question"'); process.exit(1); }

const HINTS = {
  503: "no key on the server: run `npm --prefix app run key` (local) or add DEEPSEEK_API_KEY in Vercel (live)",
  403: "origin refused", 429: "rate limit reached, wait a minute",
  502: "the provider refused: check the key and the balance", 0: "is the dev server running?"
};
const BLANK = String.fromCharCode(10, 10);

const messages = [];
for (const q of questions) {
  messages.push({ role: "user", content: q });
  const t0 = performance.now(); let first = null; let raw = ""; let model = null; let usage = null;
  const res = await fetch(base + "/api/chat", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ messages: windowConversation(messages) }) })     // the same window the app sends
    .catch((e) => ({ ok: false, status: 0, text: async () => String(e.cause?.code || e.message) }));
  if (!res.ok) {
    const why = await res.text().catch(() => "");
    console.log(""); console.log("> " + q); console.log("  x " + res.status + " " + why + (HINTS[res.status] ? " -- " + HINTS[res.status] : ""));
    process.exit(1);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let at; while ((at = buf.indexOf(BLANK)) >= 0) {
      const line = buf.slice(0, at).trim(); buf = buf.slice(at + 2);
      if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
      try { const data = JSON.parse(line.slice(5)); model ??= data.model || null; if (data.usage) usage = data.usage; const piece = data.choices?.[0]?.delta?.content || ""; if (piece && first == null) first = performance.now() - t0; raw += piece; } catch { /* keep-alive */ }
    }
  }
  const limited = limitSentences(raw, 2); const shown = typeof limited === "string" ? limited : limited.text;   // what the app would actually display
  const clauses = shown.split(/[，。！？；：、,.!?;:—…]+/u).map((c) => Array.from(c.trim()).length).filter(Boolean);
  const shape = Array.from(shown).length + " chars, longest clause " + Math.max(0, ...clauses);
  console.log(""); console.log("> " + q); console.log("  " + shown);
  console.log("  [" + shape + " | " + (model ? "model " + model + ", " : "") + "first word " + Math.round(first ?? 0) + " ms, done " + Math.round(performance.now() - t0) + " ms" + (shown !== raw.trim() ? ", cut to two sentences" : "") + "]");
  if (usage) console.log("  [tokens: prompt " + usage.prompt_tokens + " (cached " + (usage.prompt_cache_hit_tokens ?? "?") + "), answer " + usage.completion_tokens + "]");
  messages.push({ role: "assistant", content: shown });
}
