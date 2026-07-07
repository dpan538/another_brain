import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("vercel static gate accepts the R28UX4 root chat redirect shape", async () => {
  const gate = await readFile(new URL("../../scripts/check_vercel_static_build.mjs", import.meta.url), "utf8");
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");

  assert.ok(gate.includes("rootHasR28ux4ChatRedirect"));
  assert.ok(gate.includes("another_brain_chat"));
  assert.ok(html.includes("R28UX4"));
  assert.ok(html.includes("another_brain_chat/?v=r28ux4-visible-preview-ui"));
});
