import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("runtime reports normalized asset probe paths, not route-relative manifest paths", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(runtime.includes("asset_probe_failed:${url.pathname}:${response?.status || 0}"));
  assert.equal(runtime.includes("asset_probe_failed:${path}:${response?.status || 0}"), false);
});
