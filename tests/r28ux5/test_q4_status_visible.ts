import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("q4 status remains visible in Chat badges and Dashboard trace", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("id=\"q4-status-badge\""));
  assert.ok(html.includes("q4 experimental"));
  assert.ok(html.includes("q4 warmup"));
  assert.ok(app.includes("q4 forward:"));
  assert.ok(app.includes("q4_forward_ran"));
});
