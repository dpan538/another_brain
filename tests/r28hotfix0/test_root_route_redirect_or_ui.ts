import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("root route exposes the process UI", async () => {
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("R28HOTFIX0") || html.includes("R28HOTFIX1"));
  assert.ok(html.includes("/another_brain_chat/"));
  assert.ok(html.includes("r28hotfix0-runtime-ui-activation") || html.includes("r28hotfix1-route-loop-free-runtime"));
  assert.ok(html.includes("过程摘要"));
});
