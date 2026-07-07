import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28UX3 remains static-only with no backend or external model runtime", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const vercel = await readFile(new URL("../../vercel.json", import.meta.url), "utf8");
  assert.ok(html.includes("No backend inference"));
  assert.ok(runtime.includes("backend_inference: false"));
  assert.ok(runtime.includes("external_llm_api: false"));
  assert.equal(runtime.includes("api.openai.com"), false);
  assert.equal(runtime.includes("doubao: true"), false);
  assert.ok(vercel.includes("\"framework\": null"));
  assert.ok(vercel.includes("\"outputDirectory\": \"web\""));
});
