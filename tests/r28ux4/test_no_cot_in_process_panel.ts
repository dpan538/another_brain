import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("visible process panel does not use hidden reasoning labels", async () => {
  const root = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  const chat = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const visible = `${root}\n${chat}\n${app}`.toLowerCase();
  assert.equal(visible.includes("chain of thought"), false);
  assert.equal(visible.includes("chain-of-thought"), false);
  assert.equal(visible.includes("思维链"), false);
  assert.equal(visible.includes("hidden prompt"), false);
});
