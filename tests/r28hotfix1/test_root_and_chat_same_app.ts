import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("root and chat entries serve the same app shell", async () => {
  const root = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  const noSlash = await readFile(new URL("../../web/another_brain_chat.html", import.meta.url), "utf8");
  const slash = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  assert.equal(root, slash);
  assert.equal(noSlash, slash);
  assert.ok(root.includes('src="/another_brain_chat/app.js?v=r28hotfix1-route-loop-free-runtime"'));
  assert.ok(root.includes('href="/another_brain_chat/styles.css?v=r28hotfix1-route-loop-free-runtime"'));
});
