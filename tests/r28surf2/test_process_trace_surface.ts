import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { buildProcessTraceFromPacket } from "../../src/browser_runtime/trace/process_trace.ts";

test("process trace exposes SURF2 surface source and confidence without q4 draft", () => {
  const policy = applyAnswerSurfacePolicy({ user_input: "你好", evidence_status: "none", model_output: "" });
  assert.equal(policy.route, "greeting_surface");
  assert.equal(policy.use_model_draft, false);
  assert.ok(policy.intent_confidence >= 0.58);

  const trace = buildProcessTraceFromPacket({
    input: "你好",
    decoder_draft: "",
    evidence_packet: { evidence_status: "none", retrieved_evidence: [] },
    runtime_stats: { runtime_mode: "static_q4_experimental", tokens_generated: 0, fallback_used: true },
    route_policy: policy,
    answer_route: policy.route,
    use_model_draft: false,
    quality_flags: policy.quality_flags
  });
  assert.equal(trace.router.route, "greeting_surface");
  assert.equal(trace.router.intent, "greeting");
  assert.ok(trace.router.intent_confidence >= 0.58);
  assert.equal(trace.router.used_model_draft, false);
  assert.equal(trace.model.q4_forward_ran, false);
  assert.equal(trace.finalizer.final_answer_source, "router_surface");
});
