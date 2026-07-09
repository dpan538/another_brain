import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard self-check remains nonblocking and recoverable", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("id=\"model-self-check-button\""));
  assert.ok(html.includes("id=\"model-self-check-stop-button\""));
  assert.ok(app.includes("deepSelfCheckModelPath"));
  assert.ok(app.includes("activeSelfCheckController"));
  assert.ok(app.includes("self_check_cancelled"));
  assert.ok(app.includes("setDisabled(modelSelfCheckButton, false)"));
});
