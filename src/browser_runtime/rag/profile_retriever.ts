import { scoreMemoryRecord } from "./evidence_ranker.ts";

export const R28RAG3_PROFILE_RETRIEVER_VERSION = "r28rag3-profile-retriever-v1";

export const R28RAG3_CARD_KINDS = Object.freeze([
  "identity",
  "style",
  "value",
  "aesthetic",
  "boundary",
  "capability"
]);

export const R28RAG3_CARD_PROVENANCE = Object.freeze([
  "approved_anchor_summary",
  "hand_authored_boundary",
  "demo_safe"
]);

export const R28RAG3_STATIC_PROFILE_ASSETS = Object.freeze([
  "../another_brain/static_rag/profile_cards.json",
  "../another_brain/static_rag/style_cards.json",
  "../another_brain/static_rag/boundary_cards.json"
]);

const FORBIDDEN_CARD_MARKERS = [
  "question_pack_001",
  "rows 51-100",
  "row 51",
  "row 100",
  "eval prompt",
  "hidden prompt",
  "chain-of-thought",
  "raw private",
  "private_sources/",
  "data/public_ingestion",
  ".docx",
  ".pdf",
  "api key",
  "password"
];

function cleanList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export function validateR28Rag3Card(card = {}) {
  const failures = [];
  if (typeof card.id !== "string" || !card.id.trim()) failures.push("id_missing");
  if (!R28RAG3_CARD_KINDS.includes(card.kind)) failures.push("kind_invalid");
  if (typeof card.text !== "string" || !card.text.trim()) failures.push("text_missing");
  if (!R28RAG3_CARD_PROVENANCE.includes(card.provenance)) failures.push("provenance_invalid");
  if (card.allowed_for_training !== false) failures.push("allowed_for_training_must_be_false");
  if (card.private_raw_data !== false) failures.push("private_raw_data_must_be_false");
  if (card.review_status !== "approved_for_runtime") failures.push("review_status_invalid");
  const searchable = `${card.id || ""}\n${card.kind || ""}\n${card.text || ""}\n${cleanList(card.keywords).join("\n")}`.toLowerCase();
  for (const marker of FORBIDDEN_CARD_MARKERS) {
    if (searchable.includes(marker)) failures.push(`forbidden_marker:${marker}`);
  }
  if ("answer" in card || "final_answer" in card || "answer_text" in card) failures.push("answer_bank_field_rejected");
  return { ok: failures.length === 0, failures };
}

export function normalizeR28Rag3Card(card = {}, index = 0) {
  const validation = validateR28Rag3Card(card);
  if (!validation.ok) {
    throw new Error(`r28rag3_card_invalid:${card.id || index}:${validation.failures.join(",")}`);
  }
  return {
    id: String(card.id),
    kind: String(card.kind),
    text: String(card.text),
    provenance: String(card.provenance),
    allowed_for_training: false,
    private_raw_data: false,
    review_status: "approved_for_runtime",
    keywords: cleanList(card.keywords),
    tone_hints: cleanList(card.tone_hints),
    expressive_hints: cleanList(card.expressive_hints)
  };
}

export function normalizeR28Rag3CardFixture(fixture = {}) {
  const cards = Array.isArray(fixture) ? fixture : fixture.cards;
  if (!Array.isArray(cards)) throw new Error("r28rag3_cards_missing");
  if (fixture?.fixture_policy?.answer_bank === true) throw new Error("r28rag3_answer_bank_fixture_rejected");
  if (fixture?.fixture_policy?.private_raw_data === true) throw new Error("r28rag3_private_raw_fixture_rejected");
  return cards.map(normalizeR28Rag3Card);
}

export function cardToEvidenceRecord(card = {}, index = 0) {
  const normalized = normalizeR28Rag3Card(card, index);
  return {
    source_id: normalized.id,
    title: `R28RAG3 ${normalized.kind} card`,
    text: normalized.text,
    trust_level: normalized.provenance === "approved_anchor_summary" ? "high" : "medium",
    license_or_origin: normalized.provenance,
    can_answer: true,
    keywords: [normalized.kind, normalized.provenance, ...normalized.keywords, ...normalized.tone_hints, ...normalized.expressive_hints],
    metadata: {
      r28rag3_profile_card: true,
      card_kind: normalized.kind,
      provenance: normalized.provenance,
      allowed_for_training: false,
      private_raw_data: false,
      review_status: normalized.review_status,
      tone_hints: [...normalized.tone_hints, ...normalized.expressive_hints],
      expressive_hints: normalized.expressive_hints,
      source_display: `${normalized.kind}:${normalized.provenance}`
    }
  };
}

export function cardsToEvidenceRecords(cards = []) {
  return cards.map(cardToEvidenceRecord);
}

export function rankProfileCards(query, cards = [], options = {}) {
  const topK = Math.max(1, Number(options.topK || 4));
  const minScore = Number(options.minScore ?? 0.025);
  return cardsToEvidenceRecords(cards)
    .map((record, index) => ({
      ...record,
      retrieval_score: Number((scoreMemoryRecord(query, record) + profileKindBoost(query, record)).toFixed(6)),
      _index: index
    }))
    .filter((record) => record.retrieval_score >= minScore)
    .sort((left, right) => right.retrieval_score - left.retrieval_score || left._index - right._index)
    .slice(0, topK)
    .map(({ _index, ...record }) => record);
}

function profileKindBoost(query = "", record = {}) {
  const text = String(query || "").toLowerCase();
  const kind = record.metadata?.card_kind || "";
  if (kind === "aesthetic" && /审美|好看|风格|aesthetic|taste|style/.test(text)) return 0.09;
  if (kind === "value" && /价值|对错|重要|承诺|信任|value/.test(text)) return 0.08;
  if (kind === "boundary" && /证据|不足|冲突|隐藏|系统提示|evidence|conflict|prompt/.test(text)) return 0.08;
  if (kind === "identity" && /你是谁|鳄鱼|关系|identity|who are you/.test(text)) return 0.06;
  if (kind === "capability" && /能做什么|可以帮|capability|help/.test(text)) return 0.06;
  return 0;
}

export function collectToneHints(evidence = [], maxHints = 5) {
  const hints = [];
  for (const item of evidence || []) {
    for (const hint of cleanList(item.metadata?.tone_hints)) {
      if (!hints.includes(hint)) hints.push(hint);
      if (hints.length >= maxHints) return hints;
    }
  }
  return hints;
}

export function summarizeProfileSources(evidence = []) {
  return (evidence || []).map((item) => ({
    source_id: String(item.source_id || ""),
    title: String(item.title || ""),
    provenance: String(item.metadata?.provenance || item.license_or_origin || ""),
    kind: String(item.metadata?.card_kind || ""),
    retrieval_score: Number(item.retrieval_score || 0)
  }));
}
