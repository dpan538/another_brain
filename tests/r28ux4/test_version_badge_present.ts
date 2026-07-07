import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("version badge and build status are visible", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(html.includes("ui-version-badge"));
  assert.ok(html.includes("R28UX4") || html.includes("R28HOTFIX0") || html.includes("R28HOTFIX1") || html.includes("R28HOTFIX2") || html.includes("R28HOTFIX3"));
  assert.ok(html.includes("r28ux4-visible-preview-ui") || html.includes("r28hotfix0-runtime-ui-activation") || html.includes("r28hotfix1-route-loop-free-runtime") || html.includes("r28hotfix2-nonblocking-selfcheck") || html.includes("r28hotfix3-q4-asset-path-fix"));
  assert.ok(app.includes("R28UX4_UI_VERSION") || app.includes("R28HOTFIX0_UI_VERSION") || app.includes("R28HOTFIX1_UI_VERSION") || app.includes("R28HOTFIX2_UI_VERSION") || app.includes("R28HOTFIX3_UI_VERSION"));
});
