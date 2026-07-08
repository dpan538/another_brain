import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");
const app = readFileSync("web/another_brain_chat/app.js", "utf8");

test("HOTFIX4 keeps non-product boundaries explicit", () => {
  assert.match(runtime, /product_admission:\s*false/);
  assert.match(runtime, /browser_admission:\s*false/);
  assert.match(runtime, /release_checkpoint:\s*false/);
  assert.match(app, /not product, browser, or release admission/);
  assert.doesNotMatch(app, /product_model:\s*true/);
});
