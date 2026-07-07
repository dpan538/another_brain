import { inferFinalAnswerSource } from "./process_trace.ts";

export function summarizeProcessTrace(trace = {}) {
  const finalAnswerSource = inferFinalAnswerSource(trace);
  return {
    trace_id: trace.trace_id || "",
    runtime_mode: trace.runtime_mode || "fallback",
    evidence_status: trace.rag?.evidence_status || "none",
    q4_forward_ran: trace.model?.q4_forward_ran === true,
    model_draft_generated: trace.model?.draft_generated === true,
    finalizer_replaced_draft: trace.router?.replaced_model_draft === true,
    route: trace.router?.route || "synthetic_demo_fallback",
    fallback_reason: trace.finalizer?.fallback_reason || trace.router?.reason || "",
    final_answer_source: finalAnswerSource,
    public_process_summary_only: true,
    non_claims: {
      product_admission: false,
      browser_admission: false,
      release_checkpoint: false
    }
  };
}
