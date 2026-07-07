import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("process UI labels use process summary wording, not hidden reasoning labels", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const trace = await readFile(new URL("../../src/browser_runtime/trace/process_trace.ts", import.meta.url), "utf8");
  const displayed = `${html}\n${app}\n${trace}`.toLowerCase();
  assert.ok(html.includes("过程摘要"));
  assert.equal(displayed.includes("chain of thought"), false);
  assert.equal(displayed.includes("chain-of-thought"), false);
  assert.equal(displayed.includes("思维链"), false);
});
