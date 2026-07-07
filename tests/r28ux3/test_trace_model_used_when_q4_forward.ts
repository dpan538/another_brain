import test from "node:test";
import assert from "node:assert/strict";
import { createProcessTrace } from "../../src/browser_runtime/trace/process_trace.ts";
import { summarizeProcessTrace } from "../../src/browser_runtime/trace/trace_summary.ts";

test("trace marks model draft source only when q4 forward ran and draft is used", () => {
  const trace = createProcessTrace({
    runtime_mode: "static_q4_experimental",
    input_packet: { has_user_input: true },
    rag: { retrieval_used: true, evidence_count: 1, evidence_status: "sufficient" },
    model: {
      asset_manifest_loaded: true,
      shards_verified: true,
      tokenizer: "exact_runtime_tokenizer",
      q4_forward_ran: true,
      tokens_generated: 2,
      draft_generated: true
    },
    router: { route: "rag_grounded_answer", used_model_draft: true },
    finalizer: { quality_flags: [], fallback_reason: "" }
  });
  const summary = summarizeProcessTrace(trace);
  assert.equal(summary.q4_forward_ran, true);
  assert.equal(summary.model_draft_generated, true);
  assert.equal(summary.finalizer_replaced_draft, false);
  assert.equal(summary.final_answer_source, "model_draft");
});
