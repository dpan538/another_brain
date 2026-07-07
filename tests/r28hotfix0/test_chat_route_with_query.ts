import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat route query URLs avoid redirect loops", async () => {
  const root = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  const noSlash = await readFile(new URL("../../web/another_brain_chat.html", import.meta.url), "utf8");
  assert.ok(root.includes("R28HOTFIX0") || root.includes("R28HOTFIX1") || root.includes("R28HOTFIX2"));
  assert.ok(noSlash.includes("R28HOTFIX0") || noSlash.includes("R28HOTFIX1") || noSlash.includes("R28HOTFIX2"));
  assert.equal(root.includes("window.location.replace"), false);
  assert.equal(noSlash.includes("window.location.replace"), false);
});
