import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const REPORT_DIR = path.join(ROOT, "artifacts", "training_os", "kb_expansion");
const SUMMARY_DOC = path.join(ROOT, "docs", "kb_expansion_r25_stage2b_stage3a_summary.md");
const ROADMAP_DOC = path.join(ROOT, "docs", "kb_15000_source_library_roadmap.md");
const GENERATED = path.join(ROOT, "web", "culture_cards.generated.js");
const MODE = process.argv.includes("--pre") ? "pre" : "post";

const BASELINE_COMMIT = "acd2eaf";
const BASELINE = {
  total_source_cards: 725,
  public_runtime_cards: 562,
  person_cards: 101,
  work_cards: 123,
  concept_theme_movement_cards: 203,
  relation_cards: 135,
  relation_density: 0.24,
  person_to_work_closure_ratio: 0.693,
  work_to_concept_closure_ratio: 0.691,
  concept_to_relation_closure_ratio: 0.473,
  generated_runtime_cards: 561,
  generated_size_bytes: 1649822
};

const STAGE_FILES = new Set([
  "r25_stage2b_domain_expansion.jsonl",
  "r25_stage3a_bridge_guardrail.jsonl"
]);

const ALLOWED_RUNTIME_SCOPE = new Set([
  "core_runtime",
  "domain_pack",
  "bridge_pack",
  "boundary_pack",
  "optional_long_tail",
  "source_only",
  "excluded_from_runtime"
]);

const PROFILE_PATTERNS = [
  { name: "can_enter", re: /可以从/ },
  { name: "entry_object", re: /(?:这个)?(?:音乐|文学|历史|艺术|电影)?对象.*入口/ },
  { name: "understand_as_entry", re: /可以理解为.*入口/ },
  { name: "focus_on", re: /重点在于|重点在/ },
  { name: "rewrite_prefix", re: /换个说法[:：]/ },
  { name: "simple_prefix", re: /简单说[:：]/ },
  { name: "i_will_follow", re: /我会按/ },
  { name: "local_card", re: /本地知识卡|知识卡|当前会话|求解器|runtime|controller|response mode|active topic/i },
  { name: "caught_it", re: /我接住/ },
  { name: "continue_ask", re: /你可以继续问/ },
  { name: "deeper_question", re: /更深一点|更深的问题/ }
];

const LONG_CHINESE_SENTENCE_RE = /[\u4e00-\u9fff][^。！？\n]{52,}[。！？]/;

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeJson(file, value) {
  ensureDir(file);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => ({ ...JSON.parse(line), __file: path.relative(ROOT, file), __line: index + 1 }));
}

function allCards() {
  const cards = [];
  for (const file of fs.readdirSync(CARD_DIR).filter((name) => name.endsWith(".jsonl")).sort()) {
    cards.push(...readJsonl(path.join(CARD_DIR, file)));
  }
  return cards;
}

function sha256(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function generatedCardCount() {
  if (!fs.existsSync(GENERATED)) return null;
  const text = fs.readFileSync(GENERATED, "utf8");
  const match = text.match(/export const CULTURE_CARDS = ([\s\S]*);\n?$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]).length;
  } catch {
    return null;
  }
}

function generatedInfo() {
  if (!fs.existsSync(GENERATED)) {
    return {
      exists: false,
      cards: null,
      size_bytes: 0,
      sha256: null,
      size_growth_from_baseline: null,
      runtime_risk: "unknown_missing_generated_artifact"
    };
  }
  const size = fs.statSync(GENERATED).size;
  const cards = generatedCardCount();
  const growth = Number((size / BASELINE.generated_size_bytes).toFixed(3));
  let risk = "low";
  if ((cards ?? 0) > 1200 || growth > 2) risk = "warning";
  if ((cards ?? 0) > 1500 || growth > 2.5) risk = "high";
  return {
    exists: true,
    cards,
    size_bytes: size,
    sha256: sha256(GENERATED),
    size_growth_from_baseline: growth,
    baseline_size_bytes: BASELINE.generated_size_bytes,
    runtime_risk: risk
  };
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function typeClass(id = "") {
  if (id.startsWith("person.")) return "person";
  if (id.startsWith("work.")) return "work";
  if (id.startsWith("concept.") || id.startsWith("theme.") || id.startsWith("movement.") || id.startsWith("period.") || id.startsWith("genre.")) return "concept";
  if (id.startsWith("relation.")) return "relation";
  return "other";
}

function isConcept(card) {
  return ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type);
}

function collectRefs(card) {
  const refs = [];
  const add = (id, field) => {
    if (typeof id === "string" && id.includes(".")) refs.push({ from: card.id, from_file: card.__file, id, field });
  };
  for (const field of [
    "works",
    "representative_works",
    "related_concepts",
    "related_people",
    "relation_ids",
    "source_ids",
    "target_ids",
    "creator_ids",
    "example_ids"
  ]) {
    if (Array.isArray(card[field])) card[field].forEach((id) => add(id, field));
  }
  if (Array.isArray(card.related_entities)) {
    card.related_entities.forEach((item) => add(item?.id, "related_entities"));
  }
  return refs;
}

function patternHits(card) {
  const text = collectStrings(card).join("\n");
  return PROFILE_PATTERNS.filter((pattern) => pattern.re.test(text)).map((pattern) => pattern.name);
}

function longSnippetHits(card) {
  return collectStrings(card)
    .filter((text) => LONG_CHINESE_SENTENCE_RE.test(text))
    .map((text) => text.slice(0, 180));
}

function counts(cards) {
  const pub = cards.filter((card) => card.approved_for_public_runtime);
  return {
    total_source_cards: cards.length,
    public_runtime_cards: pub.length,
    person_cards: pub.filter((card) => card.entity_type === "person").length,
    work_cards: pub.filter((card) => card.entity_type === "work").length,
    concept_theme_movement_cards: pub.filter(isConcept).length,
    relation_cards: pub.filter((card) => card.entity_type === "relation").length,
    method_cards: pub.filter((card) => card.id?.startsWith("method.") || card.domain?.startsWith("method.")).length
  };
}

function relationRefMap(relations) {
  const map = new Map();
  for (const relation of relations) {
    for (const id of [...(relation.source_ids || []), ...(relation.target_ids || [])]) {
      map.set(id, (map.get(id) || 0) + 1);
    }
  }
  return map;
}

function closureMetrics(publicCards, ids) {
  const persons = publicCards.filter((card) => card.entity_type === "person");
  const works = publicCards.filter((card) => card.entity_type === "work");
  const concepts = publicCards.filter(isConcept);
  const relations = publicCards.filter((card) => card.entity_type === "relation");
  const relRefs = relationRefMap(relations);
  const personClosed = persons.filter((card) => {
    const works = [...(card.works || []), ...(card.representative_works || [])].filter((id) => id.startsWith("work."));
    return works.length > 0 && works.every((id) => ids.has(id));
  });
  const workConceptClosed = works.filter((card) => {
    const conceptRefs = collectRefs(card).map((ref) => ref.id).filter((id) => typeClass(id) === "concept");
    return conceptRefs.length > 0 && conceptRefs.every((id) => ids.has(id));
  });
  const conceptRelationClosed = concepts.filter((card) => (card.relation_ids || []).some((id) => ids.has(id)) || relRefs.has(card.id));
  return {
    relation_density: Number((relations.length / Math.max(1, publicCards.length)).toFixed(3)),
    person_to_work_closure_ratio: Number((personClosed.length / Math.max(1, persons.length)).toFixed(3)),
    work_to_concept_closure_ratio: Number((workConceptClosed.length / Math.max(1, works.length)).toFixed(3)),
    concept_to_relation_closure_ratio: Number((conceptRelationClosed.length / Math.max(1, concepts.length)).toFixed(3)),
    person_to_work_closed: personClosed.length,
    work_to_concept_closed: workConceptClosed.length,
    concept_to_relation_closed: conceptRelationClosed.length
  };
}

function orphanRows(publicCards) {
  const ids = new Set(publicCards.map((card) => card.id));
  const relations = publicCards.filter((card) => card.entity_type === "relation");
  const relRefs = relationRefMap(relations);
  return {
    orphan_person_cards: publicCards
      .filter((card) => card.entity_type === "person")
      .filter((card) => {
        const direct = [...(card.works || []), ...(card.representative_works || []), ...(card.related_concepts || [])].filter((id) => ids.has(id));
        const related = (card.related_entities || []).filter((item) => ids.has(item.id));
        return direct.length === 0 && related.length === 0 && !relRefs.has(card.id);
      })
      .map((card) => card.id),
    orphan_work_cards: publicCards
      .filter((card) => card.entity_type === "work")
      .filter((card) => collectRefs(card).filter((ref) => ids.has(ref.id)).length === 0 && !relRefs.has(card.id))
      .map((card) => card.id),
    orphan_concepts: publicCards
      .filter(isConcept)
      .filter((card) => collectRefs(card).filter((ref) => ids.has(ref.id)).length === 0 && !relRefs.has(card.id))
      .map((card) => card.id)
  };
}

function qualityGaps(publicCards) {
  return {
    cards_without_provenance: publicCards.filter((card) => !Array.isArray(card.provenance) || card.provenance.length === 0).map((card) => card.id),
    cards_without_transfer_scope: publicCards.filter((card) => !Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0).map((card) => card.id),
    cards_without_negative_or_boundary: publicCards.filter((card) => {
      const negatives = Array.isArray(card.negative_moves) && card.negative_moves.length > 0;
      const boundary = Array.isArray(card.boundary_notes) && card.boundary_notes.length > 0;
      return !negatives && !boundary;
    }).map((card) => card.id),
    relation_without_licensed_verbs: publicCards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.licensed_verbs) || card.licensed_verbs.length === 0)).map((card) => card.id),
    relation_without_negative_moves: publicCards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0)).map((card) => card.id),
    invalid_runtime_scope: publicCards.filter((card) => card.runtime_scope && !ALLOWED_RUNTIME_SCOPE.has(card.runtime_scope)).map((card) => card.id)
  };
}

function groupedInventory(cards, entityTypes) {
  const rows = cards
    .filter((card) => card.approved_for_public_runtime && entityTypes.includes(card.entity_type))
    .map((card) => ({
      id: card.id,
      names: card.names || [],
      entity_type: card.entity_type,
      domain: card.domain,
      runtime_scope: card.runtime_scope || "legacy_unassigned",
      pack_id: card.pack_id || "legacy_unassigned"
    }))
    .sort((a, b) => `${a.domain}:${a.id}`.localeCompare(`${b.domain}:${b.id}`));
  return { count: rows.length, by_domain: groupRows(rows, (row) => row.domain) };
}

function groupRows(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    if (!out[key]) out[key] = [];
    out[key].push(row);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function methodInventory(publicCards) {
  return publicCards
    .filter((card) => card.id?.startsWith("method.") || card.domain?.startsWith("method."))
    .map((card) => {
      const hits = patternHits(card);
      const snippets = longSnippetHits(card);
      return {
        id: card.id,
        file: card.__file,
        public_visible: card.visibility === "public" && card.approved_for_public_runtime === true,
        internal_only: !(card.visibility === "public" && card.approved_for_public_runtime === true),
        supplies_final_answer_content: hits.length > 0 || snippets.length > 0,
        leakage_risk: hits.includes("local_card") ? "high" : hits.length || snippets.length ? "medium" : "low",
        surface_template_risk: hits,
        recommended_action: hits.length || snippets.length ? "migrate_to_policy_registry_later" : "keep_internal_policy",
        priority: hits.length || snippets.length ? "high" : "low"
      };
    });
}

function coreDefaultCount(publicCards) {
  return publicCards.filter((card) => {
    if (card.runtime_default === true) return true;
    if (card.runtime_scope === "core_runtime") return true;
    return false;
  }).length;
}

function baseAudit() {
  const cards = allCards();
  const publicCards = cards.filter((card) => card.approved_for_public_runtime);
  const ids = new Set(publicCards.map((card) => card.id));
  const refs = publicCards.flatMap(collectRefs);
  const missingRefs = refs.filter((ref) => ["person", "work", "concept"].includes(typeClass(ref.id)) && !ids.has(ref.id));
  const gaps = qualityGaps(publicCards);
  const profileHits = publicCards.map((card) => ({ id: card.id, file: card.__file, hits: patternHits(card) })).filter((row) => row.hits.length);
  const longSnippets = publicCards.map((card) => ({ id: card.id, file: card.__file, snippets: longSnippetHits(card) })).filter((row) => row.snippets.length);
  const byScope = countBy(publicCards, (card) => card.runtime_scope || "legacy_unassigned");
  const byPack = countBy(publicCards, (card) => card.pack_id || "legacy_unassigned");
  const byTier = countBy(publicCards, (card) => card.source_library_tier || "legacy_unassigned");
  const sourceByScope = countBy(cards, (card) => card.runtime_scope || "legacy_unassigned");
  const sourceByPack = countBy(cards, (card) => card.pack_id || "legacy_unassigned");
  const sourceByTier = countBy(cards, (card) => card.source_library_tier || "legacy_unassigned");
  const gen = generatedInfo();
  const currentCounts = counts(cards);
  return {
    generated_at: new Date().toISOString(),
    baseline_commit: BASELINE_COMMIT,
    counts: {
      ...currentCounts,
      authored_source_count: currentCounts.total_source_cards,
      active_runtime_count_source_public: currentCounts.public_runtime_cards,
      active_runtime_count_generated: gen.cards,
      core_default_count: coreDefaultCount(publicCards)
    },
    generated_runtime_artifact: gen,
    runtime_scope_distribution: byScope,
    pack_id_distribution: byPack,
    source_library_tier_distribution: byTier,
    authored_source_runtime_scope_distribution: sourceByScope,
    authored_source_pack_id_distribution: sourceByPack,
    authored_source_library_tier_distribution: sourceByTier,
    missing_references: {
      total: missingRefs.length,
      by_type: countBy(missingRefs, (ref) => typeClass(ref.id)),
      rows: missingRefs
    },
    closure: closureMetrics(publicCards, ids),
    quality_gaps: {
      no_provenance_count: gaps.cards_without_provenance.length,
      no_transfer_scope_count: gaps.cards_without_transfer_scope.length,
      no_negative_or_boundary_count: gaps.cards_without_negative_or_boundary.length,
      relation_without_licensed_verbs_count: gaps.relation_without_licensed_verbs.length,
      relation_without_negative_moves_count: gaps.relation_without_negative_moves.length,
      invalid_runtime_scope_count: gaps.invalid_runtime_scope.length,
      no_provenance_examples: gaps.cards_without_provenance.slice(0, 60),
      no_transfer_scope_examples: gaps.cards_without_transfer_scope.slice(0, 60),
      no_negative_or_boundary_examples: gaps.cards_without_negative_or_boundary.slice(0, 60),
      relation_without_licensed_verbs_examples: gaps.relation_without_licensed_verbs.slice(0, 60),
      relation_without_negative_moves_examples: gaps.relation_without_negative_moves.slice(0, 60),
      invalid_runtime_scope_examples: gaps.invalid_runtime_scope.slice(0, 60)
    },
    orphan_cards: orphanRows(publicCards),
    public_cards_with_profile_template_language: {
      count: profileHits.length,
      examples: profileHits.slice(0, 80)
    },
    public_cards_with_possible_final_answer_snippets: {
      count: longSnippets.length,
      examples: longSnippets.slice(0, 80)
    },
    method_cards: methodInventory(publicCards),
    inventory: {
      people: groupedInventory(cards, ["person"]),
      works: groupedInventory(cards, ["work"]),
      concepts_periods_movements_themes: groupedInventory(cards, ["concept", "theme", "movement", "period", "genre"]),
      relations: groupedInventory(cards, ["relation"])
    },
    cards,
    publicCards,
    ids
  };
}

function stageQuality(stageCards) {
  const profileHits = stageCards.map((card) => ({ id: card.id, file: card.__file, hits: patternHits(card) })).filter((row) => row.hits.length);
  const snippets = stageCards.map((card) => ({ id: card.id, file: card.__file, snippets: longSnippetHits(card) })).filter((row) => row.snippets.length);
  const failures = {
    provenance: stageCards.filter((card) => !Array.isArray(card.provenance) || card.provenance.length === 0).map((card) => card.id),
    transfer_scope: stageCards.filter((card) => !Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0).map((card) => card.id),
    runtime_scope: stageCards.filter((card) => !ALLOWED_RUNTIME_SCOPE.has(card.runtime_scope)).map((card) => card.id),
    pack_id: stageCards.filter((card) => !card.pack_id).map((card) => card.id),
    purpose_class: stageCards.filter((card) => !Array.isArray(card.purpose_class) || card.purpose_class.length === 0).map((card) => card.id),
    concept_negative: stageCards.filter((card) => isConcept(card) && (!Array.isArray(card.non_examples) || card.non_examples.length === 0) && (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0)).map((card) => card.id),
    work_copyright: stageCards.filter((card) => card.entity_type === "work" && !card.copyright_boundary).map((card) => card.id),
    relation_verbs: stageCards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.licensed_verbs) || card.licensed_verbs.length === 0)).map((card) => card.id),
    relation_negative: stageCards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0)).map((card) => card.id),
    profile_template_hits: profileHits.map((row) => row.id),
    long_snippet_hits: snippets.map((row) => row.id)
  };
  return { failures, profileHits, snippets };
}

function stagePurposeCounts(stageCards) {
  const out = {};
  for (const card of stageCards) {
    for (const purpose of card.purpose_class || ["unspecified"]) {
      out[purpose] = (out[purpose] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function writeRoadmap() {
  const doc = `# 15,000-Card Source Library Roadmap

## Status

The 15,000-card number is a long-term upper bound for an authored source library, not a browser runtime target. R25 keeps the active public runtime bounded and introduces pack governance so future growth can separate source coverage from default local-first payload.

## Three Counts

- Authored source count: every card in \`data/culture_cards/*.jsonl\`.
- Active runtime count: cards emitted into \`web/culture_cards.generated.js\`.
- Core default count: the compact high-transfer substrate that should remain safe for default local-first use.

## Pack Hierarchy

| Pack | Source Target | Active Default Target | Relation Density Target | Runtime Suitability | Risk |
| --- | ---: | ---: | ---: | --- | --- |
| core_public_runtime | 700-1,000 | 500-750 | >=0.25 | default | stale surface if prose leaks |
| arts_humanities_core | 1,500-2,000 | 250-450 | >=0.30 | domain shard | canon bias |
| literature_global | 1,500-2,500 | 200-400 | >=0.30 | optional shard | copyright/quotation risk |
| film_media | 1,200-1,800 | 180-350 | >=0.30 | optional shard | plot-summary bloat |
| music_culture | 1,000-1,500 | 150-300 | >=0.30 | optional shard | lyric/copyright risk |
| art_design_image | 1,000-1,500 | 150-300 | >=0.30 | optional shard | image-rights confusion |
| philosophy_language | 900-1,400 | 120-250 | >=0.35 | optional shard | abstraction overload |
| city_food_daily_life | 1,000-1,700 | 150-300 | >=0.30 | optional shard | current recommendation drift |
| science_history | 1,000-1,500 | 120-240 | >=0.30 | optional shard | current science overreach |
| economy_law_institutions | 1,000-1,700 | 120-240 | >=0.35 | boundary-heavy shard | advice/forecast/legal risk |
| psychology_care_boundary | 800-1,200 | 100-180 | >=0.35 | boundary-heavy shard | diagnosis/therapy risk |
| education_learning | 700-1,200 | 100-180 | >=0.30 | optional shard | child/special-needs advice risk |
| technology_interface | 1,000-1,500 | 140-260 | >=0.30 | optional shard | current product/API drift |
| regional_culture_optional | 1,000-2,000 | 0-200 | >=0.25 | opt-in only | coverage imbalance |
| long_tail_specialist_optional | 2,000-4,000 | 0-100 | >=0.25 | source-only or retrieval | bundle and provenance risk |

## Governance Requirements

- Every card needs provenance, transfer_scope, negative or boundary material, and a purpose class.
- Relation, contrast, negative, and boundary cards should grow faster than identity cards.
- Optional long-tail cards should not be active by default.
- Runtime bundle size must be reported every time generated cards change.
- Full final-answer prose, prompt answers, hidden review material, and surface templates are not valid KB content.
- Source-only cards need a future retrieval or sharding path before runtime activation.

## Stop Conditions

- Generated runtime count exceeds 1,200 without explicit pack filtering.
- Generated artifact grows more than 2x from the active baseline without a size-risk report.
- Relation density declines materially while identity/work cards grow.
- New cards lack provenance or negative moves.
- New source cards start encoding answers instead of reusable primitives.
`;
  ensureDir(ROADMAP_DOC);
  fs.writeFileSync(ROADMAP_DOC, doc);
}

function writeSummary(audit, previous, stageCards, stageQualityResult, missingRefs) {
  const current = audit.counts;
  const stageByType = countBy(stageCards, (card) => card.entity_type);
  const stageByDomain = countBy(stageCards, (card) => card.domain);
  const stageByScope = countBy(stageCards, (card) => card.runtime_scope || "legacy_unassigned");
  const stageByPack = countBy(stageCards, (card) => card.pack_id || "legacy_unassigned");
  const relationLike = stageCards.filter((card) => card.entity_type === "relation" || ["bridge_pack", "boundary_pack"].includes(card.runtime_scope)).length;
  const relationLikeShare = Number((relationLike / Math.max(1, stageCards.length)).toFixed(3));
  const doc = `# KB Expansion R25 Stage 2B + Stage 3A Summary

## Boundary

This round updates KB source cards, pack governance metadata, KB audits, docs, and the deterministic generated culture-card artifact only. It does not repair routing, referent binding, R23 candidate logic, surface realization, answerIndex, tiny-router weights, eval rows, or thresholds.

## Baseline And Final Counts

- Baseline commit: ${BASELINE_COMMIT}
- Baseline source cards: ${BASELINE.total_source_cards}
- Baseline public runtime source cards: ${BASELINE.public_runtime_cards}
- Baseline generated runtime cards: ${BASELINE.generated_runtime_cards}
- Final source cards: ${current.total_source_cards}
- Final public runtime source cards: ${current.public_runtime_cards}
- Final generated runtime cards: ${audit.generated_runtime_artifact.cards}
- Final core default count: ${current.core_default_count}
- Added/materially new R25 cards: ${stageCards.length}
- Added by type: ${Object.entries(stageByType).map(([key, value]) => `${key}=${value}`).join(", ")}
- Added by runtime scope: ${Object.entries(stageByScope).map(([key, value]) => `${key}=${value}`).join(", ")}
- Added by pack: ${Object.entries(stageByPack).map(([key, value]) => `${key}=${value}`).join(", ")}
- Added relation/contrast/boundary share: ${relationLikeShare}

## Runtime Pack Governance

- Active runtime scopes used: ${Object.keys(audit.runtime_scope_distribution).join(", ")}
- Authored source scopes used: ${Object.keys(audit.authored_source_runtime_scope_distribution).join(", ")}
- Active pack IDs used: ${Object.keys(audit.pack_id_distribution).join(", ")}
- Authored source pack IDs used: ${Object.keys(audit.authored_source_pack_id_distribution).join(", ")}
- Active runtime count is bounded separately from the long-term authored source library.
- The 15,000-card target is treated as a future source-library ceiling, not an active browser payload.

## Generated Runtime Artifact

- Generated file: \`web/culture_cards.generated.js\`
- Size before R25 baseline: ${BASELINE.generated_size_bytes} bytes
- Size after R25: ${audit.generated_runtime_artifact.size_bytes} bytes
- Size growth from baseline: ${audit.generated_runtime_artifact.size_growth_from_baseline}x
- SHA256: ${audit.generated_runtime_artifact.sha256}
- Runtime size risk: ${audit.generated_runtime_artifact.runtime_risk}

## Closure Metrics

- Relation density: ${BASELINE.relation_density} -> ${audit.closure.relation_density}
- Person-to-work closure: ${BASELINE.person_to_work_closure_ratio} -> ${audit.closure.person_to_work_closure_ratio}
- Work-to-concept closure: ${BASELINE.work_to_concept_closure_ratio} -> ${audit.closure.work_to_concept_closure_ratio}
- Concept-to-relation closure: ${BASELINE.concept_to_relation_closure_ratio} -> ${audit.closure.concept_to_relation_closure_ratio}
- Missing public person/work/concept references after this round: ${missingRefs.length}

## Quality Audits

- New-card provenance failures: ${stageQualityResult.failures.provenance.length}
- New-card transfer_scope failures: ${stageQualityResult.failures.transfer_scope.length}
- New-card runtime_scope failures: ${stageQualityResult.failures.runtime_scope.length}
- New-card pack_id failures: ${stageQualityResult.failures.pack_id.length}
- New-card purpose_class failures: ${stageQualityResult.failures.purpose_class.length}
- New concept cards missing non_examples/negative_moves: ${stageQualityResult.failures.concept_negative.length}
- New work cards missing copyright_boundary: ${stageQualityResult.failures.work_copyright.length}
- New relation cards missing licensed_verbs: ${stageQualityResult.failures.relation_verbs.length}
- New relation cards missing negative_moves: ${stageQualityResult.failures.relation_negative.length}
- New-card profile-template hits: ${stageQualityResult.profileHits.length}
- New-card long answer snippet hits: ${stageQualityResult.snippets.length}

## Method Card Risk

- Public method cards inventoried: ${audit.method_cards.length}
- Method cards with medium/high leakage risk: ${audit.method_cards.filter((row) => row.leakage_risk !== "low").length}
- R25 does not migrate method policy into public semantic cards.

## Domains Still Weak

- Non-Western city theory and everyday urban examples.
- Non-Western science history beyond a small foundation.
- Regional food cultures outside broad taste/process concepts.
- Current legal, medical, financial, travel, product, and platform facts.
- Clinical psychology and crisis support, which remain outside static KB authority.
- Long-tail regional culture packs, which need optional/source-only governance before activation.

## Not Solved By KB Expansion Alone

- wrong_referent: routing/state/reference issue, not solved by KB alone.
- wrong_operation: operation typing/planning issue, not solved by KB alone.
- stale_domain_contamination: state/domain finalizer issue, not solved by KB alone.
- context_lost: discourse memory issue, not solved by KB alone.
- transform_without_semantic_binding: transform-planning issue, not solved by KB alone.
- implementation leakage: runtime finalizer/surface issue, not solved by KB alone.
- generic surface realization: surface issue, not solved by KB alone.
- mechanical reply: surface/evaluation issue, not solved by KB alone.
- false-green diagnostics: evaluation governance issue, not solved by KB alone.
- hidden review failure: not rerun and not repaired by this KB expansion.
- R23 candidate rejection: remains rejected.

## Recommended Next Step

Either continue with Stage 3B pack governance and optional shard design, or run a separate patch-only routing/state/surface task for one explicitly named live failure family. These should not be mixed.
`;
  ensureDir(SUMMARY_DOC);
  fs.writeFileSync(SUMMARY_DOC, doc);
}

function main() {
  const audit = baseAudit();
  const serializable = { ...audit };
  delete serializable.cards;
  delete serializable.publicCards;
  delete serializable.ids;

  if (MODE === "pre") {
    writeJson(path.join(REPORT_DIR, "r25_pre_expansion_audit.json"), serializable);
    console.log(JSON.stringify({
      execution_ok: true,
      mode: "pre",
      source_cards: audit.counts.total_source_cards,
      public_runtime_cards: audit.counts.public_runtime_cards,
      generated_runtime_cards: audit.generated_runtime_artifact.cards,
      relation_density: audit.closure.relation_density,
      missing_references: audit.missing_references.total,
      runtime_risk: audit.generated_runtime_artifact.runtime_risk
    }, null, 2));
    return;
  }

  const stageCards = audit.cards.filter((card) => STAGE_FILES.has(path.basename(card.__file)));
  const stageQualityResult = stageQuality(stageCards);
  const stageByType = countBy(stageCards, (card) => card.entity_type);
  const stageByDomain = countBy(stageCards, (card) => card.domain);
  const stageByScope = countBy(stageCards, (card) => card.runtime_scope || "legacy_unassigned");
  const stageByPack = countBy(stageCards, (card) => card.pack_id || "legacy_unassigned");
  const stagePurpose = stagePurposeCounts(stageCards);
  const previousPath = path.join(REPORT_DIR, "r25_pre_expansion_audit.json");
  const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, "utf8")) : null;

  const missingRefs = audit.missing_references.rows;
  const relationLikeCount = stageCards.filter((card) => card.entity_type === "relation" || ["bridge_pack", "boundary_pack"].includes(card.runtime_scope)).length;
  const stageQualityFailures = Object.values(stageQualityResult.failures).flat();
  const hardFailures = [...stageQualityFailures, ...missingRefs.map((ref) => ref.id)];

  writeJson(path.join(REPORT_DIR, "r25_card_delta_summary.json"), {
    baseline_commit: BASELINE_COMMIT,
    baseline_counts: BASELINE,
    final_counts: audit.counts,
    added_stage_cards: stageCards.length,
    added_by_type: stageByType,
    added_by_domain: stageByDomain,
    added_by_runtime_scope: stageByScope,
    added_by_pack: stageByPack,
    purpose_class_counts: stagePurpose,
    relation_contrast_boundary_cards: relationLikeCount,
    relation_contrast_boundary_share: Number((relationLikeCount / Math.max(1, stageCards.length)).toFixed(3))
  });

  writeJson(path.join(REPORT_DIR, "r25_domain_coverage_report.json"), {
    added_by_domain: stageByDomain,
    stage2b_domains: [
      "urban",
      "food",
      "science.history",
      "economy",
      "law_boundary",
      "psychology_boundary",
      "education",
      "technology"
    ],
    stage3a_bridge_domains: ["cross_domain_bridge", "boundary_guardrail"],
    domains_still_weak: [
      "non-Western science history",
      "regional food culture details",
      "current jurisdiction-specific law",
      "clinical psychology",
      "current product/API facts",
      "long-tail regional culture"
    ]
  });

  writeJson(path.join(REPORT_DIR, "r25_pack_distribution_report.json"), {
    runtime_scope_distribution: audit.runtime_scope_distribution,
    pack_id_distribution: audit.pack_id_distribution,
    source_library_tier_distribution: audit.source_library_tier_distribution,
    authored_source_runtime_scope_distribution: audit.authored_source_runtime_scope_distribution,
    authored_source_pack_id_distribution: audit.authored_source_pack_id_distribution,
    authored_source_library_tier_distribution: audit.authored_source_library_tier_distribution,
    stage_added_by_runtime_scope: stageByScope,
    stage_added_by_pack: stageByPack,
    authored_source_count: audit.counts.authored_source_count,
    active_runtime_count_source_public: audit.counts.active_runtime_count_source_public,
    active_runtime_count_generated: audit.counts.active_runtime_count_generated,
    core_default_count: audit.counts.core_default_count
  });

  writeJson(path.join(REPORT_DIR, "r25_relation_density_report.json"), {
    before_relation_density: BASELINE.relation_density,
    after_relation_density: audit.closure.relation_density,
    before_relation_cards: BASELINE.relation_cards,
    after_relation_cards: audit.counts.relation_cards,
    stage_relation_cards: stageByType.relation || 0,
    relation_type_counts: countBy(audit.publicCards.filter((card) => card.entity_type === "relation"), (card) => card.relation_type || "legacy_unspecified")
  });

  writeJson(path.join(REPORT_DIR, "r25_closure_report.json"), {
    before: {
      person_to_work_closure_ratio: BASELINE.person_to_work_closure_ratio,
      work_to_concept_closure_ratio: BASELINE.work_to_concept_closure_ratio,
      concept_to_relation_closure_ratio: BASELINE.concept_to_relation_closure_ratio
    },
    after: audit.closure,
    missing_references: audit.missing_references,
    orphan_cards: audit.orphan_cards
  });

  writeJson(path.join(REPORT_DIR, "r25_provenance_audit.json"), {
    stage_cards: stageCards.length,
    failures: {
      provenance: stageQualityResult.failures.provenance,
      transfer_scope: stageQualityResult.failures.transfer_scope,
      runtime_scope: stageQualityResult.failures.runtime_scope,
      pack_id: stageQualityResult.failures.pack_id,
      purpose_class: stageQualityResult.failures.purpose_class
    },
    pass: [
      stageQualityResult.failures.provenance,
      stageQualityResult.failures.transfer_scope,
      stageQualityResult.failures.runtime_scope,
      stageQualityResult.failures.pack_id,
      stageQualityResult.failures.purpose_class
    ].every((rows) => rows.length === 0)
  });

  writeJson(path.join(REPORT_DIR, "r25_no_answer_snippet_audit.json"), {
    stage_profile_template_hits: stageQualityResult.profileHits,
    stage_long_snippet_hits: stageQualityResult.snippets,
    legacy_public_profile_template_count: audit.public_cards_with_profile_template_language.count - stageQualityResult.profileHits.length,
    pass_for_stage_cards: stageQualityResult.profileHits.length === 0 && stageQualityResult.snippets.length === 0
  });

  writeJson(path.join(REPORT_DIR, "r25_method_card_risk_report.json"), { method_cards: audit.method_cards });
  writeJson(path.join(REPORT_DIR, "r25_runtime_size_report.json"), audit.generated_runtime_artifact);
  writeJson(path.join(REPORT_DIR, "r25_post_expansion_audit.json"), serializable);

  writeRoadmap();
  writeSummary(audit, previous, stageCards, stageQualityResult, missingRefs);

  const ok = hardFailures.length === 0;
  console.log(JSON.stringify({
    execution_ok: true,
    mode: "post",
    kb_quality_ok_for_stage_cards: ok,
    stage_cards: stageCards.length,
    stage_relation_cards: stageByType.relation || 0,
    relation_like_share: Number((relationLikeCount / Math.max(1, stageCards.length)).toFixed(3)),
    public_runtime_cards: audit.counts.public_runtime_cards,
    generated_runtime_cards: audit.generated_runtime_artifact.cards,
    generated_size_bytes: audit.generated_runtime_artifact.size_bytes,
    relation_density: audit.closure.relation_density,
    missing_references: missingRefs.length,
    reports_dir: path.relative(ROOT, REPORT_DIR),
    summary_doc: path.relative(ROOT, SUMMARY_DOC),
    roadmap_doc: path.relative(ROOT, ROADMAP_DOC)
  }, null, 2));
  if (!ok) process.exit(2);
}

main();
