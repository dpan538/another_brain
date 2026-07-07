import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("root is no longer the old simple Answer Machine UI", async () => {
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  assert.equal(html.includes("Answer Machine | efishother"), false);
  assert.equal(html.includes("id=\"chatForm\""), false);
  assert.equal(html.includes("Ask me"), false);
});
