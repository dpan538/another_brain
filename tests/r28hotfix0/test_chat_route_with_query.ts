import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat route redirects preserve query strings", async () => {
  const root = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  const noSlash = await readFile(new URL("../../web/another_brain_chat.html", import.meta.url), "utf8");
  assert.ok(root.includes("URLSearchParams(window.location.search)"));
  assert.ok(noSlash.includes("URLSearchParams(window.location.search)"));
  assert.ok(root.includes('key !== "v"'));
  assert.ok(noSlash.includes('key !== "v"'));
});
