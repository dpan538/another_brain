import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const REPORT_DIR = path.join(ROOT, "artifacts", "training_os", "kb_expansion");
const SUMMARY_DOC = path.join(ROOT, "docs", "kb_expansion_stage0_stage1a_summary.md");

const R24_FILES = new Set([
  "r24_stage0_concept_closure.jsonl",
  "r24_stage1a_closure_pack.jsonl"
]);

const PROMPT_BASELINE = {
  total_source_cards: 392,
  public_runtime_cards: 228,
  person_cards: 64,
  concept_period_movement_cards: 72,
  relation_cards: 35,
  work_cards: 57,
  referenced_missing_public_people: 0,
  referenced_missing_public_concepts: 16
};

const EXPECTED_STAGE0_MISSING = [
  "concept.wabi_sabi",
  "theme.boundary",
  "theme.copyright_boundary",
  "theme.forgetting",
  "theme.framing",
  "theme.freedom_responsibility",
  "theme.institution",
  "theme.interpretation",
  "theme.language_parody",
  "theme.looking",
  "theme.memory",
  "theme.modernization_loss",
  "theme.naming",
  "theme.refusal",
  "theme.self_deception",
  "theme.youth_memory"
];

const USER_MENTIONED_CONCEPTS = [
  "concept.wabi_sabi",
  "concept.freedom_responsibility",
  "concept.viewing",
  "concept.framing",
  "concept.naming",
  "concept.memory",
  "concept.refusal",
  "concept.boundary",
  "concept.youthful_memory",
  "concept.modernization_loss",
  "concept.negative_space",
  "concept.cold_affect",
  "concept.bleakness",
  "concept.city_street",
  "concept.heat_control",
  "concept.narrator_point_of_view",
  "concept.form_material_institution",
  "concept.reference",
  "concept.translation",
  "concept.social_rejection",
  "concept.interface"
];

const PROFILE_PATTERNS = [
  { name: "can_enter", re: /可以从/ },
  { name: "enter", re: /进入/ },
  { name: "this_object", re: /这个(?:音乐|文学|历史|艺术)?对象/ },
  { name: "understand_as_entry", re: /可以理解为.*入口/ },
  { name: "focus_on", re: /重点在于|重点在/ },
  { name: "i_will_follow", re: /我会按/ },
  { name: "here_is_context", re: /这里说的是/ },
  { name: "deeper", re: /更深一点|更深的问题/ },
  { name: "caught_it", re: /我接住/ },
  { name: "continue_ask", re: /你可以继续问/ },
  { name: "local_card", re: /本地知识卡|知识卡|当前会话|求解器|runtime|controller|response mode|active topic/i }
];

const LONG_SENTENCE_RE = /[\u4e00-\u9fff][^。！？\n]{45,}[。！？]/;

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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
  for (const name of fs.readdirSync(CARD_DIR).filter((file) => file.endsWith(".jsonl")).sort()) {
    rows.push(...readJsonl(path.join(CARD_DIR, name)));
  }
  return rows;
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function pushRef(refs, from, id, field) {
  if (typeof id !== "string" || !id.includes(".")) return;
  refs.push({ from: from.id, from_file: from.__file, id, field });
}

function collectRefs(card) {
  const refs = [];
  for (const field of ["works", "representative_works", "related_concepts", "related_people", "relation_ids", "source_ids", "target_ids", "example_ids", "creator_ids"]) {
    const value = card[field];
    if (Array.isArray(value)) for (const id of value) pushRef(refs, card, id, field);
  }
  if (Array.isArray(card.related_entities)) {
    for (const item of card.related_entities) pushRef(refs, card, item?.id, "related_entities");
  }
  return refs;
}

function typeClass(id) {
  if (id.startsWith("person.")) return "person";
  if (id.startsWith("work.")) return "work";
  if (id.startsWith("concept.") || id.startsWith("theme.") || id.startsWith("movement.") || id.startsWith("period.")) return "concept";
  if (id.startsWith("relation.")) return "relation";
  return "other";
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function groupedInventory(cards, entityTypes) {
  const rows = cards
    .filter((card) => card.approved_for_public_runtime && entityTypes.includes(card.entity_type))
    .map((card) => ({
      id: card.id,
      names: card.names || [],
      entity_type: card.entity_type,
      domain: card.domain
    }))
    .sort((a, b) => `${a.domain}:${a.id}`.localeCompare(`${b.domain}:${b.id}`));
  const byDomain = {};
  for (const row of rows) {
    if (!byDomain[row.domain]) byDomain[row.domain] = [];
    byDomain[row.domain].push(row);
  }
  return { count: rows.length, by_domain: byDomain };
}

function patternHits(card) {
  const text = collectStrings(card).join("\n");
  return PROFILE_PATTERNS.filter((pattern) => pattern.re.test(text)).map((pattern) => pattern.name);
}

function longSentenceHits(card) {
  return collectStrings(card)
    .filter((text) => LONG_SENTENCE_RE.test(text))
    .map((text) => text.slice(0, 140));
}

function writeJson(file, value) {
  ensureDir(file);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function cardCounts(cards) {
  const publicCards = cards.filter((card) => card.approved_for_public_runtime);
  return {
    total_source_cards: cards.length,
    public_runtime_cards: publicCards.length,
    person_cards: publicCards.filter((card) => card.entity_type === "person").length,
    concept_period_movement_cards: publicCards.filter((card) => ["concept", "theme", "period", "movement"].includes(card.entity_type)).length,
    relation_cards: publicCards.filter((card) => card.entity_type === "relation").length,
    work_cards: publicCards.filter((card) => card.entity_type === "work").length
  };
}

function main() {
  const cards = allCards();
  const ids = new Set(cards.filter((card) => card.approved_for_public_runtime).map((card) => card.id));
  const r24Cards = cards.filter((card) => R24_FILES.has(path.basename(card.__file)));
  const baselineCountsActual = (() => {
    const nonR24 = cards.filter((card) => !R24_FILES.has(path.basename(card.__file)));
    return cardCounts(nonR24);
  })();
  const finalCounts = cardCounts(cards);

  const refs = cards.filter((card) => card.approved_for_public_runtime).flatMap(collectRefs);
  const missingRefs = refs.filter((ref) => ["person", "work", "concept"].includes(typeClass(ref.id)) && !ids.has(ref.id));
  const missingByType = countBy(missingRefs, (ref) => typeClass(ref.id));

  const newConceptIds = r24Cards.filter((card) => ["concept", "theme"].includes(card.entity_type)).map((card) => card.id);
  const stage0Added = EXPECTED_STAGE0_MISSING.filter((id) => ids.has(id));
  const stage0StillMissing = EXPECTED_STAGE0_MISSING.filter((id) => !ids.has(id));
  const userMentionedDelta = USER_MENTIONED_CONCEPTS.map((id) => ({
    requested_or_example_id: id,
    exact_id_public: ids.has(id),
    equivalent_public_id: (() => {
      if (id === "concept.viewing" && ids.has("theme.looking")) return "theme.looking";
      if (id === "concept.framing" && ids.has("theme.framing")) return "theme.framing";
      if (id === "concept.naming" && ids.has("theme.naming")) return "theme.naming";
      if (id === "concept.memory" && ids.has("theme.memory")) return "theme.memory";
      if (id === "concept.refusal" && ids.has("theme.refusal")) return "theme.refusal";
      if (id === "concept.boundary" && ids.has("theme.boundary")) return "theme.boundary";
      if (id === "concept.youthful_memory" && ids.has("theme.youth_memory")) return "theme.youth_memory";
      if (id === "concept.modernization_loss" && ids.has("theme.modernization_loss")) return "theme.modernization_loss";
      return "";
    })()
  }));

  const provenanceFailures = [];
  const transferScopeFailures = [];
  const conceptQualityFailures = [];
  const relationQualityFailures = [];
  const workQualityFailures = [];
  const r24ProfileHits = [];
  const r24LongSnippets = [];
  for (const card of r24Cards) {
    if (!Array.isArray(card.provenance) || card.provenance.length === 0) provenanceFailures.push(card.id);
    if (!Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0) transferScopeFailures.push(card.id);
    if (["concept", "theme"].includes(card.entity_type)) {
      if (!Array.isArray(card.non_examples) || card.non_examples.length === 0 || !Array.isArray(card.negative_moves) || card.negative_moves.length === 0) {
        conceptQualityFailures.push(card.id);
      }
    }
    if (card.entity_type === "relation") {
      if (!Array.isArray(card.licensed_verbs) || card.licensed_verbs.length === 0 || !Array.isArray(card.negative_moves) || card.negative_moves.length === 0) {
        relationQualityFailures.push(card.id);
      }
    }
    if (card.entity_type === "work" && !card.copyright_boundary) workQualityFailures.push(card.id);
    const hits = patternHits(card);
    if (hits.length) r24ProfileHits.push({ id: card.id, file: card.__file, hits });
    const snippets = longSentenceHits(card);
    if (snippets.length) r24LongSnippets.push({ id: card.id, file: card.__file, snippets });
  }

  const legacyPatternHits = cards
    .filter((card) => !R24_FILES.has(path.basename(card.__file)))
    .map((card) => ({ id: card.id, file: card.__file, hits: patternHits(card) }))
    .filter((row) => row.hits.length);

  const methodCards = cards.filter((card) => card.id?.startsWith("method.") || card.domain?.startsWith("method."));
  const methodInventory = methodCards.map((card) => {
    const hits = patternHits(card);
    const maySupplyFinalAnswer = longSentenceHits(card).length > 0 || hits.length > 0;
    return {
      id: card.id,
      file: card.__file,
      public_runtime_visible: card.approved_for_public_runtime === true,
      internal_only: card.visibility !== "public" || card.approved_for_public_runtime !== true,
      may_supply_final_answer_content: maySupplyFinalAnswer,
      leakage_terms: hits,
      recommended_action: maySupplyFinalAnswer ? "migrate_to_policy_registry_later" : "keep_internal_policy",
      risk: card.approved_for_public_runtime && maySupplyFinalAnswer ? "high" : maySupplyFinalAnswer ? "medium" : "low"
    };
  });

  const r24ByType = countBy(r24Cards, (card) => card.entity_type);
  const r24ByDomain = countBy(r24Cards, (card) => card.domain);
  const relationCards = cards.filter((card) => card.approved_for_public_runtime && card.entity_type === "relation");
  const relationDensityReport = {
    baseline_relation_cards_prompt: PROMPT_BASELINE.relation_cards,
    baseline_relation_cards_actual_non_r24: baselineCountsActual.relation_cards,
    final_relation_cards: finalCounts.relation_cards,
    added_r24_relation_cards: r24ByType.relation || 0,
    relation_cards_per_public_card_before_actual: Number((baselineCountsActual.relation_cards / Math.max(1, baselineCountsActual.public_runtime_cards)).toFixed(3)),
    relation_cards_per_public_card_after: Number((finalCounts.relation_cards / Math.max(1, finalCounts.public_runtime_cards)).toFixed(3)),
    relation_type_counts: countBy(relationCards, (card) => card.relation_type || "legacy_unspecified")
  };

  const taxonomyInventory = {
    generated_at: new Date().toISOString(),
    public_categories: Object.keys(countBy(cards.filter((card) => card.approved_for_public_runtime), (card) => card.domain)).sort(),
    people: groupedInventory(cards, ["person"]),
    concepts_periods_movements_themes: groupedInventory(cards, ["concept", "theme", "period", "movement", "genre"]),
    works: groupedInventory(cards, ["work"]),
    relations: groupedInventory(cards, ["relation"])
  };

  const stage0Report = {
    prompt_baseline_missing_public_concepts: PROMPT_BASELINE.referenced_missing_public_concepts,
    expected_stage0_missing_ids: EXPECTED_STAGE0_MISSING,
    stage0_added_ids: stage0Added,
    stage0_still_missing_ids: stage0StillMissing,
    actual_missing_public_references_after_stage0_stage1a: missingRefs,
    actual_missing_by_type_after: missingByType,
    user_list_delta: userMentionedDelta,
    note: "Repo source inventory differed from prompt baseline after excluding an untracked R23 draft from data/culture_cards."
  };

  const stage1aReport = {
    r24_cards_added: r24Cards.length,
    by_type: r24ByType,
    by_domain: r24ByDomain,
    new_person_cards: r24Cards.filter((card) => card.entity_type === "person").map((card) => card.id),
    new_work_cards: r24Cards.filter((card) => card.entity_type === "work").map((card) => card.id),
    new_concept_cards: newConceptIds,
    new_relation_cards: r24Cards.filter((card) => card.entity_type === "relation").map((card) => card.id),
    scope_excluded: [
      "broad science expansion",
      "economics person expansion",
      "jurisdiction-specific legal advice",
      "Stage 2 daily-world expansion",
      "Stage 3 bridge/guardrail layer"
    ],
    non_kb_failures_not_solved: [
      "wrong_referent",
      "stale_state_contamination",
      "transform_without_semantic_binding",
      "context_lost",
      "implementation_leakage",
      "generic_surface_realization",
      "false_green_diagnostics",
      "self_authored_acceptance",
      "hidden_review_failure"
    ]
  };

  const provenanceAudit = {
    r24_card_count: r24Cards.length,
    provenance_failures: provenanceFailures,
    transfer_scope_failures: transferScopeFailures,
    concept_quality_failures: conceptQualityFailures,
    relation_quality_failures: relationQualityFailures,
    work_quality_failures: workQualityFailures,
    pass: provenanceFailures.length === 0 &&
      transferScopeFailures.length === 0 &&
      conceptQualityFailures.length === 0 &&
      relationQualityFailures.length === 0 &&
      workQualityFailures.length === 0
  };

  const noAnswerSnippetAudit = {
    r24_profile_template_hits: r24ProfileHits,
    r24_long_sentence_snippets: r24LongSnippets,
    legacy_profile_template_hits_count: legacyPatternHits.length,
    legacy_profile_template_examples: legacyPatternHits.slice(0, 25),
    pass_for_r24_new_cards: r24ProfileHits.length === 0
  };

  const deltaSummary = {
    prompt_baseline: PROMPT_BASELINE,
    actual_non_r24_baseline: baselineCountsActual,
    final_counts: finalCounts,
    delta_from_actual_non_r24_baseline: {
      total_source_cards: finalCounts.total_source_cards - baselineCountsActual.total_source_cards,
      public_runtime_cards: finalCounts.public_runtime_cards - baselineCountsActual.public_runtime_cards,
      person_cards: finalCounts.person_cards - baselineCountsActual.person_cards,
      concept_period_movement_cards: finalCounts.concept_period_movement_cards - baselineCountsActual.concept_period_movement_cards,
      relation_cards: finalCounts.relation_cards - baselineCountsActual.relation_cards,
      work_cards: finalCounts.work_cards - baselineCountsActual.work_cards
    },
    delta_note: "Prompt baseline included local state that differed from tracked source after excluding the untracked R23 card draft."
  };

  writeJson(path.join(REPORT_DIR, "stage0_missing_public_concepts_report.json"), stage0Report);
  writeJson(path.join(REPORT_DIR, "stage1a_closure_pack_report.json"), stage1aReport);
  writeJson(path.join(REPORT_DIR, "kb_card_delta_summary.json"), deltaSummary);
  writeJson(path.join(REPORT_DIR, "method_card_decoupling_inventory.json"), { method_cards: methodInventory });
  writeJson(path.join(REPORT_DIR, "provenance_audit.json"), provenanceAudit);
  writeJson(path.join(REPORT_DIR, "no_answer_snippet_audit.json"), noAnswerSnippetAudit);
  writeJson(path.join(REPORT_DIR, "relation_density_report.json"), relationDensityReport);
  writeJson(path.join(REPORT_DIR, "public_card_taxonomy_inventory.json"), taxonomyInventory);

  const doc = `# KB Expansion Stage 0 + Stage 1A Summary

## Boundary

This is a public-runtime KB card update only. It does not modify runtime routing, state, surface realization, eval thresholds, or R23 candidate behavior.

## Counts

- Prompt baseline public cards: ${PROMPT_BASELINE.public_runtime_cards}
- Actual non-R24 baseline public cards in this source tree: ${baselineCountsActual.public_runtime_cards}
- Final public cards: ${finalCounts.public_runtime_cards}
- New R24 public cards: ${r24Cards.length}
- New person cards: ${r24ByType.person || 0}
- New work cards: ${r24ByType.work || 0}
- New concept/theme cards: ${(r24ByType.concept || 0) + (r24ByType.theme || 0)}
- New relation cards: ${r24ByType.relation || 0}
- Public domains/categories now enumerated: ${taxonomyInventory.public_categories.length}
- Public person cards now enumerated: ${taxonomyInventory.people.count}
- Public concept/theme/period/movement cards now enumerated: ${taxonomyInventory.concepts_periods_movements_themes.count}
- Full taxonomy inventory: \`artifacts/training_os/kb_expansion/public_card_taxonomy_inventory.json\`

## Public Categories

${taxonomyInventory.public_categories.map((domain) => `- ${domain}`).join("\n")}

## Public Person Inventory

${Object.entries(taxonomyInventory.people.by_domain).map(([domain, rows]) => `### ${domain}\n${rows.map((row) => `- ${row.id}: ${row.names.join(" / ")}`).join("\n")}`).join("\n\n")}

## Public Concept / Theme / Period / Movement Inventory

${Object.entries(taxonomyInventory.concepts_periods_movements_themes.by_domain).map(([domain, rows]) => `### ${domain}\n${rows.map((row) => `- ${row.id}: ${row.names.join(" / ")}`).join("\n")}`).join("\n\n")}

## Stage 0

- Expected missing referenced concept/theme IDs patched: ${stage0Added.length}/${EXPECTED_STAGE0_MISSING.length}
- Remaining expected Stage 0 missing IDs: ${stage0StillMissing.length ? stage0StillMissing.join(", ") : "none"}
- Actual missing public person/work/concept references after R24: ${missingRefs.length}

## Stage 1A Closure

New person cards:

${stage1aReport.new_person_cards.map((id) => `- ${id}`).join("\n")}

New work cards:

${stage1aReport.new_work_cards.map((id) => `- ${id}`).join("\n")}

New concept/theme cards:

${stage1aReport.new_concept_cards.map((id) => `- ${id}`).join("\n")}

New relation cards:

${stage1aReport.new_relation_cards.map((id) => `- ${id}`).join("\n")}

## Relation Density

- Actual non-R24 relation cards: ${baselineCountsActual.relation_cards}
- Final relation cards: ${finalCounts.relation_cards}
- Relation cards per public card before: ${relationDensityReport.relation_cards_per_public_card_before_actual}
- Relation cards per public card after: ${relationDensityReport.relation_cards_per_public_card_after}

## Cards Excluded

- Stage 2 daily-world expansion was not attempted.
- Stage 3 bridge/guardrail layer was not attempted.
- Broad science, economics, education, and jurisdiction-specific law person expansions were not attempted.
- A prior untracked R23 draft file was moved out of data/culture_cards before this audit so it would not contaminate R24 counts.

## Method-Card Risks

- Method cards inventoried: ${methodInventory.length}
- Public method cards with medium/high leakage risk: ${methodInventory.filter((row) => row.public_runtime_visible && row.risk !== "low").length}
- This round reports method-card risks but does not migrate runtime policy.

## R24 Card Quality

- Provenance failures: ${provenanceFailures.length}
- Transfer-scope failures: ${transferScopeFailures.length}
- R24 profile-template hits: ${r24ProfileHits.length}
- R24 relation cards with licensed verbs and negative moves missing: ${relationQualityFailures.length}

## Not Solved By This KB Expansion

- wrong_referent: requires routing/state/reference work, not KB alone.
- stale_state_contamination: requires state isolation and finalizer work, not KB alone.
- transform_without_semantic_binding: requires transform over semantic records, not KB alone.
- context_lost: requires discourse/state repair, not KB alone.
- implementation_leakage: requires runtime finalizer/surface control, not KB alone.
- generic_surface_realization: requires surface realization changes, not KB alone.
- false_green_diagnostics: requires evaluation governance, not KB alone.
- self_authored_acceptance: requires external/hidden review governance, not KB alone.
- hidden_review_failure: not rerun and not repaired by this KB expansion.

## Next Recommended KB Stage

Stage 1B should deepen the same graph only after runtime routing/state work can consume structured cards safely. Priority should be missing work closure for existing persons, then negative relation cards and sibling-transfer primitives, not domain-wide encyclopedia expansion.
`;
  ensureDir(SUMMARY_DOC);
  fs.writeFileSync(SUMMARY_DOC, doc);

  const hardFailures = [
    ...provenanceFailures,
    ...transferScopeFailures,
    ...conceptQualityFailures,
    ...relationQualityFailures,
    ...workQualityFailures,
    ...r24ProfileHits.map((row) => row.id)
  ];
  const result = {
    execution_ok: true,
    kb_quality_ok_for_r24_new_cards: hardFailures.length === 0,
    missing_reference_count: missingRefs.length,
    reports_dir: path.relative(ROOT, REPORT_DIR),
    summary_doc: path.relative(ROOT, SUMMARY_DOC)
  };
  console.log(JSON.stringify(result, null, 2));
  if (hardFailures.length || missingRefs.length) process.exit(2);
}

main();
