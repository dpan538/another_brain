import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("/another_brain_chat without trailing slash is canonicalized", async () => {
  const fallback = await readFile(new URL("../../web/another_brain_chat.html", import.meta.url), "utf8");
  const vercel = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.ok(fallback.includes("R28HOTFIX0"));
  assert.ok(fallback.includes("/another_brain_chat/"));
  assert.ok((vercel.redirects || []).some((item) => item.source === "/another_brain_chat" && item.destination === "/another_brain_chat/"));
});
