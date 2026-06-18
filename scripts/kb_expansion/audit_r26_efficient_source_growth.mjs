import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const REPORT_DIR = path.join(ROOT, "artifacts", "training_os", "kb_expansion");
const GENERATED = path.join(ROOT, "web", "culture_cards.generated.js");
const SUMMARY_DOC = path.join(ROOT, "docs", "kb_expansion_r26_efficient_source_growth_summary.md");
const MODE = process.argv.includes("--pre") ? "pre" : "post";

const BASELINE_COMMIT = "6ba9e7965612b03b59c416ec4da63f7f066685b9";
const BASELINE = {
  source_cards: 1269,
  active_source_cards: 1006,
  generated_runtime_cards: 1005,
  generated_size_bytes: 3227979,
  original_runtime_size_baseline_bytes: 1649822,
  relation_density: 0.348,
  person_to_work_closure_ratio: 0.788,
  work_to_concept_closure_ratio: 0.822,
  concept_to_relation_closure_ratio: 0.569
};

const STAGE_FILES = new Set([
  "r26_source_growth_world_literature_cinema_music.jsonl",
  "r26_source_growth_image_thought_daily_boundary.jsonl",
  "r26_bridge_negative_boundary_source_pack.jsonl"
]);

const PROFILE_PATTERNS = [
  { name: "can_enter", re: /可以从/ },
  { name: "object_entry", re: /这个对象|可以理解为|入口/ },
  { name: "focus_on", re: /重点在/ },
  { name: "rewrite", re: /换个说法|简单说/ },
  { name: "catch", re: /我接住|更深一点|你可以继续问/ },
  { name: "implementation", re: /current session|local card|solver|runtime|profile|controller|本地知识卡|求解器/i }
];
const LONG_CHINESE_SENTENCE_RE = /[\u4e00-\u9fff][^。！？\n]{52,}[。！？]/;
const ALLOWED_RUNTIME_SCOPE = new Set(["core_runtime", "domain_pack", "bridge_pack", "boundary_pack", "optional_long_tail", "source_only", "excluded_from_runtime"]);

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
  const rows = [];
  for (const file of fs.readdirSync(CARD_DIR).filter((name) => name.endsWith(".jsonl")).sort()) {
    rows.push(...readJsonl(path.join(CARD_DIR, file)));
  }
  return rows;
}

function sha256(file) {
  return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
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
  const size = fs.existsSync(GENERATED) ? fs.statSync(GENERATED).size : 0;
  const ratioOriginal = Number((size / BASELINE.original_runtime_size_baseline_bytes).toFixed(3));
  const ratioR25 = Number((size / BASELINE.generated_size_bytes).toFixed(3));
  let risk = "low";
  if (generatedCardCount() > 1200 || ratioOriginal > 2.25) risk = "warning";
  if (generatedCardCount() > 1500 || ratioOriginal > 2.5) risk = "high";
  return {
    exists: fs.existsSync(GENERATED),
    cards: generatedCardCount(),
    size_bytes: size,
    sha256: sha256(GENERATED),
    size_ratio_from_r25: ratioR25,
    size_ratio_from_pre_r24_baseline: ratioOriginal,
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

function isConcept(card) {
  return ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type);
}

function typeClass(id = "") {
  if (id.startsWith("person.")) return "person";
  if (id.startsWith("work.")) return "work";
  if (id.startsWith("concept.") || id.startsWith("theme.") || id.startsWith("movement.") || id.startsWith("period.") || id.startsWith("genre.")) return "concept";
  if (id.startsWith("relation.")) return "relation";
  return "other";
}

function collectRefs(card) {
  const refs = [];
  const add = (id, field) => {
    if (typeof id === "string" && id.includes(".")) refs.push({ from: card.id, from_file: card.__file, id, field });
  };
  for (const field of ["works", "representative_works", "related_concepts", "related_people", "relation_ids", "source_ids", "target_ids", "creator_ids", "example_ids"]) {
    if (Array.isArray(card[field])) card[field].forEach((id) => add(id, field));
  }
  if (Array.isArray(card.related_entities)) card.related_entities.forEach((item) => add(item?.id, "related_entities"));
  return refs;
}

function patternHits(card) {
  const text = collectStrings(card).join("\n");
  return PROFILE_PATTERNS.filter((pattern) => pattern.re.test(text)).map((pattern) => pattern.name);
}

function longSnippetHits(card) {
  return collectStrings(card).filter((text) => LONG_CHINESE_SENTENCE_RE.test(text)).map((text) => text.slice(0, 180));
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

function closureMetrics(cards) {
  const ids = new Set(cards.map((card) => card.id));
  const persons = cards.filter((card) => card.entity_type === "person");
  const works = cards.filter((card) => card.entity_type === "work");
  const concepts = cards.filter(isConcept);
  const relations = cards.filter((card) => card.entity_type === "relation");
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
    relation_density: Number((relations.length / Math.max(1, cards.length)).toFixed(3)),
    person_to_work_closure_ratio: Number((personClosed.length / Math.max(1, persons.length)).toFixed(3)),
    work_to_concept_closure_ratio: Number((workConceptClosed.length / Math.max(1, works.length)).toFixed(3)),
    concept_to_relation_closure_ratio: Number((conceptRelationClosed.length / Math.max(1, concepts.length)).toFixed(3)),
    person_to_work_closed: personClosed.length,
    work_to_concept_closed: workConceptClosed.length,
    concept_to_relation_closed: conceptRelationClosed.length
  };
}

function orphanRows(cards) {
  const ids = new Set(cards.map((card) => card.id));
  const relRefs = relationRefMap(cards.filter((card) => card.entity_type === "relation"));
  return {
    orphan_persons: cards.filter((card) => card.entity_type === "person" && collectRefs(card).filter((ref) => ids.has(ref.id)).length === 0 && !relRefs.has(card.id)).map((card) => card.id),
    orphan_works: cards.filter((card) => card.entity_type === "work" && collectRefs(card).filter((ref) => ids.has(ref.id)).length === 0 && !relRefs.has(card.id)).map((card) => card.id),
    orphan_concepts: cards.filter((card) => isConcept(card) && collectRefs(card).filter((ref) => ids.has(ref.id)).length === 0 && !relRefs.has(card.id)).map((card) => card.id)
  };
}

function qualityGaps(cards) {
  return {
    no_provenance: cards.filter((card) => !Array.isArray(card.provenance) || card.provenance.length === 0).map((card) => card.id),
    no_transfer_scope: cards.filter((card) => !Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0).map((card) => card.id),
    no_negative_or_boundary: cards.filter((card) => !(Array.isArray(card.negative_moves) && card.negative_moves.length) && !(Array.isArray(card.boundary_notes) && card.boundary_notes.length)).map((card) => card.id),
    relation_without_licensed_verbs: cards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.licensed_verbs) || card.licensed_verbs.length === 0)).map((card) => card.id),
    relation_without_negative_moves: cards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0)).map((card) => card.id),
    invalid_runtime_scope: cards.filter((card) => card.runtime_scope && !ALLOWED_RUNTIME_SCOPE.has(card.runtime_scope)).map((card) => card.id)
  };
}

function counts(cards) {
  return {
    total_source_cards: cards.length,
    active_runtime_source_cards: cards.filter((card) => card.approved_for_public_runtime).length,
    source_only_cards: cards.filter((card) => card.runtime_scope === "source_only").length,
    optional_long_tail_cards: cards.filter((card) => card.runtime_scope === "optional_long_tail").length,
    core_runtime_cards: cards.filter((card) => card.runtime_scope === "core_runtime" || card.runtime_default === true).length,
    person_cards: cards.filter((card) => card.entity_type === "person").length,
    work_cards: cards.filter((card) => card.entity_type === "work").length,
    concept_theme_movement_cards: cards.filter(isConcept).length,
    relation_cards: cards.filter((card) => card.entity_type === "relation").length,
    method_policy_cards: cards.filter((card) => card.id?.startsWith("method.") || card.domain?.startsWith("method.")).length
  };
}

function buildPackSelectionPlan() {
  const packs = [
    ["world_literature_extension", "optional_long_tail", "Activate only core bridge concepts; keep most persons/works source-only."],
    ["global_cinema_extension", "optional_long_tail", "Activate high-transfer film-form concepts and a small director/work spine."],
    ["global_music_culture", "optional_long_tail", "Activate copyright boundaries and cross-domain music concepts; keep discography breadth source-only."],
    ["art_design_image_deepening", "active_domain_pack", "Keep high-transfer image/interface/form concepts active; long-tail artists source-only."],
    ["philosophy_language_social_thought", "active_domain_pack", "Activate language/reference/boundary concepts; keep specialist debates source-only."],
    ["city_food_daily_extension", "optional_long_tail", "R25 already activated a core; R26 mostly source-only depth."],
    ["science_computing_history_extension", "active_domain_pack", "Activate evidence/model/interface bridges; keep specialist figures source-only."],
    ["economy_law_education_care_boundary", "boundary_pack", "Activate boundary and concept-distinction cards only."],
    ["bridge_negative_boundary_layer", "bridge_pack", "Activate high-transfer negative and false-equivalence cards; source-only dense clusters."]
  ];
  return {
    generated_at: new Date().toISOString(),
    baseline_commit: BASELINE_COMMIT,
    strategy: "Grow authored source library while limiting net active runtime cards to under 250 and generated runtime to under 1200 cards.",
    activation_rules: {
      active: ["high-transfer relations", "boundary cards", "core concept distinction cards", "representative work spines"],
      source_only_or_optional: ["secondary figures", "specialized works", "dense relation clusters", "future regional breadth"],
      excluded: ["unstable current facts", "unprovenanced cards", "answer snippets", "hidden review material"]
    },
    packs: packs.map(([pack_id, classification, rationale]) => ({ pack_id, classification, rationale }))
  };
}

function audit() {
  const cards = allCards();
  const active = cards.filter((card) => card.approved_for_public_runtime);
  const ids = new Set(active.map((card) => card.id));
  const missing = active.flatMap(collectRefs).filter((ref) => ["person", "work", "concept"].includes(typeClass(ref.id)) && !ids.has(ref.id));
  const activeGaps = qualityGaps(active);
  const stageCards = cards.filter((card) => STAGE_FILES.has(path.basename(card.__file)));
  const stageGaps = qualityGaps(stageCards);
  const stageProfileHits = stageCards.map((card) => ({ id: card.id, file: card.__file, hits: patternHits(card) })).filter((row) => row.hits.length);
  const stageLongSnippets = stageCards.map((card) => ({ id: card.id, file: card.__file, snippets: longSnippetHits(card) })).filter((row) => row.snippets.length);
  return {
    generated_at: new Date().toISOString(),
    baseline_commit: BASELINE_COMMIT,
    counts: counts(cards),
    generated_runtime_artifact: generatedInfo(),
    cards_by_domain: countBy(cards, (card) => card.domain || "unknown"),
    cards_by_pack_id: countBy(cards, (card) => card.pack_id || "legacy_unassigned"),
    cards_by_runtime_scope: countBy(cards, (card) => card.runtime_scope || "legacy_unassigned"),
    active_cards_by_pack_id: countBy(active, (card) => card.pack_id || "legacy_unassigned"),
    active_cards_by_runtime_scope: countBy(active, (card) => card.runtime_scope || "legacy_unassigned"),
    missing_public_references: { total: missing.length, by_type: countBy(missing, (ref) => typeClass(ref.id)), rows: missing },
    closure: closureMetrics(active),
    source_closure: closureMetrics(cards),
    orphans_active: orphanRows(active),
    active_quality_gaps: {
      no_provenance_count: activeGaps.no_provenance.length,
      no_transfer_scope_count: activeGaps.no_transfer_scope.length,
      no_negative_or_boundary_count: activeGaps.no_negative_or_boundary.length,
      relation_without_licensed_verbs_count: activeGaps.relation_without_licensed_verbs.length,
      relation_without_negative_moves_count: activeGaps.relation_without_negative_moves.length,
      examples: {
        no_provenance: activeGaps.no_provenance.slice(0, 60),
        no_transfer_scope: activeGaps.no_transfer_scope.slice(0, 60),
        no_negative_or_boundary: activeGaps.no_negative_or_boundary.slice(0, 60)
      }
    },
    method_policy_leakage_risks: cards.filter((card) => card.id?.startsWith("method.") || card.domain?.startsWith("method.")).map((card) => ({ id: card.id, hits: patternHits(card), snippets: longSnippetHits(card) })).filter((row) => row.hits.length || row.snippets.length),
    active_runtime_bloat_risks: {
      generated_cards_over_1200: (generatedInfo().cards ?? 0) > 1200,
      generated_size_over_2_25x_original: generatedInfo().size_ratio_from_pre_r24_baseline > 2.25,
      current_risk: generatedInfo().runtime_risk
    },
    stage: {
      cards: stageCards.length,
      by_type: countBy(stageCards, (card) => card.entity_type),
      by_domain: countBy(stageCards, (card) => card.domain),
      by_runtime_scope: countBy(stageCards, (card) => card.runtime_scope || "legacy_unassigned"),
      by_pack_id: countBy(stageCards, (card) => card.pack_id || "legacy_unassigned"),
      relation_like_count: stageCards.filter((card) => card.entity_type === "relation" || ["bridge_pack", "boundary_pack"].includes(card.runtime_scope)).length,
      quality_failures: {
        no_provenance: stageGaps.no_provenance,
        no_transfer_scope: stageGaps.no_transfer_scope,
        no_negative_or_boundary: stageGaps.no_negative_or_boundary,
        relation_without_licensed_verbs: stageGaps.relation_without_licensed_verbs,
        relation_without_negative_moves: stageGaps.relation_without_negative_moves,
        invalid_runtime_scope: stageGaps.invalid_runtime_scope,
        profile_template_hits: stageProfileHits,
        long_snippet_hits: stageLongSnippets
      }
    }
  };
}

function writeSummary(report) {
  const stage = report.stage;
  const doc = `# KB Expansion R26 Efficient Source Growth Summary

## Boundary

R26 updates KB source cards, pack governance reports, audit/generation scripts, docs, and the deterministic generated culture-card artifact only. It does not repair routing, referent binding, R23 candidate logic, surface realization, answerIndex, tiny-router weights, eval rows, or thresholds.

## Counts

- Baseline commit: ${BASELINE_COMMIT}
- Source cards: ${BASELINE.source_cards} -> ${report.counts.total_source_cards}
- Active runtime source cards: ${BASELINE.active_source_cards} -> ${report.counts.active_runtime_source_cards}
- Generated runtime cards: ${BASELINE.generated_runtime_cards} -> ${report.generated_runtime_artifact.cards}
- Source-only cards: ${report.counts.source_only_cards}
- Optional long-tail cards: ${report.counts.optional_long_tail_cards}
- Core/default cards: ${report.counts.core_runtime_cards}
- R26 stage cards: ${stage.cards}
- R26 added by type: ${Object.entries(stage.by_type).map(([k, v]) => `${k}=${v}`).join(", ")}
- R26 added by runtime scope: ${Object.entries(stage.by_runtime_scope).map(([k, v]) => `${k}=${v}`).join(", ")}
- R26 added by pack: ${Object.entries(stage.by_pack_id).map(([k, v]) => `${k}=${v}`).join(", ")}

## Runtime Size

- Generated artifact: \`web/culture_cards.generated.js\`
- Size before R26: ${BASELINE.generated_size_bytes} bytes
- Size after R26: ${report.generated_runtime_artifact.size_bytes} bytes
- Size ratio vs pre-R24 baseline: ${report.generated_runtime_artifact.size_ratio_from_pre_r24_baseline}
- SHA256: ${report.generated_runtime_artifact.sha256}
- Runtime size risk: ${report.generated_runtime_artifact.runtime_risk}

## Closure

- Active relation density: ${BASELINE.relation_density} -> ${report.closure.relation_density}
- Active person-to-work closure: ${BASELINE.person_to_work_closure_ratio} -> ${report.closure.person_to_work_closure_ratio}
- Active work-to-concept closure: ${BASELINE.work_to_concept_closure_ratio} -> ${report.closure.work_to_concept_closure_ratio}
- Active concept-to-relation closure: ${BASELINE.concept_to_relation_closure_ratio} -> ${report.closure.concept_to_relation_closure_ratio}
- Missing public person/work/concept references: ${report.missing_public_references.total}

## Quality

- New-card profile-template hits: ${stage.quality_failures.profile_template_hits.length}
- New-card long final-answer hits: ${stage.quality_failures.long_snippet_hits.length}
- New-card provenance failures: ${stage.quality_failures.no_provenance.length}
- New-card transfer_scope failures: ${stage.quality_failures.no_transfer_scope.length}
- New active runtime growth was controlled by keeping most dense expansion cards source-only or optional.

## Domains Still Weak

- Fine-grained regional culture packs remain sparse.
- Current law, medical, finance, travel, product, and platform facts remain outside static KB authority.
- Clinical psychology and crisis response remain boundary-heavy and not solved by cards.
- Runtime routing/state/surface failures remain outside this KB-only work.

## Not Solved By KB Expansion Alone

- wrong_referent: routing/state/reference issue.
- wrong_operation: operation typing/planning issue.
- stale_domain_contamination: state/domain finalizer issue.
- context_lost: discourse memory issue.
- transform_without_semantic_binding: transform planning issue.
- implementation leakage: runtime finalizer/surface issue.
- generic surface realization: surface issue.
- mechanical reply: surface/evaluation issue.
- false-green diagnostics: evaluation governance issue.
- hidden review failure: not rerun.
- R23 candidate rejection: remains rejected.

## Recommended R27 Strategy

Continue source-only pack growth only if a shard/lazy-load plan is defined, or switch to a separate patch-only routing/state/surface repair for one explicit live failure family. Do not mix KB expansion with runtime behavior claims.
`;
  ensureDir(SUMMARY_DOC);
  fs.writeFileSync(SUMMARY_DOC, doc);
}

function main() {
  const report = audit();
  if (MODE === "pre") {
    writeJson(path.join(REPORT_DIR, "r26_pre_audit.json"), report);
    writeJson(path.join(REPORT_DIR, "r26_pack_selection_plan.json"), buildPackSelectionPlan());
    console.log(JSON.stringify({
      execution_ok: true,
      mode: "pre",
      source_cards: report.counts.total_source_cards,
      active_runtime_cards: report.counts.active_runtime_source_cards,
      generated_runtime_cards: report.generated_runtime_artifact.cards,
      generated_size_bytes: report.generated_runtime_artifact.size_bytes,
      relation_density: report.closure.relation_density,
      runtime_risk: report.generated_runtime_artifact.runtime_risk
    }, null, 2));
    return;
  }

  writeJson(path.join(REPORT_DIR, "r26_card_delta_summary.json"), {
    baseline: BASELINE,
    final_counts: report.counts,
    stage: report.stage
  });
  writeJson(path.join(REPORT_DIR, "r26_domain_coverage_report.json"), {
    cards_by_domain: report.cards_by_domain,
    stage_by_domain: report.stage.by_domain,
    expansion_packs: buildPackSelectionPlan().packs
  });
  writeJson(path.join(REPORT_DIR, "r26_pack_distribution_report.json"), {
    cards_by_pack_id: report.cards_by_pack_id,
    cards_by_runtime_scope: report.cards_by_runtime_scope,
    active_cards_by_pack_id: report.active_cards_by_pack_id,
    active_cards_by_runtime_scope: report.active_cards_by_runtime_scope
  });
  writeJson(path.join(REPORT_DIR, "r26_relation_density_report.json"), {
    before_relation_density: BASELINE.relation_density,
    after_relation_density: report.closure.relation_density,
    source_relation_density: report.source_closure.relation_density,
    stage_relation_like_count: report.stage.relation_like_count,
    stage_relation_like_share: Number((report.stage.relation_like_count / Math.max(1, report.stage.cards)).toFixed(3))
  });
  writeJson(path.join(REPORT_DIR, "r26_closure_report.json"), {
    before: BASELINE,
    active_after: report.closure,
    source_after: report.source_closure,
    missing_public_references: report.missing_public_references,
    active_orphans: report.orphans_active
  });
  writeJson(path.join(REPORT_DIR, "r26_provenance_audit.json"), {
    active_quality_gaps: report.active_quality_gaps,
    stage_quality_failures: {
      no_provenance: report.stage.quality_failures.no_provenance,
      no_transfer_scope: report.stage.quality_failures.no_transfer_scope,
      no_negative_or_boundary: report.stage.quality_failures.no_negative_or_boundary
    },
    stage_pass: report.stage.quality_failures.no_provenance.length === 0 && report.stage.quality_failures.no_transfer_scope.length === 0
  });
  writeJson(path.join(REPORT_DIR, "r26_no_answer_snippet_audit.json"), {
    stage_profile_template_hits: report.stage.quality_failures.profile_template_hits,
    stage_long_snippet_hits: report.stage.quality_failures.long_snippet_hits,
    pass_for_stage_cards: report.stage.quality_failures.profile_template_hits.length === 0 && report.stage.quality_failures.long_snippet_hits.length === 0
  });
  writeJson(path.join(REPORT_DIR, "r26_runtime_size_report.json"), report.generated_runtime_artifact);
  writeJson(path.join(REPORT_DIR, "r26_source_only_inventory.json"), allCards().filter((card) => STAGE_FILES.has(path.basename(card.__file)) && ["source_only", "optional_long_tail"].includes(card.runtime_scope)).map((card) => ({
    id: card.id,
    file: card.__file,
    entity_type: card.entity_type,
    domain: card.domain,
    runtime_scope: card.runtime_scope,
    pack_id: card.pack_id
  })));
  writeSummary(report);

  const stageFailCount = [
    report.stage.quality_failures.no_provenance,
    report.stage.quality_failures.no_transfer_scope,
    report.stage.quality_failures.invalid_runtime_scope,
    report.stage.quality_failures.profile_template_hits,
    report.stage.quality_failures.long_snippet_hits,
    report.stage.quality_failures.relation_without_licensed_verbs,
    report.stage.quality_failures.relation_without_negative_moves
  ].reduce((sum, rows) => sum + rows.length, 0);
  const ok = stageFailCount === 0 && report.missing_public_references.total === 0 && report.generated_runtime_artifact.cards <= 1200 && report.generated_runtime_artifact.size_ratio_from_pre_r24_baseline <= 2.25;
  console.log(JSON.stringify({
    execution_ok: true,
    mode: "post",
    kb_quality_ok_for_stage_cards: stageFailCount === 0,
    active_runtime_control_ok: report.generated_runtime_artifact.cards <= 1200 && report.generated_runtime_artifact.size_ratio_from_pre_r24_baseline <= 2.25,
    stage_cards: report.stage.cards,
    stage_relation_like_share: Number((report.stage.relation_like_count / Math.max(1, report.stage.cards)).toFixed(3)),
    total_source_cards: report.counts.total_source_cards,
    active_runtime_source_cards: report.counts.active_runtime_source_cards,
    generated_runtime_cards: report.generated_runtime_artifact.cards,
    generated_size_bytes: report.generated_runtime_artifact.size_bytes,
    missing_public_references: report.missing_public_references.total,
    summary_doc: path.relative(ROOT, SUMMARY_DOC)
  }, null, 2));
  if (!ok) process.exit(2);
}

main();
