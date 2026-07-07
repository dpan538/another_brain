import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("evidence drawer is collapsible and describes evidence as support, not an answer bank", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");

  for (const id of ["debug-toggle", "debug-output", "evidence-count", "evidence-list", "packet-debug-output"]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(`#${id}`));
  }
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Evidence 是辅助证据，不是 answer bank/);
  assert.match(app, /renderEvidence/);
  assert.match(app, /textContent = record\.text/);
  assert.doesNotMatch(app, /innerHTML/);
});
