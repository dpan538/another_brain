import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const REPORT_PATH = path.join(ROOT, "artifacts", "training_os", "culture_card_validation_report.json");

const REQUIRED_FIELDS = [
  "id",
  "entity_type",
  "names",
  "domain",
  "factual_core",
  "short_intro",
  "themes",
  "related_entities",
  "comparison_axes",
  "entry_points",
  "conversation_moves",
  "safe_boundaries",
  "copyright_policy",
  "not_to_infer",
  "confidence",
  "visibility",
  "approved_for_public_runtime"
];

const CONVERSATION_MOVES = [
  "overview",
  "works_list",
  "representative_works",
  "entry_path",
  "explain_work",
  "compare",
  "country_relation",
  "why_it_matters",
  "quote_or_lyrics_boundary"
];

const ALLOWED_ENTITY_TYPES = new Set([
  "person",
  "work",
  "country",
  "period",
  "movement",
  "genre",
  "concept",
  "theme"
]);

const ALLOWED_VISIBILITY = new Set(["public", "local", "private", "forbidden"]);

const FORBIDDEN_PATTERNS = [
  { name: "local_path", re: /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\/ },
  { name: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: "phone_like", re: /(?:\+?\d[\s-]?){9,}/ },
  { name: "gps_like", re: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/ },
  { name: "source_framing", re: /根据你的|根据.*报告|according to your|your file|your website|source path|local file/i },
  { name: "deep_research_doc", re: /\.docx\b|Deep Research|deep research/i },
  { name: "raw_copyright_prompt", re: /完整歌词如下|全文如下|整首如下|long quote starts/i }
];

const COLLAPSE_SENTENCES = [
  "日本文学不要只读情节。先看沉默、季节、羞耻和战后断裂。",
  "你要问哪一边？",
  "你需要提问。",
  "也许发生过，不在我眼前。",
  "知道一点。城市、青春和历史，会一起压进歌里。",
  "罗大佑适合听时代怎么进入私人生活。"
];

function ensureReportDir() {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
}

function readJsonl(file) {
  const text = fs.readFileSync(file, "utf8");
  const rows = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      rows.push({ value: JSON.parse(line), line: index + 1 });
    } catch (error) {
      rows.push({ error: error.message, line: index + 1, raw: line.slice(0, 120) });
    }
  });
  return rows;
}

function asText(value) {
  return JSON.stringify(value ?? "");
}

function countNonEmptyCollections(card) {
  return ["themes", "related_entities", "comparison_axes", "entry_points"].filter((field) => {
    const value = card[field];
    return Array.isArray(value) && value.length > 0;
  }).length;
}

function hasLongQuoteLikeText(text) {
  const asciiWords = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  if (asciiWords.length >= 35 && /["“”]/.test(text)) return true;
  const quotedChinese = text.match(/[“"][^”"]{80,}[”"]/);
  return Boolean(quotedChinese);
}

function repeatedMoveCollapse(moves) {
  const values = Object.values(moves || {})
    .map((value) => String(value || "").trim())
    .filter((value) => value && !["不适用。", "不适用", "not applicable"].includes(value.toLowerCase()));
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.values()].some((count) => count >= 4);
}

function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function validateCard(card, context) {
  const errors = [];
  const warnings = [];
  const prefix = `${context.file}:${context.line}`;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in card)) errors.push(`${prefix} missing required field: ${field}`);
  }

  if (!ALLOWED_ENTITY_TYPES.has(card.entity_type)) {
    errors.push(`${prefix} invalid entity_type: ${card.entity_type}`);
  }
  if (!Array.isArray(card.names) || card.names.length === 0) {
    errors.push(`${prefix} names must be a non-empty array`);
  }
  if (!Number.isFinite(card.confidence) || card.confidence < 0 || card.confidence > 1) {
    errors.push(`${prefix} confidence must be a number between 0 and 1`);
  }
  if (!ALLOWED_VISIBILITY.has(card.visibility)) {
    errors.push(`${prefix} invalid visibility: ${card.visibility}`);
  }
  if (typeof card.approved_for_public_runtime !== "boolean") {
    errors.push(`${prefix} approved_for_public_runtime must be boolean`);
  }
  if (card.approved_for_public_runtime && card.visibility !== "public") {
    errors.push(`${prefix} public runtime card must have public visibility`);
  }

  for (const field of ["themes", "related_entities", "comparison_axes", "entry_points", "safe_boundaries", "not_to_infer"]) {
    if (!Array.isArray(card[field])) errors.push(`${prefix} ${field} must be an array`);
  }
  if (countNonEmptyCollections(card) < 2) {
    errors.push(`${prefix} card must populate at least two of themes, related_entities, comparison_axes, entry_points`);
  }

  for (const move of CONVERSATION_MOVES) {
    if (!card.conversation_moves || typeof card.conversation_moves[move] !== "string" || !card.conversation_moves[move].trim()) {
      errors.push(`${prefix} missing conversation move: ${move}`);
    }
  }
  if (repeatedMoveCollapse(card.conversation_moves)) {
    errors.push(`${prefix} repeated conversation move text suggests template collapse`);
  }

  if (card.entity_type === "work") {
    if (!Array.isArray(card.themes) || card.themes.length === 0) errors.push(`${prefix} work card must have themes`);
    const hasRelations = Array.isArray(card.related_entities) && card.related_entities.length > 0;
    const hasAxes = Array.isArray(card.comparison_axes) && card.comparison_axes.length > 0;
    if (!hasRelations && !hasAxes) errors.push(`${prefix} work card must have related_entities or comparison_axes`);
  }

  const isMethod = String(card.id || "").startsWith("method.") || String(card.domain || "").startsWith("method.") || (card.eval_tags || []).includes("method_card");
  if (isMethod) {
    if (!/method card|method abstraction|planner|回答法|方法|planner instruction/i.test(`${card.factual_core} ${card.source_summary}`)) {
      errors.push(`${prefix} method card must state that it is method guidance, not factual knowledge`);
    }
  }

  const strings = collectStrings(card);
  const serialized = strings.join("\n");
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.re.test(serialized)) errors.push(`${prefix} forbidden pattern: ${pattern.name}`);
  }
  for (const sentence of COLLAPSE_SENTENCES) {
    if (serialized.includes(sentence)) errors.push(`${prefix} known collapsed template present`);
  }
  if (strings.some(hasLongQuoteLikeText)) errors.push(`${prefix} long quote-like text detected`);
  if (/歌词[:：]/.test(serialized)) errors.push(`${prefix} lyric-like source text detected`);

  const boundaryText = `${card.copyright_policy || ""} ${(card.safe_boundaries || []).join(" ")}`;
  if (!/(No|no|不|拒绝|boundary|copyright|版权|lyrics|quoted|原文|歌词)/.test(boundaryText)) {
    warnings.push(`${prefix} copyright boundary is weak or implicit`);
  }

  return { errors, warnings };
}

function main() {
  const files = fs.existsSync(CARD_DIR)
    ? fs.readdirSync(CARD_DIR).filter((name) => name.endsWith(".jsonl")).sort()
    : [];
  const errors = [];
  const warnings = [];
  const seenIds = new Map();
  const counts = { files: files.length, cards: 0, publicRuntimeCards: 0, methodCards: 0 };

  if (files.length === 0) errors.push("No culture card files found");

  for (const fileName of files) {
    const relFile = path.join("data", "culture_cards", fileName);
    const fullFile = path.join(CARD_DIR, fileName);
    for (const row of readJsonl(fullFile)) {
      if (row.error) {
        errors.push(`${relFile}:${row.line} invalid JSON: ${row.error}`);
        continue;
      }
      const card = row.value;
      counts.cards += 1;
      if (card.approved_for_public_runtime) counts.publicRuntimeCards += 1;
      if (String(card.id || "").startsWith("method.") || String(card.domain || "").startsWith("method.")) counts.methodCards += 1;
      if (seenIds.has(card.id)) {
        errors.push(`${relFile}:${row.line} duplicate id also seen at ${seenIds.get(card.id)}`);
      } else {
        seenIds.set(card.id, `${relFile}:${row.line}`);
      }
      const result = validateCard(card, { file: relFile, line: row.line });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }

  const report = {
    ok: errors.length === 0,
    counts,
    errors,
    warnings
  };
  ensureReportDir();
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log("culture card validation summary");
  console.log(`files: ${counts.files}`);
  console.log(`cards: ${counts.cards}`);
  console.log(`public runtime cards: ${counts.publicRuntimeCards}`);
  console.log(`method cards: ${counts.methodCards}`);
  console.log(`errors: ${errors.length}`);
  console.log(`warnings: ${warnings.length}`);
  console.log(`report: ${path.relative(ROOT, REPORT_PATH)}`);

  if (errors.length > 0) {
    for (const error of errors.slice(0, 20)) console.error(`- ${error}`);
    if (errors.length > 20) console.error(`... ${errors.length - 20} more errors`);
    process.exit(2);
  }
}

main();
