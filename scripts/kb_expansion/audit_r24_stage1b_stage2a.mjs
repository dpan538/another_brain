import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const REPORT_DIR = path.join(ROOT, "artifacts", "training_os", "kb_expansion");
const SUMMARY_DOC = path.join(ROOT, "docs", "kb_expansion_stage1b_stage2a_summary.md");
const MODE = process.argv.includes("--pre") ? "pre" : "post";

const STAGE_FILES = new Set([
  "r24_stage1b_strong_lane_closure.jsonl",
  "r24_stage2a_daily_world_slice.jsonl"
]);

const BASELINE_COMMIT = "04296d8";

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
  { name: "continue_ask", re: /你可以继续问/ }
];

const LONG_CHINESE_SENTENCE_RE = /[\u4e00-\u9fff][^。！？\n]{48,}[。！？]/;

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

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function typeClass(id) {
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
  return collectStrings(card).filter((text) => LONG_CHINESE_SENTENCE_RE.test(text)).map((text) => text.slice(0, 160));
}

function counts(cards) {
  const pub = cards.filter((card) => card.approved_for_public_runtime);
  return {
    total_source_cards: cards.length,
    public_runtime_cards: pub.length,
    person_cards: pub.filter((card) => card.entity_type === "person").length,
    work_cards: pub.filter((card) => card.entity_type === "work").length,
    concept_theme_movement_cards: pub.filter((card) => ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type)).length,
    relation_cards: pub.filter((card) => card.entity_type === "relation").length,
    method_cards: pub.filter((card) => card.id?.startsWith("method.") || card.domain?.startsWith("method.")).length
  };
}

function closureMetrics(publicCards, ids) {
  const persons = publicCards.filter((card) => card.entity_type === "person");
  const works = publicCards.filter((card) => card.entity_type === "work");
  const concepts = publicCards.filter((card) => ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type));
  const relations = publicCards.filter((card) => card.entity_type === "relation");
  const relationRefs = new Map();
  for (const relation of relations) {
    for (const id of [...(relation.source_ids || []), ...(relation.target_ids || [])]) {
      relationRefs.set(id, (relationRefs.get(id) || 0) + 1);
    }
  }
  const personClosed = persons.filter((card) => {
    const works = [...(card.works || []), ...(card.representative_works || [])].filter((id) => id.startsWith("work."));
    return works.length > 0 && works.every((id) => ids.has(id));
  });
  const workConceptClosed = works.filter((card) => {
    const conceptRefs = collectRefs(card).map((ref) => ref.id).filter((id) => ["concept", "theme", "movement", "period"].includes(typeClass(id)));
    return conceptRefs.length > 0 && conceptRefs.every((id) => ids.has(id));
  });
  const conceptRelationClosed = concepts.filter((card) => (card.relation_ids || []).some((id) => ids.has(id)) || relationRefs.has(card.id));
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

function groupedInventory(cards, entityTypes) {
  const rows = cards
    .filter((card) => card.approved_for_public_runtime && entityTypes.includes(card.entity_type))
    .map((card) => ({ id: card.id, names: card.names || [], entity_type: card.entity_type, domain: card.domain }))
    .sort((a, b) => `${a.domain}:${a.id}`.localeCompare(`${b.domain}:${b.id}`));
  const byDomain = {};
  for (const row of rows) {
    if (!byDomain[row.domain]) byDomain[row.domain] = [];
    byDomain[row.domain].push(row);
  }
  return { count: rows.length, by_domain: byDomain };
}

function qualityGaps(publicCards) {
  return {
    cards_with_no_provenance: publicCards.filter((card) => !Array.isArray(card.provenance) || card.provenance.length === 0).map((card) => card.id),
    cards_with_no_transfer_scope: publicCards.filter((card) => !Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0).map((card) => card.id),
    cards_with_no_negative_or_boundary: publicCards.filter((card) => {
      const negatives = Array.isArray(card.negative_moves) && card.negative_moves.length > 0;
      const boundary = Array.isArray(card.boundary_notes) && card.boundary_notes.length > 0;
      return !negatives && !boundary;
    }).map((card) => card.id)
  };
}

function methodInventory(publicCards) {
  return publicCards
    .filter((card) => card.id?.startsWith("method.") || card.domain?.startsWith("method."))
    .map((card) => {
      const hits = patternHits(card);
      const finalAnswerRisk = longSnippetHits(card).length > 0 || hits.length > 0;
      return {
        id: card.id,
        public_visible: card.visibility === "public" && card.approved_for_public_runtime === true,
        internal_only: !(card.visibility === "public" && card.approved_for_public_runtime === true),
        supplies_final_answer_content: finalAnswerRisk,
        leakage_risk: hits.includes("local_card") ? "high" : finalAnswerRisk ? "medium" : "low",
        surface_template_risk: hits,
        recommended_action: finalAnswerRisk ? "migrate_to_policy_registry_later" : "keep_internal_policy",
        priority: finalAnswerRisk ? "high" : "low"
      };
    });
}

function writeJson(file, value) {
  ensureDir(file);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const cards = allCards();
  const publicCards = cards.filter((card) => card.approved_for_public_runtime);
  const ids = new Set(publicCards.map((card) => card.id));
  const refs = publicCards.flatMap(collectRefs);
  const missingRefs = refs.filter((ref) => ["person", "work", "concept"].includes(typeClass(ref.id)) && !ids.has(ref.id));
  const missingByType = countBy(missingRefs, (ref) => typeClass(ref.id));
  const currentCounts = counts(cards);
  const closures = closureMetrics(publicCards, ids);
  const gaps = qualityGaps(publicCards);
  const profileHits = publicCards.map((card) => ({ id: card.id, file: card.__file, hits: patternHits(card) })).filter((row) => row.hits.length);
  const longSnippets = publicCards.map((card) => ({ id: card.id, file: card.__file, snippets: longSnippetHits(card) })).filter((row) => row.snippets.length);
  const methods = methodInventory(publicCards);
  const stageCards = cards.filter((card) => STAGE_FILES.has(path.basename(card.__file)));

  const preAudit = {
    generated_at: new Date().toISOString(),
    baseline_commit: BASELINE_COMMIT,
    counts: currentCounts,
    missing_references: {
      total: missingRefs.length,
      by_type: missingByType,
      rows: missingRefs
    },
    closure: closures,
    quality_gaps: {
      no_provenance_count: gaps.cards_with_no_provenance.length,
      no_transfer_scope_count: gaps.cards_with_no_transfer_scope.length,
      no_negative_or_boundary_count: gaps.cards_with_no_negative_or_boundary.length,
      no_provenance_examples: gaps.cards_with_no_provenance.slice(0, 50),
      no_transfer_scope_examples: gaps.cards_with_no_transfer_scope.slice(0, 50),
      no_negative_or_boundary_examples: gaps.cards_with_no_negative_or_boundary.slice(0, 50)
    },
    method_cards: methods,
    public_cards_with_profile_template_language: {
      count: profileHits.length,
      examples: profileHits.slice(0, 80)
    },
    public_cards_with_possible_final_answer_snippets: {
      count: longSnippets.length,
      examples: longSnippets.slice(0, 80)
    }
  };

  if (MODE === "pre") {
    writeJson(path.join(REPORT_DIR, "stage1b_stage2a_pre_audit.json"), preAudit);
    console.log(JSON.stringify({
      execution_ok: true,
      mode: "pre",
      public_runtime_cards: currentCounts.public_runtime_cards,
      missing_references: missingRefs.length,
      relation_density: closures.relation_density
    }, null, 2));
    return;
  }

  const stageByType = countBy(stageCards, (card) => card.entity_type);
  const stageByDomain = countBy(stageCards, (card) => card.domain);
  const stageProfileHits = stageCards.map((card) => ({ id: card.id, file: card.__file, hits: patternHits(card) })).filter((row) => row.hits.length);
  const stageLongSnippets = stageCards.map((card) => ({ id: card.id, file: card.__file, snippets: longSnippetHits(card) })).filter((row) => row.snippets.length);
  const stageQualityFailures = {
    provenance: stageCards.filter((card) => !Array.isArray(card.provenance) || card.provenance.length === 0).map((card) => card.id),
    transfer_scope: stageCards.filter((card) => !Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0).map((card) => card.id),
    concept_negative: stageCards.filter((card) => ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type) && (!Array.isArray(card.non_examples) || card.non_examples.length === 0) && (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0)).map((card) => card.id),
    work_copyright: stageCards.filter((card) => card.entity_type === "work" && !card.copyright_boundary).map((card) => card.id),
    relation_verbs: stageCards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.licensed_verbs) || card.licensed_verbs.length === 0)).map((card) => card.id),
    relation_negative: stageCards.filter((card) => card.entity_type === "relation" && (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0)).map((card) => card.id)
  };

  const finalInventory = {
    generated_at: new Date().toISOString(),
    public_categories: Object.keys(countBy(publicCards, (card) => card.domain)).sort(),
    people: groupedInventory(cards, ["person"]),
    works: groupedInventory(cards, ["work"]),
    concepts_periods_movements_themes: groupedInventory(cards, ["concept", "theme", "movement", "period", "genre"]),
    relations: groupedInventory(cards, ["relation"])
  };

  const prePath = path.join(REPORT_DIR, "stage1b_stage2a_pre_audit.json");
  const previous = fs.existsSync(prePath) ? JSON.parse(fs.readFileSync(prePath, "utf8")) : null;
  const baselineCounts = previous?.counts || {};
  const baselineClosure = previous?.closure || {};
  const delta = {
    baseline_commit: BASELINE_COMMIT,
    final_counts: currentCounts,
    added_stage_cards: stageCards.length,
    added_by_type: stageByType,
    added_by_domain: stageByDomain,
    delta_from_pre_audit: Object.fromEntries(Object.entries(currentCounts).map(([key, value]) => [key, value - (baselineCounts[key] || 0)]))
  };

  const domainCoverage = {
    added_by_domain: stageByDomain,
    stage1b_domains: ["music", "modern_chinese_literature", "Japanese_literature", "Western_modernism", "film", "art_photography_design", "language_philosophy"],
    stage2a_domains: ["science_history", "city_public_space", "food_daily_culture", "law_boundary", "psychology_care_boundary", "education_learning", "economy_institutions", "technology_interface"],
    domains_still_weak: [
      "non-Western science history",
      "global South urbanism",
      "food cultures outside general craft concepts",
      "current law by jurisdiction",
      "clinical psychology and crisis support",
      "contemporary platform technology"
    ]
  };

  const relationReport = {
    before_relation_density: baselineClosure.relation_density ?? null,
    after_relation_density: closures.relation_density,
    before_relation_cards: baselineCounts.relation_cards ?? null,
    after_relation_cards: currentCounts.relation_cards,
    added_stage_relation_cards: stageByType.relation || 0,
    relation_type_counts: countBy(publicCards.filter((card) => card.entity_type === "relation"), (card) => card.relation_type || "legacy_unspecified"),
    person_to_work_closure_before: baselineClosure.person_to_work_closure_ratio ?? null,
    person_to_work_closure_after: closures.person_to_work_closure_ratio,
    work_to_concept_closure_before: baselineClosure.work_to_concept_closure_ratio ?? null,
    work_to_concept_closure_after: closures.work_to_concept_closure_ratio,
    concept_to_relation_closure_before: baselineClosure.concept_to_relation_closure_ratio ?? null,
    concept_to_relation_closure_after: closures.concept_to_relation_closure_ratio
  };

  const provenanceAudit = {
    stage_cards: stageCards.length,
    failures: stageQualityFailures,
    pass: Object.values(stageQualityFailures).every((rows) => rows.length === 0)
  };

  const noAnswerAudit = {
    stage_profile_template_hits: stageProfileHits,
    stage_long_snippet_hits: stageLongSnippets,
    legacy_profile_template_count: profileHits.filter((row) => !STAGE_FILES.has(path.basename(row.file))).length,
    pass_for_stage_cards: stageProfileHits.length === 0 && stageLongSnippets.length === 0
  };

  writeJson(path.join(REPORT_DIR, "stage1b_stage2a_card_delta_summary.json"), delta);
  writeJson(path.join(REPORT_DIR, "stage1b_stage2a_domain_coverage_report.json"), domainCoverage);
  writeJson(path.join(REPORT_DIR, "stage1b_stage2a_relation_density_report.json"), relationReport);
  writeJson(path.join(REPORT_DIR, "stage1b_stage2a_provenance_audit.json"), provenanceAudit);
  writeJson(path.join(REPORT_DIR, "stage1b_stage2a_no_answer_snippet_audit.json"), noAnswerAudit);
  writeJson(path.join(REPORT_DIR, "stage1b_stage2a_public_card_taxonomy_inventory.json"), finalInventory);
  writeJson(path.join(REPORT_DIR, "method_card_decoupling_inventory_stage1b_stage2a.json"), { method_cards: methods });

  const doc = `# KB Expansion Stage 1B + Stage 2A Summary

## Boundary

This round expands public semantic KB cards and deterministic generated KB data only. It does not repair routing, state, transforms, surface realization, R23 candidate logic, eval thresholds, answerIndex, or tiny-router weights.

## Baseline And Final Counts

- Baseline commit: ${BASELINE_COMMIT}
- Baseline public runtime cards from pre-audit: ${baselineCounts.public_runtime_cards ?? "unknown"}
- Final public runtime cards: ${currentCounts.public_runtime_cards}
- Added/materially new Stage 1B/2A cards: ${stageCards.length}
- Added by type: ${Object.entries(stageByType).map(([key, value]) => `${key}=${value}`).join(", ")}
- Added domains: ${Object.keys(stageByDomain).sort().join(", ")}

## Closure Metrics

- Relation density: ${baselineClosure.relation_density ?? "unknown"} -> ${closures.relation_density}
- Person-to-work closure: ${baselineClosure.person_to_work_closure_ratio ?? "unknown"} -> ${closures.person_to_work_closure_ratio}
- Work-to-concept closure: ${baselineClosure.work_to_concept_closure_ratio ?? "unknown"} -> ${closures.work_to_concept_closure_ratio}
- Concept-to-relation closure: ${baselineClosure.concept_to_relation_closure_ratio ?? "unknown"} -> ${closures.concept_to_relation_closure_ratio}
- Missing public person/work/concept references after this round: ${missingRefs.length}

## Quality Audits

- New-card provenance failures: ${stageQualityFailures.provenance.length}
- New-card transfer_scope failures: ${stageQualityFailures.transfer_scope.length}
- New work cards missing copyright_boundary: ${stageQualityFailures.work_copyright.length}
- New relation cards missing licensed_verbs: ${stageQualityFailures.relation_verbs.length}
- New relation cards missing negative_moves: ${stageQualityFailures.relation_negative.length}
- New card profile-template hits: ${stageProfileHits.length}
- New card long-answer-snippet hits: ${stageLongSnippets.length}

## Method Card Risks

- Public method cards inventoried: ${methods.length}
- Method cards with medium/high leakage risk: ${methods.filter((row) => row.leakage_risk !== "low").length}
- This round does not migrate method policy into semantic public cards.

## Domains Still Weak

${domainCoverage.domains_still_weak.map((item) => `- ${item}`).join("\n")}

## Not Solved By KB Expansion Alone

- wrong_referent: requires routing/state/reference repair.
- stale_domain_contamination: requires state isolation and domain finalizer work.
- context_lost: requires discourse memory repair.
- transform_without_semantic_binding: requires transform logic over semantic records.
- implementation_leakage: requires runtime finalizer/surface work.
- generic surface realization: requires surface realization changes.
- mechanical reply: requires response surface and evaluation governance.
- false-green diagnostics: requires evaluation governance.
- hidden review failure: not rerun and not repaired by KB expansion alone.
- R23 candidate rejection: remains rejected.

## Recommended Next Stage

If runtime can safely consume structured cards, Stage 2B can deepen daily-world coverage and add more negative relation cards. If hidden review remains dominated by wrong referent/domain/surface failures, the next work should be a separate patch-only routing/state/surface repair, not more KB cards.
`;
  ensureDir(SUMMARY_DOC);
  fs.writeFileSync(SUMMARY_DOC, doc);

  const hardFailures = [
    ...Object.values(stageQualityFailures).flat(),
    ...stageProfileHits.map((row) => row.id),
    ...stageLongSnippets.map((row) => row.id)
  ];
  const result = {
    execution_ok: true,
    mode: "post",
    stage_cards: stageCards.length,
    kb_quality_ok_for_stage_cards: hardFailures.length === 0,
    missing_references: missingRefs.length,
    reports_dir: path.relative(ROOT, REPORT_DIR),
    summary_doc: path.relative(ROOT, SUMMARY_DOC)
  };
  console.log(JSON.stringify(result, null, 2));
  if (hardFailures.length || missingRefs.length) process.exit(2);
}

main();
