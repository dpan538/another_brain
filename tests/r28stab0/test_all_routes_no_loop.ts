import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routes = [
  "/",
  "/another_brain_chat",
  "/another_brain_chat/",
  "/another_brain_chat?message=你好",
  "/another_brain_chat/?message=你是谁",
  "/another_brain_chat?message=你从哪里来",
  "/another_brain_chat?message=你是鳄鱼吗"
];

const routeEntries = new Map([
  ["/", "../../web/index.html"],
  ["/another_brain_chat", "../../web/another_brain_chat.html"],
  ["/another_brain_chat/", "../../web/another_brain_chat/index.html"]
]);

function routePath(route) {
  return new URL(route, "https://local.test").pathname;
}

test("R28STAB0 route matrix serves direct static entries without loops", async () => {
  const vercel = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.equal(vercel.outputDirectory, "web");
  assert.equal(vercel.buildCommand, "npm run build:vercel");
  assert.equal(Array.isArray(vercel.redirects) ? vercel.redirects.length : 0, 0);

  for (const route of routes) {
    const entry = routeEntries.get(routePath(route));
    assert.ok(entry, route);
    const html = await readFile(new URL(entry, import.meta.url), "utf8");
    assert.ok(html.includes("R28UX5") || html.includes("R28RAG3") || html.includes("R28SURF2") || html.includes("R28ROUT1") || html.includes("R28HOTFIX3") || html.includes("R28HOTFIX2") || html.includes("R28HOTFIX1"), route);
    assert.ok(html.includes("过程摘要"), route);
    assert.ok(html.includes("检查本地模型路径"), route);
    assert.ok(html.includes("static_q4_experimental"), route);
    assert.ok(html.includes("exact_runtime_tokenizer"), route);
    assert.ok(html.includes('name="viewport"'), route);
    assert.ok(html.includes("/another_brain_chat/app.js"), route);
    assert.ok(html.includes("/another_brain_chat/styles.css"), route);
    assert.equal(/http-equiv=["']refresh/i.test(html), false, route);
    assert.equal(/location\.replace|location\.href|history\.replaceState/.test(html), false, route);
  }
});
