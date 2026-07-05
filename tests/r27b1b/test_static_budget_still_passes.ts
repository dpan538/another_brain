import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("R27B0 static budget still passes", () => {
  const result = spawnSync("python3", ["scripts/r27b0_static_asset_budget.py"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /passed/);
});
