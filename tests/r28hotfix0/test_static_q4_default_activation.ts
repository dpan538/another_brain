import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("static q4 is the default when committed q4 assets are available", async () => {
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  assert.equal(runtimeMode.model_mode, "static_q4_experimental");
  assert.ok(app.includes('model_mode: "static_q4_experimental"'));
  assert.ok(html.includes("static_q4_experimental"));
  assert.equal(html.includes(">synthetic_tiny<"), false);
});
