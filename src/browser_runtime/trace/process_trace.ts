import { createTraceEvent } from "./trace_event.ts";

export const PROCESS_TRACE_RUNTIME_MODES = Object.freeze([
  "static_q4_experimental",
  "synthetic_tiny",
  "mock",
  "fallback"
]);

export const PROCESS_TRACE_ROUTES = Object.freeze([
  "direct_model_draft",
  "rag_grounded_answer",
  "greeting_surface",
  "identity_surface",
  "origin_surface",
  "capability_surface",
  "relation_surface",
  "value_surface",
  "aesthetic_surface",
  "abstract_meaning_surface",
  "abstract_value_question",
  "philosophical_question",
  "aesthetic_question",
  "value_or_relation_question",
  "abstract_meaning_question",
  "open_question",
  "smalltalk_surface",
  "runtime_status_surface",
  "insufficient_evidence_boundary",
  "conflicting_evidence_boundary",
  "malicious_evidence_boundary",
  "model_gibberish_fallback",
  "synthetic_demo_fallback",
  "not_product_status"
]);

export const FINAL_ANSWER_SOURCES = Object.freeze([
  "model_draft",
  "router_surface",
  "router_boundary",
  "fallback"
]);

function bool(value) {
  return value === true;
}

function safeString(value, fallback = "") {
  return typeof value === "string" && value ? value : fallback;
}

function publicSourceSummary(item = {}) {
  return {
    source_id: safeString(item.source_id, safeString(item.id, "local")),
    title: safeString(item.title, "local evidence"),
    trust_level: safeString(item.trust_level, "local_static"),
    retrieval_score: Number.isFinite(Number(item.retrieval_score)) ? Number(item.retrieval_score) : 0,
    provenance: safeString(item.metadata?.provenance, safeString(item.provenance, safeString(item.license_or_origin, "local_static"))),
    kind: safeString(item.metadata?.card_kind, safeString(item.kind, safeString(item.metadata?.kind, ""))),
    tone_hints: Array.isArray(item.metadata?.tone_hints)
      ? item.metadata.tone_hints.map(String).slice(0, 5)
      : (Array.isArray(item.tone_hints) ? item.tone_hints.map(String).slice(0, 5) : [])
  };
}

export function inferFinalAnswerSource(trace = {}) {
  if (trace?.router?.used_model_draft === true && trace?.model?.q4_forward_ran === true) return "model_draft";
  if (String(trace?.router?.route || "").endsWith("_surface")) return "router_surface";
  if (trace?.router?.replaced_model_draft === true || String(trace?.router?.route || "").includes("boundary")) return "router_boundary";
  return "fallback";
}

export function createProcessTrace(input = {}) {
  const runtimeMode = safeString(input.runtime_mode, "fallback");
  const q4ForwardRan = bool(input.model?.q4_forward_ran);
  const draftGenerated = bool(input.model?.draft_generated);
  const usedModelDraft = bool(input.router?.used_model_draft);
  const replacedModelDraft = draftGenerated && !usedModelDraft;
  const events = Array.isArray(input.events) ? [...input.events] : [];
  const trace = {
    trace_id: safeString(input.trace_id, `trace_${Date.now().toString(36)}`),
    created_at: safeString(input.created_at, new Date().toISOString()),
    runtime_mode: PROCESS_TRACE_RUNTIME_MODES.includes(runtimeMode) ? runtimeMode : runtimeMode,
    input_packet: {
      has_user_input: bool(input.input_packet?.has_user_input),
      has_local_context: bool(input.input_packet?.has_local_context),
      adapter_context_present: bool(input.input_packet?.adapter_context_present)
    },
    rag: {
      retrieval_used: bool(input.rag?.retrieval_used),
      evidence_count: Math.max(0, Number(input.rag?.evidence_count || 0)),
      evidence_status: safeString(input.rag?.evidence_status, "none"),
      top_sources: Array.isArray(input.rag?.top_sources) ? input.rag.top_sources.map(publicSourceSummary).slice(0, 3) : [],
      tone_hints: Array.isArray(input.rag?.tone_hints) ? input.rag.tone_hints.map(String).slice(0, 5) : [],
      profile_pack: input.rag?.profile_pack || null
    },
    model: {
      asset_manifest_loaded: bool(input.model?.asset_manifest_loaded),
      shards_verified: bool(input.model?.shards_verified),
      tokenizer: safeString(input.model?.tokenizer, "none"),
      q4_forward_ran: q4ForwardRan,
      tokens_generated: Math.max(0, Number(input.model?.tokens_generated || 0)),
      draft_generated: draftGenerated
    },
    router: {
      route: safeString(input.router?.route, "synthetic_demo_fallback"),
      used_model_draft: usedModelDraft,
      replaced_model_draft: replacedModelDraft,
      reason: safeString(input.router?.reason, ""),
      intent: safeString(input.router?.intent, ""),
      intent_confidence: Number.isFinite(Number(input.router?.intent_confidence)) ? Number(input.router.intent_confidence) : 0,
      fragment_ids: Array.isArray(input.router?.fragment_ids) ? input.router.fragment_ids.map(String) : [],
      indexed_surface: bool(input.router?.indexed_surface)
    },
    finalizer: {
      final_answer_source: FINAL_ANSWER_SOURCES.includes(input.finalizer?.final_answer_source)
        ? input.finalizer.final_answer_source
        : "fallback",
      quality_flags: Array.isArray(input.finalizer?.quality_flags) ? input.finalizer.quality_flags.map(String) : [],
      fallback_reason: safeString(input.finalizer?.fallback_reason, "")
    },
    non_claims: {
      product_admission: false,
      browser_admission: false,
      release_checkpoint: false
    },
    events
  };
  trace.finalizer.final_answer_source = inferFinalAnswerSource(trace);
  return trace;
}

export function buildProcessTraceFromPacket(packet = {}, options = {}) {
  const runtimeStats = packet.runtime_stats || {};
  const evidencePacket = packet.evidence_packet || {};
  const evidence = packet.retrieved_evidence || evidencePacket.retrieved_evidence || [];
  const routePolicy = packet.route_policy || {};
  const q4ForwardRan = runtimeStats.runtime_mode === "static_q4_experimental"
    && Number(runtimeStats.tokens_generated || 0) > 0
    && runtimeStats.fallback_used !== true;
  const draftGenerated = String(packet.decoder_draft || "").trim().length > 0;
  const events = [
    createTraceEvent("input_received", { has_user_input: String(packet.input || "").trim().length > 0 }),
    createTraceEvent("adapter_context_loaded", { adapter_context_present: packet.adapter_context_summary?.packet_count > 0 }),
    createTraceEvent("rag_retrieval_started"),
    createTraceEvent("rag_retrieval_completed", { evidence_count: evidence.length, evidence_status: evidencePacket.evidence_status || "none" }),
    createTraceEvent("model_manifest_loaded", { asset_manifest_loaded: packet.asset_status?.verification !== "no_model_assets" }),
    createTraceEvent("q4_shards_verified", { q4_forward_ran: q4ForwardRan }),
    createTraceEvent("tokenizer_ready", { tokenizer: runtimeStats.decode_status || packet.decode_status || "none" }),
    createTraceEvent("q4_forward_started", { runtime_mode: runtimeStats.runtime_mode || packet.state_packet?.mode || "fallback" }),
    createTraceEvent("q4_forward_completed", { q4_forward_ran: q4ForwardRan, tokens_generated: runtimeStats.tokens_generated || 0 }),
    createTraceEvent("draft_generated", { draft_generated: draftGenerated }),
    createTraceEvent("router_route_selected", { route: packet.answer_route || routePolicy.route || "synthetic_demo_fallback", intent_confidence: routePolicy.intent_confidence || 0 }),
    createTraceEvent("finalizer_applied", { used_model_draft: routePolicy.use_model_draft === true }),
    ...(packet.fallback_used ? [createTraceEvent("fallback_used", { reason: packet.fallback_reason || routePolicy.fallback_reason || "" })] : []),
    createTraceEvent("answer_completed", { final_answer_source: packet.use_model_draft ? "model_draft" : "fallback" })
  ];
  return createProcessTrace({
    trace_id: options.trace_id,
    created_at: options.created_at,
    runtime_mode: runtimeStats.runtime_mode || packet.state_packet?.mode || "fallback",
    input_packet: {
      has_user_input: String(packet.input || "").trim().length > 0,
      has_local_context: Boolean(packet.adapter_context_summary?.packet_count),
      adapter_context_present: Boolean(packet.adapter_context_summary?.packet_count)
    },
    rag: {
      retrieval_used: true,
      evidence_count: evidence.length,
      evidence_status: evidencePacket.evidence_status || "none",
      top_sources: evidence,
      tone_hints: Array.isArray(evidencePacket.rag_profile_pack?.tone_hints)
        ? evidencePacket.rag_profile_pack.tone_hints.map(String).slice(0, 5)
        : [],
      profile_pack: evidencePacket.rag_profile_pack
        ? {
            version: evidencePacket.rag_profile_pack.version || "",
            runtime_hints_only: evidencePacket.rag_profile_pack.runtime_hints_only === true,
            broad_answer_bank: evidencePacket.rag_profile_pack.broad_answer_bank === true,
            private_raw_data: evidencePacket.rag_profile_pack.private_raw_data === true,
            hosted_vector_store: evidencePacket.rag_profile_pack.hosted_vector_store === true
          }
        : null
    },
    model: {
      asset_manifest_loaded: packet.asset_status?.verification !== "no_model_assets",
      shards_verified: q4ForwardRan,
      tokenizer: packet.decode_status || runtimeStats.decode_status || "none",
      q4_forward_ran: q4ForwardRan,
      tokens_generated: runtimeStats.tokens_generated || 0,
      draft_generated: draftGenerated
    },
    router: {
      route: packet.answer_route || routePolicy.route || "synthetic_demo_fallback",
      used_model_draft: routePolicy.use_model_draft === true,
      reason: packet.fallback_reason || routePolicy.fallback_reason || "",
      intent: routePolicy.intent || "",
      intent_confidence: routePolicy.intent_confidence || 0,
      fragment_ids: routePolicy.fragment_ids || [],
      indexed_surface: routePolicy.indexed_surface === true
    },
    finalizer: {
      final_answer_source: packet.use_model_draft ? "model_draft" : "fallback",
      quality_flags: packet.quality_flags || routePolicy.quality_flags || [],
      fallback_reason: packet.fallback_reason || routePolicy.fallback_reason || ""
    },
    events
  });
}
