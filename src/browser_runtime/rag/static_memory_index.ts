export const STATIC_RAG_MEMORY_INDEX_ASSET = "../another_brain/static_rag/memory_index.json";
export const STATIC_RAG_SOURCE_REGISTRY_ASSET = "../another_brain/static_rag/source_registry.json";

export const DEFAULT_SOURCE_REGISTRY = Object.freeze({
  schema_version: "r28rag2.source_registry.v1",
  registry_policy: {
    synthetic_public_safe: true,
    private_raw_data: false,
    answer_bank: false,
    eval_prompts: false,
    old_question_pack_001_rows_51_100: false,
    backend_retrieval: false,
    hosted_vector_store: false
  },
  sources: [
    {
      source_id: "r28rag2-system-boundary",
      title: "another_brain runtime boundary",
      origin: "synthetic_public_safe_runtime_note",
      provenance: "R28RAG2 authored static fixture",
      review_status: "reviewed_demo_safe",
      license_or_origin: "synthetic demo fixture",
      allowed_for_training: false
    }
  ]
});

export const DEFAULT_MEMORY_INDEX = Object.freeze({
  schema_version: "r28rag2.static_memory_index.v1",
  index_policy: {
    synthetic_public_safe: true,
    private_raw_data: false,
    answer_bank: false,
    eval_prompts: false,
    old_question_pack_001_rows_51_100: false,
    backend_retrieval: false,
    hosted_vector_store: false
  },
  default_top_k: 3,
  min_score: 0.035,
  records: [
    {
      record_id: "r28rag2-default-pipeline",
      source_id: "r28rag2-system-boundary",
      title: "Local-first answer pipeline",
      text: "another_brain uses local retrieval, an evidence packet, a browser q4 draft path, hard router, finalizer, and fallback.",
      trust_level: "high",
      can_answer: true,
      keywords: ["another_brain", "local", "evidence", "q4", "router", "finalizer", "fallback"]
    }
  ]
});

function assertPolicy(policy = {}, label = "static_rag_policy") {
  const failures = [];
  if (policy.private_raw_data === true) failures.push(`${label}:private_raw_data`);
  if (policy.answer_bank === true) failures.push(`${label}:answer_bank`);
  if (policy.eval_prompts === true) failures.push(`${label}:eval_prompts`);
  if (policy.old_question_pack_001_rows_51_100 === true) failures.push(`${label}:old_question_pack_001_rows_51_100`);
  if (policy.backend_retrieval === true) failures.push(`${label}:backend_retrieval`);
  if (policy.hosted_vector_store === true) failures.push(`${label}:hosted_vector_store`);
  if (failures.length) throw new Error(`static_rag_policy_rejected:${failures.join(",")}`);
}

function assertNoAnswerBankRecord(record, index = 0) {
  for (const key of ["answer", "final_answer", "answer_text", "template_answer"]) {
    if (key in record) throw new Error(`answer_bank_record_rejected:${record.source_id || record.record_id || index}:${key}`);
  }
}

function normalizeTrustLevel(value) {
  return ["high", "medium", "low"].includes(value) ? value : "low";
}

export function normalizeSourceRegistry(registry = DEFAULT_SOURCE_REGISTRY) {
  assertPolicy(registry.registry_policy || {}, "source_registry");
  const sources = Array.isArray(registry.sources) ? registry.sources : [];
  const normalized = sources.map((source, index) => ({
    source_id: String(source.source_id || `r28rag2-source-${index}`),
    title: String(source.title || "Static RAG source"),
    origin: String(source.origin || source.license_or_origin || "synthetic demo fixture"),
    provenance: String(source.provenance || source.origin || "synthetic demo fixture"),
    review_status: String(source.review_status || "reviewed_demo_safe"),
    license_or_origin: String(source.license_or_origin || source.origin || "synthetic demo fixture"),
    allowed_for_training: source.allowed_for_training === true ? false : false
  }));
  return {
    schema_version: String(registry.schema_version || "r28rag2.source_registry.v1"),
    registry_policy: { ...(registry.registry_policy || {}), answer_bank: false, private_raw_data: false },
    sources: normalized,
    by_id: new Map(normalized.map((source) => [source.source_id, source]))
  };
}

export function normalizeMemoryIndex(index = DEFAULT_MEMORY_INDEX, registry = DEFAULT_SOURCE_REGISTRY) {
  assertPolicy(index.index_policy || index.fixture_policy || {}, "memory_index");
  const sourceRegistry = normalizeSourceRegistry(registry);
  const records = Array.isArray(index.records) ? index.records : [];
  const normalized = records.map((record, itemIndex) => {
    assertNoAnswerBankRecord(record, itemIndex);
    const source = sourceRegistry.by_id.get(String(record.source_id || "")) || {};
    return {
      record_id: String(record.record_id || record.id || `r28rag2-record-${itemIndex}`),
      source_id: String(record.source_id || source.source_id || `r28rag2-source-${itemIndex}`),
      title: String(record.title || source.title || "Static RAG memory"),
      text: String(record.text || ""),
      trust_level: normalizeTrustLevel(record.trust_level),
      can_answer: record.can_answer !== false,
      keywords: Array.isArray(record.keywords) ? record.keywords.map(String) : [],
      origin: String(record.origin || source.origin || record.license_or_origin || "synthetic demo fixture"),
      provenance: String(record.provenance || source.provenance || record.license_or_origin || "synthetic demo fixture"),
      review_status: String(record.review_status || source.review_status || "reviewed_demo_safe"),
      license_or_origin: String(record.license_or_origin || source.license_or_origin || "synthetic demo fixture"),
      allowed_for_training: false,
      metadata: { ...(record.metadata || {}), review_status: record.review_status || source.review_status || "reviewed_demo_safe" }
    };
  }).filter((record) => record.text.trim().length > 0);
  return {
    schema_version: String(index.schema_version || "r28rag2.static_memory_index.v1"),
    index_policy: { ...(index.index_policy || index.fixture_policy || {}), answer_bank: false, private_raw_data: false },
    default_top_k: Math.max(1, Number(index.default_top_k || 3)),
    min_score: Number(index.min_score ?? 0.035),
    source_registry: sourceRegistry,
    records: normalized
  };
}

export function validateStaticMemoryIndex(index = DEFAULT_MEMORY_INDEX, registry = DEFAULT_SOURCE_REGISTRY) {
  try {
    const normalized = normalizeMemoryIndex(index, registry);
    return {
      ok: true,
      failures: [],
      record_count: normalized.records.length,
      source_count: normalized.source_registry.sources.length,
      answer_bank: false,
      private_raw_data: false
    };
  } catch (error) {
    return {
      ok: false,
      failures: [error.message || "static_memory_index_invalid"],
      record_count: 0,
      source_count: 0,
      answer_bank: false,
      private_raw_data: false
    };
  }
}
