import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const REPORT_DIR = path.join(ROOT, "artifacts", "training_os", "kb_expansion");
const GENERATED = path.join(ROOT, "web", "culture_cards.generated.js");

const MODE = process.argv.includes("--inventory") ? "inventory" : "post";
const BASELINE_COMMIT = "6d1f7a16a5178282e93e4a735e30f8fe161d4534";
const BASELINE = {
  source_cards: 2074,
  active_source_cards: 1033,
  generated_runtime_cards: 1032,
  generated_size_bytes: 3322701,
  generated_sha256: "fdd5ae9c4076efffefceacc83304993fe86b7c2236467d3c17dc9174a584d30f",
  original_runtime_size_baseline_bytes: 1649822,
  relation_density: 0.349,
  person_to_work_closure_ratio: 0.788,
  work_to_concept_closure_ratio: 0.822,
  concept_to_relation_closure_ratio: 0.585
};

const STAGE_FILES = new Set([
  "r27_inventory_first_world_lit_cinema_music.jsonl",
  "r27_inventory_first_daily_thought_boundary.jsonl",
  "r27_inventory_first_bridge_closure.jsonl"
]);

const PROFILE_PATTERNS = [
  { name: "can_enter", re: /可以从/ },
  { name: "enter", re: /进入/ },
  { name: "object", re: /这个对象|可以理解为/ },
  { name: "focus", re: /重点在/ },
  { name: "assistant_control", re: /我会按|这里说的是|换个说法|简单说|我接住|更深一点|你可以继续问/ },
  { name: "implementation", re: /本地知识卡|当前会话|求解器|runtime|profile|active topic|response mode/i }
];
const LONG_CHINESE_SENTENCE_RE = /[\u4e00-\u9fff][^。！？\n]{56,}[。！？]/;
const CSV_COLUMNS = [
  "card_id",
  "card_type",
  "names",
  "name_zh",
  "name_original",
  "domain",
  "domain_family",
  "file_path",
  "public_runtime",
  "runtime_scope",
  "pack_id",
  "activation_priority",
  "source_library_tier",
  "active_runtime_in_generated_file",
  "provenance_present",
  "transfer_scope_present",
  "negative_moves_present",
  "boundary_notes_present",
  "representative_works_count",
  "related_concepts_count",
  "relation_ids_count",
  "source_ids_count",
  "target_ids_count",
  "orphan_status",
  "quality_flags"
];

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

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((col) => csvEscape(row[col])).join(","));
  writeText(file, `${lines.join("\n")}\n`);
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

function generatedIds() {
  if (!fs.existsSync(GENERATED)) return new Set();
  const text = fs.readFileSync(GENERATED, "utf8");
  const match = text.match(/export const CULTURE_CARDS = ([\s\S]*);\n?$/);
  if (!match) return new Set();
  return new Set(JSON.parse(match[1]).map((card) => card.id));
}

function generatedInfo() {
  const size = fs.existsSync(GENERATED) ? fs.statSync(GENERATED).size : 0;
  return {
    exists: fs.existsSync(GENERATED),
    cards: generatedIds().size,
    size_bytes: size,
    sha256: fs.existsSync(GENERATED) ? crypto.createHash("sha256").update(fs.readFileSync(GENERATED)).digest("hex") : null,
    size_ratio_from_pre_r24_baseline: Number((size / BASELINE.original_runtime_size_baseline_bytes).toFixed(3)),
    size_ratio_from_r26: Number((size / BASELINE.generated_size_bytes).toFixed(3))
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
    const key = fn(row) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function isConcept(card) {
  return ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type);
}

function typeOfId(id = "") {
  if (id.startsWith("person.")) return "person";
  if (id.startsWith("work.")) return "work";
  if (/^(concept|theme|movement|period|genre)\./.test(id)) return "concept";
  if (id.startsWith("relation.")) return "relation";
  return "other";
}

function domainFamily(domain = "") {
  if (/music|song|mandopop|cantopop|jazz|rock/i.test(domain)) return "music";
  if (/film|cinema|movie/i.test(domain)) return "film";
  if (/literature|poetry|novel|japanese_lit|western_modern/i.test(domain)) return "literature";
  if (/art|image|photo|design|bauhaus|interface/i.test(domain)) return "art_image_design";
  if (/language|philosophy|social_thought/i.test(domain)) return "philosophy_language_social";
  if (/city|urban|food|daily/i.test(domain)) return "city_food_daily";
  if (/science|technology|computing/i.test(domain)) return "science_technology";
  if (/economy|law|education|care|psychology|boundary/i.test(domain)) return "economy_law_education_care";
  if (/bridge|relation/i.test(domain)) return "bridge_boundary";
  return domain.split(".")[0] || "unknown";
}

function collectRefs(card) {
  const refs = [];
  const add = (id, field) => {
    if (typeof id === "string" && id.includes(".")) refs.push({ id, field });
  };
  for (const field of ["works", "representative_works", "related_concepts", "related_people", "relation_ids", "source_ids", "target_ids", "creator_ids", "example_ids", "concepts"]) {
    if (Array.isArray(card[field])) card[field].forEach((id) => add(id, field));
  }
  if (Array.isArray(card.related_entities)) card.related_entities.forEach((item) => add(item?.id, "related_entities"));
  return refs;
}

function endpointRelationCounts(cards) {
  const map = new Map();
  for (const card of cards.filter((row) => row.entity_type === "relation")) {
    for (const id of [...(card.source_ids || []), ...(card.target_ids || [])]) map.set(id, (map.get(id) || 0) + 1);
  }
  return map;
}

function qualityFlags(card) {
  const flags = [];
  const strings = collectStrings(card).join("\n");
  if (!Array.isArray(card.provenance) || card.provenance.length === 0) flags.push("no_provenance");
  if (!Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0) flags.push("no_transfer_scope");
  if (!(Array.isArray(card.negative_moves) && card.negative_moves.length) && !(Array.isArray(card.boundary_notes) && card.boundary_notes.length)) flags.push("no_negative_or_boundary");
  if (card.entity_type === "relation" && (!Array.isArray(card.licensed_verbs) || card.licensed_verbs.length === 0)) flags.push("relation_no_licensed_verbs");
  if (!card.runtime_scope || !card.pack_id) flags.push("missing_pack_metadata");
  for (const pattern of PROFILE_PATTERNS) {
    if (pattern.re.test(strings)) flags.push(`profile_hit_${pattern.name}`);
  }
  if (collectStrings(card).some((text) => LONG_CHINESE_SENTENCE_RE.test(text))) flags.push("long_final_answer_risk");
  return [...new Set(flags)];
}

function relationCountFor(card, relCounts) {
  return relCounts.get(card.id) || (Array.isArray(card.relation_ids) ? card.relation_ids.length : 0);
}

function orphanStatus(card, ids, relCounts) {
  const relationCount = relationCountFor(card, relCounts);
  if (card.entity_type === "person") {
    const works = [...(card.works || []), ...(card.representative_works || [])].filter((id) => ids.has(id));
    if (works.length === 0 || relationCount === 0) return "orphan_person";
  }
  if (card.entity_type === "work") {
    const creators = (card.creator_ids || collectRefs(card).filter((ref) => ref.id.startsWith("person.")).map((ref) => ref.id)).filter((id) => ids.has(id));
    const concepts = [...(card.concepts || []), ...collectRefs(card).filter((ref) => typeOfId(ref.id) === "concept").map((ref) => ref.id)].filter((id) => ids.has(id));
    if (creators.length === 0 || concepts.length === 0 || relationCount === 0) return "orphan_work";
  }
  if (isConcept(card)) {
    const examples = Array.isArray(card.examples) ? card.examples.length : 0;
    const hasNegative = (Array.isArray(card.negative_moves) && card.negative_moves.length) || (Array.isArray(card.non_examples) && card.non_examples.length);
    if (examples === 0 || !hasNegative || relationCount === 0) return "orphan_concept";
  }
  if (card.entity_type === "relation") {
    const missing = [...(card.source_ids || []), ...(card.target_ids || [])].filter((id) => ["person", "work", "concept"].includes(typeOfId(id)) && !ids.has(id));
    if (missing.length) return "relation_missing_endpoint";
  }
  return "closed_or_non_anchor";
}

function displayNames(card) {
  const names = Array.isArray(card.names) ? card.names : [];
  const zh = names.find((name) => /[\u4e00-\u9fff]/.test(name)) || "";
  const original = names.find((name) => !/[\u4e00-\u9fff]/.test(name)) || names[0] || "";
  return { names, zh, original };
}

function inventoryRows(cards) {
  const ids = new Set(cards.map((card) => card.id));
  const gen = generatedIds();
  const relCounts = endpointRelationCounts(cards);
  return cards.map((card) => {
    const names = displayNames(card);
    const refs = collectRefs(card);
    const flags = qualityFlags(card);
    return {
      card_id: card.id,
      card_type: card.entity_type,
      names: names.names.join(" / "),
      name_zh: names.zh,
      name_original: names.original,
      domain: card.domain || "",
      domain_family: domainFamily(card.domain),
      file_path: card.__file,
      public_runtime: card.approved_for_public_runtime === true ? "yes" : "no",
      runtime_scope: card.runtime_scope || "",
      pack_id: card.pack_id || "",
      activation_priority: card.activation_priority ?? "",
      source_library_tier: card.source_library_tier || "",
      active_runtime_in_generated_file: gen.has(card.id) ? "yes" : "no",
      provenance_present: Array.isArray(card.provenance) && card.provenance.length ? "yes" : "no",
      transfer_scope_present: Array.isArray(card.transfer_scope) && card.transfer_scope.length ? "yes" : "no",
      negative_moves_present: Array.isArray(card.negative_moves) && card.negative_moves.length ? "yes" : "no",
      boundary_notes_present: Array.isArray(card.boundary_notes) && card.boundary_notes.length ? "yes" : "no",
      representative_works_count: [...(card.works || []), ...(card.representative_works || [])].filter((id) => id.startsWith("work.")).length,
      related_concepts_count: refs.filter((ref) => typeOfId(ref.id) === "concept").length,
      relation_ids_count: relationCountFor(card, relCounts),
      source_ids_count: (card.source_ids || []).length,
      target_ids_count: (card.target_ids || []).length,
      orphan_status: orphanStatus(card, ids, relCounts),
      quality_flags: flags.join(";")
    };
  }).sort((a, b) => `${a.pack_id}|${a.domain}|${a.card_type}|${a.card_id}`.localeCompare(`${b.pack_id}|${b.domain}|${b.card_type}|${b.card_id}`));
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

function closureFromInventoryRows(rows) {
  const persons = rows.filter((row) => row.card_type === "person");
  const works = rows.filter((row) => row.card_type === "work");
  const concepts = rows.filter((row) => ["concept", "theme", "movement", "period", "genre"].includes(row.card_type));
  const relations = rows.filter((row) => row.card_type === "relation");
  const personClosed = persons.filter((row) => Number(row.representative_works_count) > 0 && Number(row.relation_ids_count) > 0);
  const workClosed = works.filter((row) => Number(row.related_concepts_count) > 0 && Number(row.relation_ids_count) > 0);
  const conceptClosed = concepts.filter((row) => Number(row.relation_ids_count) > 0);
  return {
    relation_density: Number((relations.length / Math.max(1, rows.length)).toFixed(3)),
    person_to_work_closure_ratio: Number((personClosed.length / Math.max(1, persons.length)).toFixed(3)),
    work_to_concept_closure_ratio: Number((workClosed.length / Math.max(1, works.length)).toFixed(3)),
    concept_to_relation_closure_ratio: Number((conceptClosed.length / Math.max(1, concepts.length)).toFixed(3)),
    person_to_work_closed: personClosed.length,
    work_to_concept_closed: workClosed.length,
    concept_to_relation_closed: conceptClosed.length
  };
}

function counts(cards) {
  return {
    total_source_cards: cards.length,
    active_runtime_source_cards: cards.filter((card) => card.approved_for_public_runtime).length,
    source_only_cards: cards.filter((card) => card.runtime_scope === "source_only").length,
    optional_long_tail_cards: cards.filter((card) => card.runtime_scope === "optional_long_tail").length,
    person_cards: cards.filter((card) => card.entity_type === "person").length,
    work_cards: cards.filter((card) => card.entity_type === "work").length,
    concept_cards: cards.filter(isConcept).length,
    relation_cards: cards.filter((card) => card.entity_type === "relation").length
  };
}

function missingPublicRefs(cards) {
  const active = cards.filter((card) => card.approved_for_public_runtime);
  const ids = new Set(active.map((card) => card.id));
  return active.flatMap((card) => collectRefs(card).map((ref) => ({ from: card.id, from_file: card.__file, id: ref.id, field: ref.field })))
    .filter((ref) => ["person", "work", "concept"].includes(typeOfId(ref.id)) && !ids.has(ref.id));
}

function gapMap(cards, rows) {
  const gaps = [];
  const byDomainFamily = countBy(rows, (row) => row.domain_family);
  const addGap = (type, affected, row, severity, action, fix, reason) => {
    gaps.push({
      gap_id: `gap.r27.${type}.${gaps.length + 1}`,
      gap_type: type,
      affected_card_ids: affected,
      domain: row?.domain || "",
      pack_id: row?.pack_id || "",
      severity,
      recommended_action: action,
      should_fix_in_r27: fix ? "yes" : "no",
      reason
    });
  };
  for (const row of rows) {
    if (row.orphan_status === "orphan_person") addGap("orphan_person", [row.card_id], row, row.public_runtime === "yes" ? "major" : "minor", "add representative work/concept relation closure or demote inactive long tail", row.public_runtime === "yes", "person lacks work/relation closure");
    if (row.orphan_status === "orphan_work") addGap("orphan_work", [row.card_id], row, row.public_runtime === "yes" ? "major" : "minor", "add creator/concept/relation closure", row.public_runtime === "yes", "work lacks creator, concept, or relation closure");
    if (row.orphan_status === "orphan_concept") addGap("orphan_concept", [row.card_id], row, row.public_runtime === "yes" ? "major" : "minor", "add examples/non-examples and concept relation", row.public_runtime === "yes", "concept lacks example/negative/relation closure");
    if (row.quality_flags.includes("no_provenance")) addGap("provenance_gap", [row.card_id], row, row.public_runtime === "yes" ? "blocker" : "major", "add stable provenance or keep source-only", row.public_runtime === "yes", "card lacks provenance");
    if (row.quality_flags.includes("no_transfer_scope")) addGap("transfer_scope_gap", [row.card_id], row, row.public_runtime === "yes" ? "blocker" : "major", "add transfer_scope or keep source-only", row.public_runtime === "yes", "card lacks transfer_scope");
    if (row.quality_flags.includes("missing_pack_metadata")) addGap("pack_assignment_gap", [row.card_id], row, row.public_runtime === "yes" ? "major" : "minor", "assign runtime_scope and pack_id", row.public_runtime === "yes", "card lacks pack metadata");
    if (row.public_runtime === "yes" && Number(row.activation_priority || 0) >= 8) addGap("runtime_bloat_risk", [row.card_id], row, "minor", "review active status; likely source_only or optional_long_tail", false, "active card has low activation priority");
  }
  const relationRows = cards.filter((card) => card.entity_type === "relation");
  const endpointKey = (a, b) => [a, b].sort().join("|");
  const endpointPairs = new Set(relationRows.flatMap((card) => (card.source_ids || []).flatMap((a) => (card.target_ids || []).map((b) => endpointKey(a, b)))));
  const contrastPairs = [
    ["concept.wabi_sabi", "concept.minimalism"],
    ["concept.mono_no_aware", "concept.bleakness"],
    ["concept.seasonality", "concept.weather"],
    ["concept.interface", "concept.visual_styling"],
    ["concept.market", "concept.society"],
    ["concept.memory", "concept.fact"],
    ["concept.analogy_not_identity", "concept.same_or_different_question"]
  ];
  const ids = new Set(cards.map((card) => card.id));
  for (const [a, b] of contrastPairs) {
    if (ids.has(a) && ids.has(b) && !endpointPairs.has(endpointKey(a, b))) {
      addGap("contrast_gap", [a, b], { domain: "bridge_boundary", pack_id: "bridge_negative_boundary_layer" }, "major", "add contrast foil relation", true, "known sibling distinction lacks relation card");
    }
  }
  for (const [family, count] of Object.entries(byDomainFamily)) {
    if (count < 30) addGap("undercovered_domain", [], { domain: family, pack_id: "" }, "minor", "expand only if high-transfer use is identified", false, `domain family has ${count} cards`);
  }
  const activeRows = rows.filter((row) => row.public_runtime === "yes");
  const activeByFamily = countBy(activeRows, (row) => row.domain_family);
  for (const [family, count] of Object.entries(activeByFamily)) {
    if (count > 260) addGap("overactive_domain", [], { domain: family, pack_id: "" }, "minor", "review active selection and keep long-tail source-only", false, `domain family has ${count} active cards`);
  }
  const highRisk = rows.filter((row) => /(law|care|psychology|science|technology|economy)/i.test(row.domain_family) && row.public_runtime === "yes" && !row.boundary_notes_present.includes("yes") && !row.negative_moves_present.includes("yes"));
  for (const row of highRisk) addGap("boundary_gap", [row.card_id], row, "major", "add boundary_notes or negative_moves", true, "high-risk family lacks visible boundary/negative support");
  return gaps;
}

function markdownTable(headers, rows) {
  const out = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const row of rows) out.push(`| ${headers.map((h) => String(row[h] ?? "").replace(/\|/g, "/")).join(" | ")} |`);
  return out.join("\n");
}

function writeInventoryDocs(rows, gaps) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.pack_id || "legacy_unassigned"} / ${row.domain || "unknown"} / ${row.card_type || "unknown"}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  let full = "# R27 Full KB Inventory Index\n\nThis is a compact identifier index generated before R27 expansion. It lists every source card without full card bodies.\n\n";
  for (const [key, group] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    full += `\n## ${key}\n\n`;
    full += markdownTable(["card_id", "names", "runtime_scope", "public_runtime", "active_runtime_in_generated_file", "orphan_status"], group.map((row) => ({
      card_id: row.card_id,
      names: row.names,
      runtime_scope: row.runtime_scope,
      public_runtime: row.public_runtime,
      active_runtime_in_generated_file: row.active_runtime_in_generated_file,
      orphan_status: row.orphan_status
    })));
    full += "\n";
  }
  writeText(path.join(ROOT, "docs", "kb_inventory_r27_full_index.md"), full);

  const people = rows.filter((row) => row.card_type === "person").map((row) => ({
    domain: row.domain, name_zh: row.name_zh, name_original: row.name_original, card_id: row.card_id, runtime_scope: row.runtime_scope, pack_id: row.pack_id, representative_works_count: row.representative_works_count, related_concepts_count: row.related_concepts_count, relation_count: row.relation_ids_count, closure_status: row.orphan_status
  }));
  const works = rows.filter((row) => row.card_type === "work").map((row) => ({
    domain: row.domain, title_zh: row.name_zh, title_original: row.name_original, card_id: row.card_id, runtime_scope: row.runtime_scope, pack_id: row.pack_id, concepts_count: row.related_concepts_count, relation_count: row.relation_ids_count, copyright_boundary_present: "see_card", closure_status: row.orphan_status
  }));
  const concepts = rows.filter((row) => ["concept", "theme", "movement", "period", "genre"].includes(row.card_type)).map((row) => ({
    domain: row.domain, concept_zh: row.name_zh, concept_original: row.name_original, card_id: row.card_id, runtime_scope: row.runtime_scope, pack_id: row.pack_id, examples_count: "see_card", non_examples_count: "see_card", relation_count: row.relation_ids_count, boundary_negative_present: row.negative_moves_present === "yes" || row.boundary_notes_present === "yes" ? "yes" : "no", closure_status: row.orphan_status
  }));
  const relationCards = allCards().filter((card) => card.entity_type === "relation").map((card) => ({
    relation_type: card.relation_type || "",
    source_ids: (card.source_ids || []).join(";"),
    target_ids: (card.target_ids || []).join(";"),
    shared_axes: (card.shared_axes || []).join(";"),
    contrast_axes: (card.contrast_axes || []).join(";"),
    licensed_verbs: (card.licensed_verbs || []).join(";"),
    runtime_scope: card.runtime_scope || "",
    pack_id: card.pack_id || "",
    negative_moves_present: Array.isArray(card.negative_moves) && card.negative_moves.length ? "yes" : "no",
    provenance_present: Array.isArray(card.provenance) && card.provenance.length ? "yes" : "no"
  }));
  const packRows = Object.entries(countBy(rows, (row) => row.pack_id || "legacy_unassigned")).map(([pack_id, total]) => {
    const group = rows.filter((row) => (row.pack_id || "legacy_unassigned") === pack_id);
    return {
      pack_id,
      runtime_scope: [...new Set(group.map((row) => row.runtime_scope || "legacy_unassigned"))].join(";"),
      total_cards: total,
      person_cards: group.filter((row) => row.card_type === "person").length,
      work_cards: group.filter((row) => row.card_type === "work").length,
      concept_cards: group.filter((row) => ["concept", "theme", "movement", "period", "genre"].includes(row.card_type)).length,
      relation_cards: group.filter((row) => row.card_type === "relation").length,
      boundary_negative_cards: group.filter((row) => row.negative_moves_present === "yes" || row.boundary_notes_present === "yes").length,
      active_generated_count: group.filter((row) => row.active_runtime_in_generated_file === "yes").length,
      source_only_count: group.filter((row) => row.runtime_scope === "source_only").length,
      optional_long_tail_count: group.filter((row) => row.runtime_scope === "optional_long_tail").length,
      provenance_issues: group.filter((row) => row.provenance_present === "no").length,
      closure_issues: group.filter((row) => row.orphan_status !== "closed_or_non_anchor").length,
      runtime_risk: group.filter((row) => row.public_runtime === "yes").length > 240 ? "review" : "low"
    };
  });
  writeText(path.join(ROOT, "docs", "kb_inventory_r27_people.md"), `# R27 People Inventory\n\n${markdownTable(Object.keys(people[0] || {}), people)}\n`);
  writeText(path.join(ROOT, "docs", "kb_inventory_r27_works.md"), `# R27 Works Inventory\n\n${markdownTable(Object.keys(works[0] || {}), works)}\n`);
  writeText(path.join(ROOT, "docs", "kb_inventory_r27_concepts.md"), `# R27 Concepts Inventory\n\n${markdownTable(Object.keys(concepts[0] || {}), concepts)}\n`);
  writeText(path.join(ROOT, "docs", "kb_inventory_r27_relations.md"), `# R27 Relations Inventory\n\n${markdownTable(Object.keys(relationCards[0] || {}), relationCards)}\n`);
  writeText(path.join(ROOT, "docs", "kb_inventory_r27_packs.md"), `# R27 Packs Inventory\n\n${markdownTable(Object.keys(packRows[0] || {}), packRows)}\n`);

  const gapDocRows = gaps.slice(0, 240).map((gap) => ({
    gap_id: gap.gap_id,
    gap_type: gap.gap_type,
    domain: gap.domain,
    pack_id: gap.pack_id,
    severity: gap.severity,
    should_fix_in_r27: gap.should_fix_in_r27,
    affected: gap.affected_card_ids.join(";"),
    recommended_action: gap.recommended_action
  }));
  writeText(path.join(ROOT, "docs", "kb_gap_map_r27.md"), `# R27 KB Gap Map\n\nGenerated before R27 expansion. It is a backlog, not an acceptance metric.\n\n${markdownTable(Object.keys(gapDocRows[0] || {}), gapDocRows)}\n`);
}

function writeInventory() {
  const cards = allCards();
  const rows = inventoryRows(cards);
  const activeRows = rows.filter((row) => row.active_runtime_in_generated_file === "yes");
  const sourceOnlyRows = rows.filter((row) => row.runtime_scope === "source_only");
  const optionalRows = rows.filter((row) => row.runtime_scope === "optional_long_tail");
  const gaps = gapMap(cards, rows);
  const summary = {
    generated_at: new Date().toISOString(),
    baseline_commit: BASELINE_COMMIT,
    counts: counts(cards),
    generated_runtime: generatedInfo(),
    cards_by_type: countBy(rows, (row) => row.card_type),
    cards_by_domain_family: countBy(rows, (row) => row.domain_family),
    cards_by_pack_id: countBy(rows, (row) => row.pack_id || "legacy_unassigned"),
    cards_by_runtime_scope: countBy(rows, (row) => row.runtime_scope || "legacy_unassigned"),
    active_generated_cards: activeRows.length,
    source_only_cards: sourceOnlyRows.length,
    optional_long_tail_cards: optionalRows.length,
    closure: closureMetrics(cards),
    missing_public_references: missingPublicRefs(cards),
    gap_counts: countBy(gaps, (gap) => gap.gap_type),
    gap_severity_counts: countBy(gaps, (gap) => gap.severity)
  };
  writeJson(path.join(REPORT_DIR, "r27_full_source_inventory.json"), rows);
  writeCsv(path.join(REPORT_DIR, "r27_full_source_inventory.csv"), rows);
  writeJson(path.join(REPORT_DIR, "r27_active_runtime_inventory.json"), activeRows);
  writeCsv(path.join(REPORT_DIR, "r27_active_runtime_inventory.csv"), activeRows);
  writeJson(path.join(REPORT_DIR, "r27_source_only_inventory.json"), sourceOnlyRows);
  writeJson(path.join(REPORT_DIR, "r27_optional_long_tail_inventory.json"), optionalRows);
  writeJson(path.join(REPORT_DIR, "r27_inventory_summary.json"), summary);
  writeJson(path.join(REPORT_DIR, "r27_gap_map.json"), gaps);
  writeInventoryDocs(rows, gaps);
  console.log(JSON.stringify({
    execution_ok: true,
    mode: "inventory",
    source_cards: rows.length,
    active_generated_cards: activeRows.length,
    gaps: gaps.length,
    missing_public_references: summary.missing_public_references.length
  }, null, 2));
}

function stageCards(cards) {
  return cards.filter((card) => STAGE_FILES.has(path.basename(card.__file)));
}

function writePostReports() {
  const cards = allCards();
  const rows = inventoryRows(cards);
  const active = cards.filter((card) => card.approved_for_public_runtime);
  const stage = stageCards(cards);
  const stageRows = inventoryRows(stage);
  const stageFlags = stageRows.flatMap((row) => row.quality_flags ? row.quality_flags.split(";").filter(Boolean).map((flag) => ({ id: row.card_id, flag })) : []);
  const stageProfileHits = stageFlags.filter((row) => row.flag.startsWith("profile_hit"));
  const stageLongHits = stageFlags.filter((row) => row.flag === "long_final_answer_risk");
  const gen = generatedInfo();
  const closure = closureMetrics(active);
  const sourceClosure = closureMetrics(cards);
  const preActiveInventoryPath = path.join(REPORT_DIR, "r27_active_runtime_inventory.json");
  const preActiveClosure = fs.existsSync(preActiveInventoryPath)
    ? closureFromInventoryRows(JSON.parse(fs.readFileSync(preActiveInventoryPath, "utf8")))
    : {
      relation_density: BASELINE.relation_density,
      person_to_work_closure_ratio: BASELINE.person_to_work_closure_ratio,
      work_to_concept_closure_ratio: BASELINE.work_to_concept_closure_ratio,
      concept_to_relation_closure_ratio: BASELINE.concept_to_relation_closure_ratio
    };
  const preInventorySummaryPath = path.join(REPORT_DIR, "r27_inventory_summary.json");
  const preSourceClosure = fs.existsSync(preInventorySummaryPath)
    ? JSON.parse(fs.readFileSync(preInventorySummaryPath, "utf8")).closure
    : preActiveClosure;
  const stageRelationLike = stage.filter((card) => card.entity_type === "relation" || ["bridge_pack", "boundary_pack"].includes(card.runtime_scope)).length;
  const activeStage = stage.filter((card) => card.approved_for_public_runtime === true && card.visibility === "public");
  const report = {
    baseline_commit: BASELINE_COMMIT,
    final_counts: counts(cards),
    generated_runtime: gen,
    stage: {
      cards: stage.length,
      by_type: countBy(stage, (card) => card.entity_type),
      by_domain: countBy(stage, (card) => card.domain),
      by_pack_id: countBy(stage, (card) => card.pack_id || "legacy_unassigned"),
      by_runtime_scope: countBy(stage, (card) => card.runtime_scope || "legacy_unassigned"),
      relation_like_count: stageRelationLike,
      relation_like_share: Number((stageRelationLike / Math.max(1, stage.length)).toFixed(3)),
      active_additions: activeStage.map((card) => ({ id: card.id, entity_type: card.entity_type, domain: card.domain, pack_id: card.pack_id, reason: (card.purpose_class || []).join(";") || "active high-transfer card" })),
      quality_failures: {
        profile_template_hits: stageProfileHits,
        long_final_answer_hits: stageLongHits,
        no_provenance: stageRows.filter((row) => row.provenance_present === "no").map((row) => row.card_id),
        no_transfer_scope: stageRows.filter((row) => row.transfer_scope_present === "no").map((row) => row.card_id),
        relation_no_licensed_verbs: stageFlags.filter((row) => row.flag === "relation_no_licensed_verbs")
      }
    },
    closure,
    pre_active_closure: preActiveClosure,
    pre_source_closure: preSourceClosure,
    source_closure: sourceClosure,
    missing_public_references: missingPublicRefs(cards),
    cards_by_domain: countBy(cards, (card) => card.domain || "unknown"),
    cards_by_pack_id: countBy(cards, (card) => card.pack_id || "legacy_unassigned"),
    cards_by_runtime_scope: countBy(cards, (card) => card.runtime_scope || "legacy_unassigned")
  };
  writeJson(path.join(REPORT_DIR, "r27_card_delta_summary.json"), { baseline: BASELINE, final_counts: report.final_counts, stage: report.stage });
  writeJson(path.join(REPORT_DIR, "r27_domain_coverage_report.json"), { cards_by_domain: report.cards_by_domain, stage_by_domain: report.stage.by_domain });
  writeJson(path.join(REPORT_DIR, "r27_pack_distribution_report.json"), { cards_by_pack_id: report.cards_by_pack_id, cards_by_runtime_scope: report.cards_by_runtime_scope });
  writeJson(path.join(REPORT_DIR, "r27_relation_density_report.json"), { source_before: preSourceClosure.relation_density, source_after: sourceClosure.relation_density, active_before_inventory: preActiveClosure.relation_density, active_after: closure.relation_density, stage_relation_like_share: report.stage.relation_like_share });
  writeJson(path.join(REPORT_DIR, "r27_closure_report.json"), { source_before: preSourceClosure, source_after: sourceClosure, active_before_inventory: preActiveClosure, active_after: closure, missing_public_references: report.missing_public_references });
  writeJson(path.join(REPORT_DIR, "r27_provenance_audit.json"), { stage_no_provenance: report.stage.quality_failures.no_provenance, active_no_provenance: inventoryRows(active).filter((row) => row.provenance_present === "no").map((row) => row.card_id) });
  writeJson(path.join(REPORT_DIR, "r27_no_answer_snippet_audit.json"), { stage_profile_template_hits: stageProfileHits, stage_long_final_answer_hits: stageLongHits, pass_for_stage_cards: stageProfileHits.length === 0 && stageLongHits.length === 0 });
  writeJson(path.join(REPORT_DIR, "r27_runtime_size_report.json"), gen);
  writeSummary(report);

  const stageFailures = report.stage.quality_failures.profile_template_hits.length
    + report.stage.quality_failures.long_final_answer_hits.length
    + report.stage.quality_failures.no_provenance.length
    + report.stage.quality_failures.no_transfer_scope.length
    + report.stage.quality_failures.relation_no_licensed_verbs.length;
  const ok = stageFailures === 0
    && report.missing_public_references.length === 0
    && gen.cards <= 1250
    && gen.size_ratio_from_pre_r24_baseline <= 2.25
    && report.final_counts.active_runtime_source_cards - BASELINE.active_source_cards <= 150;
  console.log(JSON.stringify({
    execution_ok: true,
    mode: "post",
    stage_cards: stage.length,
    stage_relation_like_share: report.stage.relation_like_share,
    source_cards: report.final_counts.total_source_cards,
    active_runtime_source_cards: report.final_counts.active_runtime_source_cards,
    generated_runtime_cards: gen.cards,
    generated_size_bytes: gen.size_bytes,
    missing_public_references: report.missing_public_references.length,
    stage_quality_failures: stageFailures,
    active_runtime_growth: report.final_counts.active_runtime_source_cards - BASELINE.active_source_cards,
    active_runtime_control_ok: ok
  }, null, 2));
  if (!ok) process.exit(2);
}

function writeSummary(report) {
  const activeReasons = report.stage.active_additions.slice(0, 80).map((row) => `- ${row.id}: ${row.reason}`).join("\n") || "- none";
  const doc = `# KB Expansion R27 Inventory-First Source Growth Summary

## Boundary

R27 is KB/data/inventory/generation work only. It does not repair routing, referent binding, R23 candidate logic, surface realization, answerIndex, tiny-router weights, eval rows, or thresholds.

## Phase A Inventory

- Full source inventory: \`artifacts/training_os/kb_expansion/r27_full_source_inventory.json\`
- Active runtime inventory: \`artifacts/training_os/kb_expansion/r27_active_runtime_inventory.json\`
- Source-only inventory: \`artifacts/training_os/kb_expansion/r27_source_only_inventory.json\`
- Gap map: \`artifacts/training_os/kb_expansion/r27_gap_map.json\`
- Human-readable docs: \`docs/kb_inventory_r27_*.md\`, \`docs/kb_gap_map_r27.md\`

## Counts

- Baseline commit: ${BASELINE_COMMIT}
- Source cards: ${BASELINE.source_cards} -> ${report.final_counts.total_source_cards}
- Active runtime source cards: ${BASELINE.active_source_cards} -> ${report.final_counts.active_runtime_source_cards}
- Source-only cards: ${report.final_counts.source_only_cards}
- Optional long-tail cards: ${report.final_counts.optional_long_tail_cards}
- Generated runtime cards: ${BASELINE.generated_runtime_cards} -> ${report.generated_runtime.cards}
- Generated artifact size: ${BASELINE.generated_size_bytes} -> ${report.generated_runtime.size_bytes} bytes
- Generated SHA256: ${report.generated_runtime.sha256}
- Generated ratio vs pre-R24 baseline: ${report.generated_runtime.size_ratio_from_pre_r24_baseline}

## R27 Added Cards

- Stage cards: ${report.stage.cards}
- Added by type: ${Object.entries(report.stage.by_type).map(([k, v]) => `${k}=${v}`).join(", ")}
- Added by pack: ${Object.entries(report.stage.by_pack_id).map(([k, v]) => `${k}=${v}`).join(", ")}
- Added by runtime scope: ${Object.entries(report.stage.by_runtime_scope).map(([k, v]) => `${k}=${v}`).join(", ")}
- Relation/contrast/boundary share: ${report.stage.relation_like_share}

## Active Additions And Reasons

${activeReasons}

## Closure

- Source-library relation density: ${report.pre_source_closure.relation_density} -> ${report.source_closure.relation_density}
- Source-library person-to-work closure: ${report.pre_source_closure.person_to_work_closure_ratio} -> ${report.source_closure.person_to_work_closure_ratio}
- Source-library work-to-concept closure: ${report.pre_source_closure.work_to_concept_closure_ratio} -> ${report.source_closure.work_to_concept_closure_ratio}
- Source-library concept-to-relation closure: ${report.pre_source_closure.concept_to_relation_closure_ratio} -> ${report.source_closure.concept_to_relation_closure_ratio}
- Active relation density: ${report.pre_active_closure.relation_density} -> ${report.closure.relation_density}
- Missing public person/work/concept references: ${report.missing_public_references.length}

## Quality

- New-card profile-template hits: ${report.stage.quality_failures.profile_template_hits.length}
- New-card long final-answer hits: ${report.stage.quality_failures.long_final_answer_hits.length}
- New-card provenance failures: ${report.stage.quality_failures.no_provenance.length}
- New-card transfer_scope failures: ${report.stage.quality_failures.no_transfer_scope.length}

## Remaining High-Priority Gaps

- Some legacy cards remain without pack metadata because R27 did not rewrite old cards.
- Some source-only long-tail packs need future sharding/lazy-load governance before active use.
- Fine-grained regional culture and contemporary domains remain intentionally source-library work, not active runtime proof.

## Non-KB Limits

- wrong_referent: routing/state/reference issue, not solved by KB expansion alone.
- wrong_operation: operation typing/planning issue, not solved by KB expansion alone.
- stale_domain_contamination: state/domain finalizer issue, not solved by KB expansion alone.
- context_lost: discourse memory issue, not solved by KB expansion alone.
- transform_without_semantic_binding: transform planning issue, not solved by KB expansion alone.
- implementation leakage: runtime finalizer/surface issue, not solved by KB expansion alone.
- generic surface realization: surface issue, not solved by KB expansion alone.
- mechanical reply: surface/evaluation issue, not solved by KB expansion alone.
- false-green diagnostics: evaluation governance issue, not solved by KB expansion alone.
- hidden review failure: hidden review was not rerun.
- R23 candidate rejection: remains rejected.

## Recommended R28 Strategy

Either continue source-library growth only after a shard/lazy-load design is implemented, or switch to a separate patch-only routing/state/surface repair for one explicit live failure family. Do not use KB audits as conversational acceptance.
`;
  writeText(path.join(ROOT, "docs", "kb_expansion_r27_inventory_first_summary.md"), doc);
}

if (MODE === "inventory") writeInventory();
else writePostReports();
