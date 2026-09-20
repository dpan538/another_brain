// A stand-in for the provider, for local end-to-end checks only.
// Streams three sentences slowly and records what it was sent and whether the
// caller hung up early. Run: node scripts/mock_upstream.mjs
import { createServer } from "node:http";
const PORT = Number(process.env.MOCK_PORT || 5199);
const state = { requests: 0, last: null, aborted: 0, completed: 0 };
createServer(async (req, res) => {
  if (req.url === "/state") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(state)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  state.requests += 1;
  state.last = { auth_present: Boolean(req.headers.authorization), model: body.model, max_tokens: body.max_tokens,
                 roles: (body.messages || []).map((m) => m.role), system_is_persona: String(body.messages?.[0]?.content || "").includes("efish other"),
                 last_user: body.messages?.at(-1)?.content };
  res.writeHead(200, { "content-type": "text/event-stream" });
  const pieces = ["影子", "并不是", "身体。", "所以", "没有", "失败可言。", "这是", "不该", "出现的", "第三句。"];
  let done = false;
  for (const p of pieces) {
    if (res.destroyed) { state.aborted += 1; return; }        // the caller hung up mid-answer
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p }, index: 0 }] })}\n\n`);
    await new Promise((r) => setTimeout(r, 120));
  }
  done = true; state.completed += 1;
  res.write("data: [DONE]\n\n"); res.end();
}).listen(PORT, "127.0.0.1", () => console.log("mock upstream on", PORT));
