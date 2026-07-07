import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("UI and public debug code do not display hidden prompt labels", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const displayed = `${html}\n${app}`.toLowerCase();
  assert.equal(displayed.includes("system prompt"), false);
  assert.equal(displayed.includes("developer prompt"), false);
  assert.equal(displayed.includes("hidden prompt"), false);
  assert.ok(app.includes("publicDebugPacket"));
  assert.equal(app.includes("prompt_packet:"), false);
});
