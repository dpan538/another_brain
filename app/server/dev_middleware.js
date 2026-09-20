// Runs the production handler inside `vite dev` and `vite preview`, so the
// browser talks to /api/chat locally exactly as it will when deployed.
// The key comes from app/.env.local (DEEPSEEK_API_KEY=…), which is git-ignored
// and never exposed to client code: Vite only ships variables prefixed VITE_.
import { loadEnv } from "vite";
import { handleChat } from "./chat_handler.js";

export function efishApi() {
  let env = {};
  // Must return nothing: Vite treats a returned function as a post-hook and would call it bare.
  const mount = (server) => { server.middlewares.use("/api/chat", async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    const request = new Request(`http://${req.headers.host}/api/chat`, {
      method: req.method, headers: req.headers, signal: controller.signal,
      body: req.method === "POST" ? Buffer.concat(chunks) : undefined
    });
    // EFISH_UPSTREAM_URL is honoured only here, for local testing against a mock.
    const response = await handleChat(request, { env, upstreamUrl: env.EFISH_UPSTREAM_URL || undefined });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (!response.body) return res.end();
    const reader = response.body.getReader();
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; res.write(value); } } catch { /* client went away */ }
    res.end();
  }); };
  return {
    name: "efish-api",
    config(_, { mode }) { env = { ...loadEnv(mode, process.cwd(), ""), ...process.env }; },
    configureServer: mount,
    configurePreviewServer: mount
  };
}
