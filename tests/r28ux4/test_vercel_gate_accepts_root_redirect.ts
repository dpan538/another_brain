import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("vercel static gate accepts root chat delivery shapes", async () => {
  const gate = await readFile(new URL("../../scripts/check_vercel_static_build.mjs", import.meta.url), "utf8");
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  const acceptedVersions = ["r28ux4-visible-preview-ui", "r28hotfix0-runtime-ui-activation", "r28hotfix1-route-loop-free-runtime", "r28hotfix2-nonblocking-selfcheck"];

  assert.ok(gate.includes("rootHasR28ux4ChatRedirect"));
  assert.ok(gate.includes("rootHasR28hotfix1DirectApp"));
  assert.ok(gate.includes("another_brain_chat"));
  assert.ok(html.includes("R28UX4") || html.includes("R28HOTFIX0") || html.includes("R28HOTFIX1") || html.includes("R28HOTFIX2"));
  assert.ok(acceptedVersions.some((version) => html.includes(version)));
});
