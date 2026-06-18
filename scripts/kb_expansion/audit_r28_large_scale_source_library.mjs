import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const REPORT_DIR = path.join(ROOT, "artifacts", "training_os", "kb_expansion");
const GENERATED = path.join(ROOT, "web", "culture_cards.generated.js");

const MODE = process.argv.includes("--pre") ? "pre" : "post";
const BASELINE_COMMIT = "0463ddd6330cb0c821f7598161f0d63df8f833eb";
const BASELINE = {
  source_cards: 2676,
  active_runtime_source_cards: 1070,
  generated_runtime_cards: 1069,
  generated_size_bytes: 3454705,
  generated_sha256: "46e4d05cc0ea342bd80c0844f59d3fed195a0689a37250f25a62a2d78ab81cb8",
  pre_r24_generated_size_bytes: 1649822,
  relation_density: 0.541
};

const R28_FILES = new Set([
  "r28_cleanup_alias_boundary_cards.jsonl",
  "r28_large_scale_literature_film_music.jsonl",
  "r28_large_scale_art_city_science_law.jsonl",
  "r28_large_scale_bridge_guardrail.jsonl"
]);

const PROFILE_PATTERNS = [
  { name: "can_from", re: /可以从/ },
  { name: "enter", re: /进入/ },
  { name: "this_object", re: /这个对象/ },
  { name: "understand_as", re: /可以理解为/ },
  { name: "focus_on", re: /重点在/ },
  { name: "assistant_control", re: /我会按|这里说的是|换个说法|简单说|我接住|更深一点|你可以继续问/ },
  { name: "implementation_leakage", re: /本地知识卡|当前会话|求解器|active topic|response mode/i },
  { name: "runtime_or_profile_content", re: /\b(runtime|profile)\b/i }
];
const LONG_CHINESE_SENTENCE_RE = /[\u4e00-\u9fff][^。！？\n]{60,}[。！？]/;

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeJson(file, value) {
  ensureDir(file);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(file, text) {
  ensureDir(file);
  fs.writeFileSync(file, text);
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => ({ ...JSON.parse(line), __file: path.relative(ROOT, file), __line: index + 1 }));
}

function allCards() {
  const rows = [];
  if (!fs.existsSync(CARD_DIR)) return rows;
  for (const file of fs.readdirSync(CARD_DIR).filter((name) => name.endsWith(".jsonl")).sort()) {
    rows.push(...readJsonl(path.join(CARD_DIR, file)));
  }
  return rows;
}

function readGeneratedCards() {
  if (!fs.existsSync(GENERATED)) return [];
  const text = fs.readFileSync(GENERATED, "utf8");
  const match = text.match(/export const CULTURE_CARDS = ([\s\S]*);\n?$/);
  return match ? JSON.parse(match[1]) : [];
}

function generatedInfo() {
  const cards = readGeneratedCards();
  const size = fs.existsSync(GENERATED) ? fs.statSync(GENERATED).size : 0;
  return {
    exists: fs.existsSync(GENERATED),
    cards: cards.length,
    size_bytes: size,
    sha256: fs.existsSync(GENERATED) ? crypto.createHash("sha256").update(fs.readFileSync(GENERATED)).digest("hex") : null,
    size_ratio_from_r27: Number((size / BASELINE.generated_size_bytes).toFixed(3)),
    size_ratio_from_pre_r24: Number((size / BASELINE.pre_r24_generated_size_bytes).toFixed(3)),
    over_6mb_warning: size > 6_000_000,
    over_8mb_stop_threshold: size > 8_000_000
  };
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function isActive(card) {
  return card.approved_for_public_runtime === true && card.visibility === "public";
}

function isConcept(card) {
  return ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type);
}

function isRelationLike(card) {
  return card.entity_type === "relation" || /boundary|negative|contrast|guardrail|alias|example/i.test(String(card.relation_type || card.pack_id || card.domain || ""));
}

function typeOfId(id = "") {
  if (id.startsWith("person.")) return "person";
  if (id.startsWith("work.")) return "work";
  if (/^(concept|theme|movement|period|genre)\./.test(id)) return "concept";
  if (id.startsWith("relation.")) return "relation";
  return "other";
}

function domainFamily(domain = "") {
  if (/music|song|mandopop|cantopop|jazz|blues|rock|album/i.test(domain)) return "music";
  if (/film|cinema|movie|media|documentary/i.test(domain)) return "film_media";
  if (/literature|poetry|novel|world_lit|modernism|korean|russian|latin|french|english/i.test(domain)) return "literature";
  if (/art|image|photo|design|bauhaus|interface|architecture/i.test(domain)) return "art_image_design_architecture";
  if (/language|philosophy|social_thought|political/i.test(domain)) return "philosophy_language_social";
  if (/city|urban|food|daily|cooking/i.test(domain)) return "city_food_daily";
  if (/science|technology|computing|ai|information/i.test(domain)) return "science_technology";
  if (/economy|law|education|care|psychology|boundary/i.test(domain)) return "economy_law_education_care";
  if (/bridge|relation|guardrail|negative/i.test(domain)) return "bridge_guardrail";
  if (/method/i.test(domain)) return "method_policy";
  return domain.split(".")[0] || "unknown";
}

function isMethodCard(card) {
  return String(card.id || "").startsWith("method.") ||
    String(card.domain || "").startsWith("method.") ||
    (Array.isArray(card.eval_tags) && card.eval_tags.includes("method_card"));
}

function isExternalSeed(card) {
  return String(card.id || "").startsWith("external.");
}

function collectRefs(card) {
  const refs = [];
  const add = (id, field) => {
    if (typeof id === "string" && id.includes(".")) refs.push({ id, field });
  };
  for (const field of ["works", "representative_works", "related_concepts", "related_people", "relation_ids", "source_ids", "target_ids", "creator_ids", "example_ids", "concepts"]) {
    if (Array.isArray(card[field])) card[field].forEach((id) => add(id, field));
  }
  if (Array.isArray(card.related_entities)) {
    card.related_entities.forEach((item) => add(typeof item === "string" ? item : item?.id, "related_entities"));
  }
  return refs;
}

function contentStrings(card) {
  const fields = [
    "names",
    "factual_core",
    "short_intro",
    "themes",
    "style_axes",
    "historical_context",
    "entry_points",
    "comparison_axes",
    "conversation_moves",
    "safe_boundaries",
    "not_to_infer",
    "definition_units",
    "examples",
    "non_examples",
    "common_misreadings",
    "negative_moves",
    "boundary_notes",
    "safe_summary_units",
    "source_summary",
    "uncertainty_notes",
    "constraints",
    "shared_axes",
    "contrast_axes",
    "licensed_verbs"
  ];
  const out = [];
  const collect = (value) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  fields.forEach((field) => collect(card[field]));
  return out;
}

function profileHits(card) {
  const text = contentStrings(card).join("\n");
  return PROFILE_PATTERNS.filter((pattern) => pattern.re.test(text)).map((pattern) => pattern.name);
}

function longSnippetHits(card) {
  return contentStrings(card).filter((text) => LONG_CHINESE_SENTENCE_RE.test(text));
}

function endpointRelationCounts(cards) {
  const map = new Map();
  for (const card of cards.filter((row) => row.entity_type === "relation")) {
    for (const id of [...(card.source_ids || []), ...(card.target_ids || [])]) {
      map.set(id, (map.get(id) || 0) + 1);
    }
  }
  return map;
}

function orphanStatus(card, universeCards) {
  const ids = new Set(universeCards.map((row) => row.id));
  const relCounts = endpointRelationCounts(universeCards);
  const relationCount = relCounts.get(card.id) || (Array.isArray(card.relation_ids) ? card.relation_ids.filter((id) => ids.has(id)).length : 0);
  if (card.entity_type === "person") {
    const works = [...(card.works || []), ...(card.representative_works || [])].filter((id) => ids.has(id));
    if (works.length === 0 || relationCount === 0) return "orphan_person";
  }
  if (card.entity_type === "work") {
    const refs = collectRefs(card);
    const creators = (card.creator_ids || refs.filter((ref) => ref.id.startsWith("person.")).map((ref) => ref.id)).filter((id) => ids.has(id));
    const concepts = [...(card.concepts || []), ...refs.filter((ref) => typeOfId(ref.id) === "concept").map((ref) => ref.id)].filter((id) => ids.has(id));
    if (creators.length === 0 || concepts.length === 0 || relationCount === 0) return "orphan_work";
  }
  if (isConcept(card)) {
    const examples = Array.isArray(card.examples) ? card.examples.length : 0;
    const hasNegative = (Array.isArray(card.negative_moves) && card.negative_moves.length) ||
      (Array.isArray(card.non_examples) && card.non_examples.length) ||
      (Array.isArray(card.common_misreadings) && card.common_misreadings.length);
    if (examples === 0 || !hasNegative || relationCount === 0) return "orphan_concept";
  }
  if (card.entity_type === "relation") {
    const missing = [...(card.source_ids || []), ...(card.target_ids || [])]
      .filter((id) => ["person", "work", "concept"].includes(typeOfId(id)) && !ids.has(id));
    if (missing.length || !(card.source_ids || []).length || !(card.target_ids || []).length) return "relation_missing_endpoint";
  }
  return "closed_or_non_anchor";
}

function missingRefs(cards, activeOnly = false) {
  const universe = activeOnly ? cards.filter(isActive) : cards;
  const ids = new Set(universe.map((row) => row.id));
  return universe.flatMap((card) => collectRefs(card).map((ref) => ({
    from: card.id,
    from_file: card.__file,
    id: ref.id,
    field: ref.field,
    missing_type: typeOfId(ref.id)
  }))).filter((ref) => ["person", "work", "concept"].includes(ref.missing_type) && !ids.has(ref.id));
}

function closureMetrics(cards) {
  const ids = new Set(cards.map((card) => card.id));
  const relCounts = endpointRelationCounts(cards);
  const persons = cards.filter((card) => card.entity_type === "person");
  const works = cards.filter((card) => card.entity_type === "work");
  const concepts = cards.filter(isConcept);
  const relations = cards.filter((card) => card.entity_type === "relation");
  const personClosed = persons.filter((card) => [...(card.works || []), ...(card.representative_works || [])].some((id) => ids.has(id)) && relCounts.has(card.id));
  const workClosed = works.filter((card) => collectRefs(card).some((ref) => typeOfId(ref.id) === "concept" && ids.has(ref.id)) && relCounts.has(card.id));
  const conceptClosed = concepts.filter((card) => relCounts.has(card.id) || (card.relation_ids || []).some((id) => ids.has(id)));
  return {
    relation_density: Number((relations.length / Math.max(1, cards.length)).toFixed(3)),
    person_to_work_closure_ratio: Number((personClosed.length / Math.max(1, persons.length)).toFixed(3)),
    work_to_concept_closure_ratio: Number((workClosed.length / Math.max(1, works.length)).toFixed(3)),
    concept_to_relation_closure_ratio: Number((conceptClosed.length / Math.max(1, concepts.length)).toFixed(3)),
    person_to_work_closed: personClosed.length,
    work_to_concept_closed: workClosed.length,
    concept_to_relation_closed: conceptClosed.length
  };
}

function duplicateClusters(cards) {
  const clusters = new Map();
  const normalize = (value) => String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
  for (const card of cards) {
    const type = card.entity_type || "unknown";
    const names = Array.isArray(card.names) ? card.names : [];
    for (const name of names) {
      const key = `${type}:${normalize(name)}`;
      if (key.length < 9) continue;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push({ id: card.id, name, file: card.__file, active: isActive(card) });
    }
  }
  return [...clusters.entries()]
    .filter(([, rows]) => new Set(rows.map((row) => row.id)).size > 1)
    .map(([key, rows]) => ({ key, rows }));
}

function baseCounts(cards) {
  const active = cards.filter(isActive);
  const generated = readGeneratedCards();
  return {
    total_source_cards: cards.length,
    active_runtime_source_cards: active.length,
    generated_runtime_cards: generated.length,
    source_only_cards: cards.filter((card) => card.runtime_scope === "source_only").length,
    optional_long_tail_cards: cards.filter((card) => card.runtime_scope === "optional_long_tail").length,
    public_visibility_cards: cards.filter((card) => card.visibility === "public").length,
    person_cards: cards.filter((card) => card.entity_type === "person").length,
    work_cards: cards.filter((card) => card.entity_type === "work").length,
    concept_theme_movement_cards: cards.filter(isConcept).length,
    relation_cards: cards.filter((card) => card.entity_type === "relation").length,
    method_policy_cards: cards.filter(isMethodCard).length,
    active_method_cards: active.filter(isMethodCard).length,
    external_seed_cards: cards.filter(isExternalSeed).length,
    active_external_seed_cards: active.filter(isExternalSeed).length,
    cards_with_blank_runtime_scope: cards.filter((card) => !card.runtime_scope).length,
    cards_with_blank_pack_id: cards.filter((card) => !card.pack_id).length,
    legacy_unassigned_cards: cards.filter((card) => !card.runtime_scope || !card.pack_id || card.pack_id === "legacy_unassigned").length
  };
}

function structuralAudit(cards) {
  const active = cards.filter(isActive);
  const activeMissing = missingRefs(cards, true);
  const sourceMissing = missingRefs(cards, false);
  const duplicateRows = duplicateClusters(cards);
  const relationRows = cards.filter((card) => card.entity_type === "relation");
  const activeRelations = active.filter((card) => card.entity_type === "relation");
  const sourceOrphans = countBy(cards, (card) => orphanStatus(card, cards));
  const activeOrphans = countBy(active, (card) => orphanStatus(card, active));
  return {
    generated_at: new Date().toISOString(),
    mode: MODE,
    baseline_commit: BASELINE_COMMIT,
    counts: baseCounts(cards),
    generated_runtime: generatedInfo(),
    cards_by_type: countBy(cards, (card) => card.entity_type),
    cards_by_domain_family: countBy(cards, (card) => domainFamily(card.domain)),
    cards_by_pack_id: countBy(cards, (card) => card.pack_id || "legacy_unassigned"),
    cards_by_runtime_scope: countBy(cards, (card) => card.runtime_scope || "legacy_unassigned"),
    active_cards_by_domain_family: countBy(active, (card) => domainFamily(card.domain)),
    active_cards_by_pack_id: countBy(active, (card) => card.pack_id || "legacy_unassigned"),
    closure_source: closureMetrics(cards),
    closure_active: closureMetrics(active),
    missing_public_references: activeMissing,
    missing_source_references: sourceMissing,
    source_orphan_counts: sourceOrphans,
    active_orphan_counts: activeOrphans,
    relation_missing_endpoint_count: cards.filter((card) => card.entity_type === "relation" && orphanStatus(card, cards) === "relation_missing_endpoint").length,
    active_relation_missing_endpoint_count: activeRelations.filter((card) => orphanStatus(card, active) === "relation_missing_endpoint").length,
    relation_cards_with_empty_source_ids: relationRows.filter((card) => !(card.source_ids || []).length).map((card) => card.id),
    relation_cards_with_empty_target_ids: relationRows.filter((card) => !(card.target_ids || []).length).map((card) => card.id),
    relation_cards_without_licensed_verbs: relationRows.filter((card) => !(card.licensed_verbs || []).length).map((card) => card.id),
    relation_cards_without_negative_moves: relationRows.filter((card) => !(card.negative_moves || []).length).map((card) => card.id),
    relation_cards_without_provenance: relationRows.filter((card) => !(card.provenance || []).length).map((card) => card.id),
    active_method_cards: active.filter(isMethodCard).map((card) => ({ id: card.id, file: card.__file, classification: card.method_card_classification || "unclassified" })),
    active_external_seed_cards: active.filter(isExternalSeed).map((card) => ({ id: card.id, file: card.__file, classification: card.external_seed_classification || "unclassified" })),
    duplicate_title_name_clusters: duplicateRows,
    generated_artifact_size_bytes: generatedInfo().size_bytes,
    generated_runtime_count: generatedInfo().cards
  };
}

function writePreReports(cards, audit) {
  writeJson(path.join(REPORT_DIR, "r28_post_r27_structural_audit.json"), audit);
  writeJson(path.join(REPORT_DIR, "r28_legacy_unassigned_audit.json"), {
    generated_at: audit.generated_at,
    blank_runtime_scope: cards.filter((card) => !card.runtime_scope).map((card) => ({ id: card.id, file: card.__file, active: isActive(card), domain: card.domain })),
    blank_pack_id: cards.filter((card) => !card.pack_id).map((card) => ({ id: card.id, file: card.__file, active: isActive(card), domain: card.domain })),
    legacy_unassigned: cards.filter((card) => card.pack_id === "legacy_unassigned").map((card) => ({ id: card.id, file: card.__file, active: isActive(card), runtime_scope: card.runtime_scope }))
  });
  writeJson(path.join(REPORT_DIR, "r28_orphan_audit.json"), cards.map((card) => ({
    id: card.id,
    entity_type: card.entity_type,
    file: card.__file,
    active: isActive(card),
    runtime_scope: card.runtime_scope || "",
    pack_id: card.pack_id || "",
    orphan_status_source: orphanStatus(card, cards),
    orphan_status_active: isActive(card) ? orphanStatus(card, cards.filter(isActive)) : "not_active"
  })).filter((row) => row.orphan_status_source !== "closed_or_non_anchor" || row.orphan_status_active !== "not_active"));
  writeJson(path.join(REPORT_DIR, "r28_missing_endpoint_audit.json"), {
    generated_at: audit.generated_at,
    active_missing_references: audit.missing_public_references,
    source_missing_references: audit.missing_source_references,
    relation_missing_endpoint_count: audit.relation_missing_endpoint_count,
    active_relation_missing_endpoint_count: audit.active_relation_missing_endpoint_count
  });
  writeJson(path.join(REPORT_DIR, "r28_duplicate_card_audit.json"), {
    generated_at: audit.generated_at,
    duplicate_title_name_clusters: audit.duplicate_title_name_clusters
  });
  writeJson(path.join(REPORT_DIR, "r28_method_card_public_leakage_audit.json"), methodRiskReport(cards));
  writeText(path.join(ROOT, "docs", "kb_r28_post_r27_audit_summary.md"), preAuditMarkdown(audit));
}

function methodRiskReport(cards) {
  return {
    generated_at: new Date().toISOString(),
    method_cards: cards.filter(isMethodCard).map((card) => {
      const leakage = profileHits(card);
      const active = isActive(card);
      let classification = "migrate_to_policy_registry_later";
      if (!active) classification = "source_only_policy";
      if (leakage.length) classification = active ? "exclude_from_runtime" : "contains_surface_leakage";
      return {
        id: card.id,
        file: card.__file,
        public_visible: active,
        internal_only: !active,
        supplies_final_answer_content: leakage.length > 0 || contentStrings(card).some((text) => /回答法|answer|planner|overview/i.test(text)),
        leakage_risk: leakage,
        surface_template_risk: leakage.length > 0 ? "review" : "low",
        recommended_action: classification,
        priority: active ? "high" : "medium"
      };
    })
  };
}

function preAuditMarkdown(audit) {
  const c = audit.counts;
  return `# R28 Post-R27 Structural Audit

Generated before R28 edits. This is an audit of KB structure, not a runtime behavior claim.

## Counts

- source cards: ${c.total_source_cards}
- active runtime source cards: ${c.active_runtime_source_cards}
- generated runtime cards: ${audit.generated_runtime.cards}
- source_only cards: ${c.source_only_cards}
- optional_long_tail cards: ${c.optional_long_tail_cards}
- blank runtime_scope: ${c.cards_with_blank_runtime_scope}
- blank pack_id: ${c.cards_with_blank_pack_id}
- legacy_unassigned cards: ${c.legacy_unassigned_cards}
- active method cards: ${c.active_method_cards}
- active external seed cards: ${c.active_external_seed_cards}
- generated size bytes: ${audit.generated_runtime.size_bytes}

## Structural Debt

- source orphan counts: ${JSON.stringify(audit.source_orphan_counts)}
- active orphan counts: ${JSON.stringify(audit.active_orphan_counts)}
- active missing references: ${audit.missing_public_references.length}
- source missing references: ${audit.missing_source_references.length}
- relation cards with empty source_ids: ${audit.relation_cards_with_empty_source_ids.length}
- relation cards with empty target_ids: ${audit.relation_cards_with_empty_target_ids.length}
- relation cards without licensed verbs: ${audit.relation_cards_without_licensed_verbs.length}
- relation cards without negative_moves: ${audit.relation_cards_without_negative_moves.length}
- relation cards without provenance: ${audit.relation_cards_without_provenance.length}
- duplicate name/title clusters: ${audit.duplicate_title_name_clusters.length}

## Required R28 Action

R28 should normalize pack metadata, decouple active method/external seed cards, close or demote active orphan clusters, add relation endpoints where useful, and keep hidden-review/runtime behavior claims out of the KB reports.
`;
}

function stageCards(cards) {
  return cards.filter((card) => R28_FILES.has(path.basename(card.__file || "")));
}

function stageQuality(cards) {
  const stage = stageCards(cards);
  return {
    new_stage_cards: stage.length,
    new_stage_cards_by_file: countBy(stage, (card) => path.basename(card.__file)),
    new_stage_cards_by_type: countBy(stage, (card) => card.entity_type),
    new_stage_cards_by_domain_family: countBy(stage, (card) => domainFamily(card.domain)),
    new_stage_cards_by_pack_id: countBy(stage, (card) => card.pack_id || "legacy_unassigned"),
    new_stage_cards_by_runtime_scope: countBy(stage, (card) => card.runtime_scope || "legacy_unassigned"),
    active_stage_cards: stage.filter(isActive).length,
    relation_like_stage_cards: stage.filter(isRelationLike).length,
    relation_like_share: Number((stage.filter(isRelationLike).length / Math.max(1, stage.length)).toFixed(3)),
    active_relation_like_share: Number((stage.filter((card) => isActive(card) && isRelationLike(card)).length / Math.max(1, stage.filter(isActive).length)).toFixed(3)),
    profile_template_hits: stage.flatMap((card) => profileHits(card).map((hit) => ({ id: card.id, file: card.__file, hit }))),
    long_final_answer_hits: stage.flatMap((card) => longSnippetHits(card).map((hit) => ({ id: card.id, file: card.__file, text: hit }))),
    no_provenance: stage.filter((card) => !(card.provenance || []).length).map((card) => card.id),
    no_transfer_scope: stage.filter((card) => !(card.transfer_scope || []).length).map((card) => card.id)
  };
}

function provenanceAudit(cards) {
  const active = cards.filter(isActive);
  return {
    generated_at: new Date().toISOString(),
    active_cards_without_provenance: active.filter((card) => !(card.provenance || []).length).map((card) => ({ id: card.id, file: card.__file })),
    active_cards_without_transfer_scope: active.filter((card) => !(card.transfer_scope || []).length).map((card) => ({ id: card.id, file: card.__file })),
    source_cards_without_provenance: cards.filter((card) => !(card.provenance || []).length).map((card) => ({ id: card.id, file: card.__file, active: isActive(card) })),
    source_cards_without_transfer_scope: cards.filter((card) => !(card.transfer_scope || []).length).map((card) => ({ id: card.id, file: card.__file, active: isActive(card) }))
  };
}

function noAnswerSnippetAudit(cards) {
  const active = cards.filter(isActive);
  return {
    generated_at: new Date().toISOString(),
    active_profile_template_hits: active.flatMap((card) => profileHits(card).map((hit) => ({ id: card.id, file: card.__file, hit }))),
    active_long_final_answer_hits: active.flatMap((card) => longSnippetHits(card).map((hit) => ({ id: card.id, file: card.__file, text: hit }))),
    r28_stage_profile_template_hits: stageQuality(cards).profile_template_hits,
    r28_stage_long_final_answer_hits: stageQuality(cards).long_final_answer_hits
  };
}

function sourceOnlyBacklog(cards) {
  return cards.filter((card) => !isActive(card)).map((card) => {
    const status = orphanStatus(card, cards);
    const quality = [];
    if (!(card.provenance || []).length) quality.push("needs_provenance");
    if (!(card.transfer_scope || []).length) quality.push("needs_transfer_scope");
    if (status !== "closed_or_non_anchor") quality.push(status);
    if (!card.pack_id || !card.runtime_scope) quality.push("needs_pack_metadata");
    return {
      id: card.id,
      entity_type: card.entity_type,
      domain: card.domain,
      runtime_scope: card.runtime_scope || "",
      pack_id: card.pack_id || "",
      recommended_next_action: quality.length ? "repair_before_activation" : "keep_available_for_future_pack",
      quality_flags: quality
    };
  }).filter((row) => row.quality_flags.length);
}

function postReports(cards, audit) {
  const stage = stageQuality(cards);
  const active = cards.filter(isActive);
  const generated = generatedInfo();
  const delta = {
    generated_at: audit.generated_at,
    baseline: BASELINE,
    final_counts: audit.counts,
    generated_runtime: generated,
    source_count_delta: audit.counts.total_source_cards - BASELINE.source_cards,
    active_runtime_source_delta: audit.counts.active_runtime_source_cards - BASELINE.active_runtime_source_cards,
    generated_runtime_delta: generated.cards - BASELINE.generated_runtime_cards,
    generated_size_delta_bytes: generated.size_bytes - BASELINE.generated_size_bytes,
    r28_stage_cards: stage,
    active_addition_policy: "active cards selected for high-transfer closure, boundary, relation, or representative-work support; runtime behavior not claimed fixed"
  };
  writeJson(path.join(REPORT_DIR, "r28_card_delta_summary.json"), delta);
  writeJson(path.join(REPORT_DIR, "r28_domain_coverage_report.json"), {
    generated_at: audit.generated_at,
    source_cards_by_domain_family: audit.cards_by_domain_family,
    active_cards_by_domain_family: audit.active_cards_by_domain_family,
    r28_stage_cards_by_domain_family: stage.new_stage_cards_by_domain_family
  });
  writeJson(path.join(REPORT_DIR, "r28_pack_distribution_report.json"), {
    generated_at: audit.generated_at,
    source_cards_by_pack_id: audit.cards_by_pack_id,
    source_cards_by_runtime_scope: audit.cards_by_runtime_scope,
    active_cards_by_pack_id: audit.active_cards_by_pack_id,
    r28_stage_cards_by_pack_id: stage.new_stage_cards_by_pack_id,
    r28_stage_cards_by_runtime_scope: stage.new_stage_cards_by_runtime_scope
  });
  writeJson(path.join(REPORT_DIR, "r28_relation_density_report.json"), {
    generated_at: audit.generated_at,
    baseline_relation_density: BASELINE.relation_density,
    final_source_relation_density: audit.closure_source.relation_density,
    final_active_relation_density: audit.closure_active.relation_density,
    r28_stage_relation_like_share: stage.relation_like_share,
    r28_stage_active_relation_like_share: stage.active_relation_like_share
  });
  writeJson(path.join(REPORT_DIR, "r28_active_runtime_size_report.json"), {
    generated_at: audit.generated_at,
    baseline_generated_cards: BASELINE.generated_runtime_cards,
    final_generated_cards: generated.cards,
    baseline_generated_size_bytes: BASELINE.generated_size_bytes,
    final_generated_size_bytes: generated.size_bytes,
    final_generated_sha256: generated.sha256,
    size_ratio_from_r27: generated.size_ratio_from_r27,
    size_ratio_from_pre_r24: generated.size_ratio_from_pre_r24,
    over_6mb_warning: generated.over_6mb_warning,
    over_8mb_stop_threshold: generated.over_8mb_stop_threshold,
    active_runtime_risk: generated.size_bytes > 6_000_000 ? "bundle_size_warning_reported" : "within_r28_warning_policy"
  });
  writeJson(path.join(REPORT_DIR, "r28_source_only_backlog_report.json"), {
    generated_at: audit.generated_at,
    backlog: sourceOnlyBacklog(cards).slice(0, 2000),
    truncated: sourceOnlyBacklog(cards).length > 2000,
    total_backlog_rows: sourceOnlyBacklog(cards).length
  });
  writeJson(path.join(REPORT_DIR, "r28_no_answer_snippet_audit.json"), noAnswerSnippetAudit(cards));
  writeJson(path.join(REPORT_DIR, "r28_provenance_audit.json"), provenanceAudit(cards));
  writeJson(path.join(REPORT_DIR, "r28_post_r27_structural_audit.json"), audit);
  writeJson(path.join(REPORT_DIR, "r28_legacy_unassigned_audit.json"), {
    generated_at: audit.generated_at,
    blank_runtime_scope: cards.filter((card) => !card.runtime_scope).map((card) => ({ id: card.id, file: card.__file, active: isActive(card), domain: card.domain })),
    blank_pack_id: cards.filter((card) => !card.pack_id).map((card) => ({ id: card.id, file: card.__file, active: isActive(card), domain: card.domain })),
    legacy_unassigned: cards.filter((card) => card.pack_id === "legacy_unassigned").map((card) => ({ id: card.id, file: card.__file, active: isActive(card), runtime_scope: card.runtime_scope }))
  });
  writeJson(path.join(REPORT_DIR, "r28_orphan_audit.json"), cards.map((card) => ({
    id: card.id,
    entity_type: card.entity_type,
    file: card.__file,
    active: isActive(card),
    runtime_scope: card.runtime_scope || "",
    pack_id: card.pack_id || "",
    orphan_status_source: orphanStatus(card, cards),
    orphan_status_active: isActive(card) ? orphanStatus(card, active) : "not_active"
  })).filter((row) => row.orphan_status_source !== "closed_or_non_anchor" || row.orphan_status_active !== "not_active"));
  writeJson(path.join(REPORT_DIR, "r28_missing_endpoint_audit.json"), {
    generated_at: audit.generated_at,
    active_missing_references: audit.missing_public_references,
    source_missing_references: audit.missing_source_references,
    relation_missing_endpoint_count: audit.relation_missing_endpoint_count,
    active_relation_missing_endpoint_count: audit.active_relation_missing_endpoint_count
  });
  writeJson(path.join(REPORT_DIR, "r28_duplicate_card_audit.json"), {
    generated_at: audit.generated_at,
    duplicate_title_name_clusters: audit.duplicate_title_name_clusters
  });
  writeJson(path.join(REPORT_DIR, "r28_method_card_public_leakage_audit.json"), methodRiskReport(cards));
  writeText(path.join(ROOT, "docs", "kb_expansion_r28_large_scale_summary.md"), summaryMarkdown(audit, stage));
  writeText(path.join(ROOT, "docs", "kb_r28_remaining_source_library_backlog.md"), backlogMarkdown(cards));
  return { delta, stage };
}

function summaryMarkdown(audit, stage) {
  const c = audit.counts;
  const g = audit.generated_runtime;
  return `# R28 Large-Scale KB Expansion Summary

R28 expanded and cleaned the KB source library. This document is a KB/data report only; it does not claim runtime conversation behavior is fixed.

## Counts

- baseline source cards: ${BASELINE.source_cards}
- final source cards: ${c.total_source_cards}
- source delta: ${c.total_source_cards - BASELINE.source_cards}
- baseline active runtime source cards: ${BASELINE.active_runtime_source_cards}
- final active runtime source cards: ${c.active_runtime_source_cards}
- active runtime source delta: ${c.active_runtime_source_cards - BASELINE.active_runtime_source_cards}
- baseline generated runtime cards: ${BASELINE.generated_runtime_cards}
- final generated runtime cards: ${g.cards}
- generated artifact size before: ${BASELINE.generated_size_bytes}
- generated artifact size after: ${g.size_bytes}
- generated artifact SHA256: ${g.sha256}
- source-only cards: ${c.source_only_cards}
- optional long-tail cards: ${c.optional_long_tail_cards}

## R28 Additions

- R28 stage cards: ${stage.new_stage_cards}
- R28 active stage cards: ${stage.active_stage_cards}
- R28 relation/contrast/negative/boundary/example share: ${stage.relation_like_share}
- R28 active relation-like share: ${stage.active_relation_like_share}
- cards by type: ${JSON.stringify(stage.new_stage_cards_by_type)}
- cards by pack: ${JSON.stringify(stage.new_stage_cards_by_pack_id)}
- cards by domain family: ${JSON.stringify(stage.new_stage_cards_by_domain_family)}

## Structural Cleanup

- legacy_unassigned cards after cleanup: ${c.legacy_unassigned_cards}
- blank runtime_scope after cleanup: ${c.cards_with_blank_runtime_scope}
- blank pack_id after cleanup: ${c.cards_with_blank_pack_id}
- active method cards after cleanup: ${c.active_method_cards}
- active external seed cards after cleanup: ${c.active_external_seed_cards}
- source orphan counts: ${JSON.stringify(audit.source_orphan_counts)}
- active orphan counts: ${JSON.stringify(audit.active_orphan_counts)}
- active missing references: ${audit.missing_public_references.length}
- active relation missing endpoints: ${audit.active_relation_missing_endpoint_count}
- duplicate clusters reported: ${audit.duplicate_title_name_clusters.length}

## Relation And Closure

- baseline source relation density: ${BASELINE.relation_density}
- final source relation density: ${audit.closure_source.relation_density}
- final active relation density: ${audit.closure_active.relation_density}
- source person-to-work closure: ${audit.closure_source.person_to_work_closure_ratio}
- source work-to-concept closure: ${audit.closure_source.work_to_concept_closure_ratio}
- source concept-to-relation closure: ${audit.closure_source.concept_to_relation_closure_ratio}
- active person-to-work closure: ${audit.closure_active.person_to_work_closure_ratio}
- active work-to-concept closure: ${audit.closure_active.work_to_concept_closure_ratio}
- active concept-to-relation closure: ${audit.closure_active.concept_to_relation_closure_ratio}

## Risk Notes

- generated artifact over 6 MB warning: ${g.over_6mb_warning}
- generated artifact over 8 MB stop threshold: ${g.over_8mb_stop_threshold}
- no-answer-snippet stage hits: ${stage.profile_template_hits.length + stage.long_final_answer_hits.length}
- runtime behavior not claimed fixed
- hidden review not rerun
- R23 candidate remains rejected

## Non-KB Limits

R28 does not solve wrong_referent, wrong_operation, stale_domain_contamination, context_lost, transform_without_semantic_binding, implementation leakage, generic surface realization, mechanical reply, false-green diagnostics, hidden review failure, or R23 candidate rejection. Those remain routing, state, surface, and evaluation issues.

## Recommended R29 Strategy

Use the expanded source library for retrieval/ranking design, then separately repair routing/state/surface in patch-only mode. Keep source-only long-tail packs out of active browser payload until a shard or retrieval layer exists.
`;
}

function backlogMarkdown(cards) {
  const rows = sourceOnlyBacklog(cards).slice(0, 500);
  const lines = [
    "# R28 Remaining Source-Library Backlog",
    "",
    "This backlog lists source-only or optional cards that should not be activated until closure, provenance, or pack selection is improved.",
    "",
    "| card_id | type | domain | runtime_scope | pack_id | recommended action | flags |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const row of rows) {
    lines.push(`| ${row.id} | ${row.entity_type} | ${row.domain || ""} | ${row.runtime_scope} | ${row.pack_id} | ${row.recommended_next_action} | ${row.quality_flags.join("; ")} |`);
  }
  lines.push("");
  lines.push(`Total backlog rows in JSON report: ${sourceOnlyBacklog(cards).length}.`);
  return `${lines.join("\n")}\n`;
}

function workingTreeChangedRuntimeLogic() {
  let names = [];
  try {
    names = execSync("git diff --name-only", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    return { checked: false, changed_files: [] };
  }
  const allowedWeb = new Set(["web/culture_cards.generated.js"]);
  const forbidden = names.filter((name) => name.startsWith("web/") && !allowedWeb.has(name));
  return { checked: true, changed_files: forbidden };
}

function validatePost(cards, audit, stage) {
  const failures = [];
  const noSnippet = noAnswerSnippetAudit(cards);
  const prov = provenanceAudit(cards);
  const runtimeLogic = workingTreeChangedRuntimeLogic();
  if (audit.missing_public_references.length) failures.push(`active missing refs: ${audit.missing_public_references.length}`);
  if (audit.active_relation_missing_endpoint_count) failures.push(`active relation missing endpoints: ${audit.active_relation_missing_endpoint_count}`);
  if (audit.relation_cards_with_empty_source_ids.some((id) => readGeneratedCards().some((card) => card.id === id))) failures.push("active relation with empty source_ids");
  if (audit.relation_cards_with_empty_target_ids.some((id) => readGeneratedCards().some((card) => card.id === id))) failures.push("active relation with empty target_ids");
  if (audit.relation_cards_without_licensed_verbs.some((id) => readGeneratedCards().some((card) => card.id === id))) failures.push("active relation without licensed_verbs");
  if (audit.relation_cards_without_negative_moves.some((id) => readGeneratedCards().some((card) => card.id === id))) failures.push("active relation without negative_moves");
  if (audit.counts.active_method_cards > 0) failures.push(`active method cards remain: ${audit.counts.active_method_cards}`);
  if (noSnippet.active_profile_template_hits.length) failures.push(`active profile/template hits: ${noSnippet.active_profile_template_hits.length}`);
  if (noSnippet.active_long_final_answer_hits.length) failures.push(`active long final-answer hits: ${noSnippet.active_long_final_answer_hits.length}`);
  if (stage.profile_template_hits.length) failures.push(`R28 stage profile/template hits: ${stage.profile_template_hits.length}`);
  if (stage.long_final_answer_hits.length) failures.push(`R28 stage long answer hits: ${stage.long_final_answer_hits.length}`);
  if (prov.active_cards_without_provenance.length) failures.push(`active cards without provenance: ${prov.active_cards_without_provenance.length}`);
  if (prov.active_cards_without_transfer_scope.length) failures.push(`active cards without transfer_scope: ${prov.active_cards_without_transfer_scope.length}`);
  if (audit.generated_runtime.over_8mb_stop_threshold) failures.push("generated artifact exceeds 8 MB stop threshold");
  if (runtimeLogic.checked && runtimeLogic.changed_files.length) failures.push(`handwritten web runtime logic changed: ${runtimeLogic.changed_files.join(", ")}`);
  if (MODE === "post" && stage.new_stage_cards < 1500) failures.push(`R28 added fewer than 1500 stage cards: ${stage.new_stage_cards}`);
  if (MODE === "post" && stage.relation_like_share < 0.5) failures.push(`R28 relation-like share below 0.5: ${stage.relation_like_share}`);
  return failures;
}

function main() {
  const cards = allCards();
  const audit = structuralAudit(cards);
  writePreReports(cards, audit);
  if (MODE === "pre") {
    console.log(JSON.stringify({
      execution_ok: true,
      mode: "pre",
      source_cards: audit.counts.total_source_cards,
      active_runtime_source_cards: audit.counts.active_runtime_source_cards,
      generated_runtime_cards: audit.generated_runtime.cards,
      active_method_cards: audit.counts.active_method_cards,
      active_external_seed_cards: audit.counts.active_external_seed_cards,
      active_missing_references: audit.missing_public_references.length,
      legacy_unassigned_cards: audit.counts.legacy_unassigned_cards
    }, null, 2));
    return;
  }
  const { stage } = postReports(cards, audit);
  const failures = validatePost(cards, audit, stage);
  console.log(JSON.stringify({
    execution_ok: failures.length === 0,
    mode: "post",
    source_cards: audit.counts.total_source_cards,
    active_runtime_source_cards: audit.counts.active_runtime_source_cards,
    generated_runtime_cards: audit.generated_runtime.cards,
    generated_size_bytes: audit.generated_runtime.size_bytes,
    generated_sha256: audit.generated_runtime.sha256,
    r28_stage_cards: stage.new_stage_cards,
    r28_relation_like_share: stage.relation_like_share,
    failures
  }, null, 2));
  if (failures.length) process.exit(2);
}

main();
