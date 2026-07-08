import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("identity route stays under 100ms and bypasses q4 generation", () => {
  let maxMs = 0;
  let surfaced = null;
  for (let index = 0; index < 120; index += 1) {
    const started = process.hrtime.bigint();
    surfaced = applyAnswerSurfacePolicy({ user_input: "你是谁？", evidence_status: "none", model_output: "" });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    maxMs = Math.max(maxMs, elapsedMs);
  }
  assert.equal(surfaced.route, "identity_surface");
  assert.equal(surfaced.fallback_used, false);
  assert.equal(surfaced.final_answer_source, "router_surface");
  assert.match(surfaced.final_answer, /我是鳄鱼|另一个大脑/);
  assert.ok(maxMs < 100, `identity max latency ${maxMs}ms`);
});
