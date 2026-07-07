import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28HOTFIX1 removes explicit redirect-loop sources", async () => {
  const vercel = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  const root = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  const noSlash = await readFile(new URL("../../web/another_brain_chat.html", import.meta.url), "utf8");
  const slash = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const combined = `${root}\n${noSlash}\n${slash}`;
  assert.equal(Array.isArray(vercel.redirects) ? vercel.redirects.length : 0, 0);
  assert.equal(/http-equiv=["']refresh/i.test(combined), false);
  assert.equal(/location\.replace|location\.href|history\.replaceState/.test(combined), false);
  assert.ok(combined.includes("R28HOTFIX1") || combined.includes("R28HOTFIX2"));
});
