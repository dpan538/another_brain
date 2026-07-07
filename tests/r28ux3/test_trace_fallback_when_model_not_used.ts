import test from "node:test";
import assert from "node:assert/strict";
import { createProcessTrace } from "../../src/browser_runtime/trace/process_trace.ts";
import { summarizeProcessTrace } from "../../src/browser_runtime/trace/trace_summary.ts";

test("trace does not claim model answer when q4 forward did not run", () => {
  const trace = createProcessTrace({
    runtime_mode: "static_q4_experimental",
    input_packet: { has_user_input: true },
    rag: { retrieval_used: true, evidence_count: 0, evidence_status: "insufficient" },
    model: {
      asset_manifest_loaded: true,
      shards_verified: true,
      tokenizer: "exact_runtime_tokenizer",
      q4_forward_ran: false,
      tokens_generated: 0,
      draft_generated: false
    },
    router: { route: "insufficient_evidence_boundary", used_model_draft: false, reason: "insufficient_evidence" },
    finalizer: { quality_flags: ["insufficient_evidence"], fallback_reason: "insufficient_evidence" }
  });
  const summary = summarizeProcessTrace(trace);
  assert.equal(summary.q4_forward_ran, false);
  assert.notEqual(summary.final_answer_source, "model_draft");
  assert.equal(summary.final_answer_source, "router_boundary");
});
