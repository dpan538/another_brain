import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { serverProxyContractFailures, serverProxyFileFailures, isServerProxyPath } from "../../scripts/server_proxy_policy.mjs";
import { isByokProductPath } from "../../scripts/byok_product_policy.mjs";

const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), "utf8");
const codes = (list) => list.map((f) => f.code);
const fakeKey = ["sk", "abcdefghijklmnop1234"].join("-");     // assembled at runtime so this file holds no key-shaped literal

test("the shipped relay satisfies its own contract", async () => {
  const byPath = new Map();
  for (const p of ["app/api/chat.js", "app/server/chat_handler.js", "app/server/dev_middleware.js"]) {
    const text = await read(p); byPath.set(p, text);
    assert.deepEqual(serverProxyFileFailures(p, text), [], p);
    assert.equal(isServerProxyPath(p), true); assert.equal(isByokProductPath(p), false);
  }
  assert.deepEqual(serverProxyContractFailures(byPath), []);
});

test("a key literal, a client-visible key, a log line or another host are each refused", () => {
  assert.ok(codes(serverProxyFileFailures("app/server/chat_handler.js", `const k = "${fakeKey}";`)).includes("server_proxy_contains_key_literal"));
  assert.ok(codes(serverProxyFileFailures("app/server/chat_handler.js", "const k = import.meta.env.VITE_DEEPSEEK_KEY;")).includes("server_proxy_key_in_client_visible_variable"));
  assert.ok(codes(serverProxyFileFailures("app/server/chat_handler.js", "console.log(request.headers)")).includes("server_proxy_logs"));
  assert.ok(codes(serverProxyFileFailures("app/api/chat.js", 'fetch("https://api.openai.com/v1/chat")')).includes("server_proxy_references_other_model_host"));
});

test("a relay that lets the caller pick the model, or skips the origin check, is refused", async () => {
  const good = await read("app/server/chat_handler.js");
  const broken = (edit) => { const m = new Map([["app/server/chat_handler.js", edit(good)], ["app/api/chat.js", "export default (r) => handleChat(r, {})"]]); return codes(serverProxyContractFailures(m)); };
  assert.ok(broken((t) => t.replace(/const MODEL\s*=\s*["'][^"']+["']/, "const MODEL = body.model")).includes("server_proxy_model_not_pinned"));
  assert.ok(broken((t) => t.replace(/buildPersonaSystemPrompt\s*\(/g, "callerPrompt(")).includes("server_proxy_persona_not_injected_on_server"));
  assert.ok(broken((t) => t.replace(/rateLimited/g, "unlimited")).includes("server_proxy_rate_limit_missing"));
});

test("a second route, or a bundle that reads the server environment, is refused", async () => {
  const handler = await read("app/server/chat_handler.js");
  const m = new Map([["app/server/chat_handler.js", handler], ["app/api/chat.js", "export default (r) => handleChat(r, {})"], ["app/api/other.js", "export default () => new Response('x')"], ["app/src/x.js", "const k = process.env.DEEPSEEK_API_KEY"]]);
  const got = codes(serverProxyContractFailures(m));
  assert.ok(got.includes("unreviewed_api_route")); assert.ok(got.includes("client_bundle_reads_server_environment"));
});
