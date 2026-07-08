import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("visible UX does not present hidden chain-of-thought panels or labels", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const loading = await readFile(new URL("../../web/another_brain_chat/loading_screen.js", import.meta.url), "utf8");
  const visibleSurface = [html, app, loading].join("\n").toLowerCase();

  assert.equal(visibleSurface.includes("chain-of-thought"), false);
  assert.equal(visibleSurface.includes("chain of thought"), false);
  assert.equal(visibleSurface.includes("cot panel"), false);
  assert.equal(visibleSurface.includes("思维链"), false);
  assert.ok(html.includes("message-meta"));
  assert.ok(html.includes("source: router"));
  assert.ok(html.includes("evidence: none"));
});
