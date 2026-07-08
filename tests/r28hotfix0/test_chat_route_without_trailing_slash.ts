import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("/another_brain_chat without trailing slash is supported", async () => {
  const fallback = await readFile(new URL("../../web/another_brain_chat.html", import.meta.url), "utf8");
  const vercel = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.ok(fallback.includes("R28HOTFIX0") || fallback.includes("R28HOTFIX1") || fallback.includes("R28HOTFIX2") || fallback.includes("R28HOTFIX3"));
  assert.ok(fallback.includes("过程摘要"));
  assert.equal((vercel.redirects || []).some((item) => item.source === "/another_brain_chat" && item.destination === "/another_brain_chat/"), false);
});
