import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("query routes have direct static entries instead of canonicalization scripts", async () => {
  const noSlash = await readFile(new URL("../../web/another_brain_chat.html", import.meta.url), "utf8");
  const slash = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  assert.ok(noSlash.includes("R28HOTFIX1") || noSlash.includes("R28HOTFIX2"));
  assert.ok(slash.includes("R28HOTFIX1") || slash.includes("R28HOTFIX2"));
  assert.equal(noSlash.includes("URLSearchParams(window.location.search)"), false);
  assert.equal(slash.includes("URLSearchParams(window.location.search)"), false);
  assert.equal(noSlash.includes("/another_brain_chat/?v="), false);
});
