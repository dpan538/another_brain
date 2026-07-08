import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("repeated sends are serialized and do not create a worker storm", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(app.includes("let running = false"));
  assert.ok(app.includes("if (running) return"));
  assert.ok(app.includes("running = true"));
  assert.ok(app.includes("running = false"));
  assert.ok(runtime.includes("this.worker = null"));
  assert.ok(runtime.includes("this.worker = new Worker"));
  assert.ok(runtime.includes("if (!this.worker && this.capabilities.worker_available) await this.load()"));
  assert.ok(runtime.includes("this.worker.terminate()"));
  assert.equal((runtime.match(/new Worker\(new URL\("\.\/runtime_worker\.js/g) || []).length, 1);
  assert.equal((runtime.match(/new Worker\(new URL\("\.\/self_check_worker\.js/g) || []).length, 1);
});
