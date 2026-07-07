import test from "node:test";
import assert from "node:assert/strict";
import { createProcessTrace } from "../../src/browser_runtime/trace/process_trace.ts";
import { summarizeProcessTrace } from "../../src/browser_runtime/trace/trace_summary.ts";

test("R28UX3 process trace schema exposes public pipeline fields", () => {
  const trace = createProcessTrace({
    trace_id: "trace-test",
    runtime_mode: "static_q4_experimental",
    input_packet: { has_user_input: true, has_local_context: true, adapter_context_present: true },
    rag: { retrieval_used: true, evidence_count: 1, evidence_status: "sufficient", top_sources: [{ title: "Local note" }] },
    model: {
      asset_manifest_loaded: true,
      shards_verified: true,
      tokenizer: "exact_runtime_tokenizer",
      q4_forward_ran: true,
      tokens_generated: 1,
      draft_generated: true
    },
    router: { route: "rag_grounded_answer", used_model_draft: true, reason: "" },
    finalizer: { quality_flags: [], fallback_reason: "" }
  });
  assert.equal(trace.trace_id, "trace-test");
  assert.equal(trace.input_packet.has_user_input, true);
  assert.equal(trace.rag.evidence_status, "sufficient");
  assert.equal(trace.model.tokenizer, "exact_runtime_tokenizer");
  assert.equal(trace.model.q4_forward_ran, true);
  assert.equal(trace.router.route, "rag_grounded_answer");
  assert.equal(trace.finalizer.final_answer_source, "model_draft");
  assert.deepEqual(trace.non_claims, {
    product_admission: false,
    browser_admission: false,
    release_checkpoint: false
  });

  const summary = summarizeProcessTrace(trace);
  assert.equal(summary.final_answer_source, "model_draft");
  assert.equal(summary.public_process_summary_only, true);
});
