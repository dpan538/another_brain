#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "artifacts/training_os/repo_text_discovery/r25ag");
const REPORT_PATH = path.join(REPORT_DIR, "existing_answer_like_text_audit.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AG_EXISTING_ANSWER_LIKE_TEXT_SUMMARY.md");

const ANSWER_FIELDS = [
  "target_answer",
  "answer",
  "answers",
  "expected_answer",
  "rejected_answers",
  "expected_behavior",
  "expected_behaviors",
  "constraints",
  "scoring_rubric",
  "messages",
  "turns"
];
const SIGNAL_PATTERNS = {
  project_continuation: /project_continuation|continuation|phase|gate|R25|R24|项目|继续|延续/i,
  repair_after_weak_answer: /repair_after_weak_answer|repair|rejected|corrected|修复|改正|弱回答/i,
  local_first_static_browser_reasoning: /local_first_static_browser_reasoning|local-first|static browser|browser-static|same-origin|本地|静态浏览器/i,
  style_preference: /style_preference|style|preference|tone|风格|偏好|语气/i,
  tool_status_honesty: /tool_status_honesty|tool status|honest tool|runtime status|工具|状态|诚实/i,
  bounded_judgment: /bounded_judgment|bounded judgment|constraint|边界|判断|约束/i
};

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function repoPath(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error(`Refusing to leave repo root: ${relativePath}`);
  }
  return resolved;
}

function walkFiles(relativeDir, predicate = () => true) {
  const start = repoPath(relativeDir);
  if (!fs.existsSync(start)) return [];
  const out = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (!full.startsWith(ROOT + path.sep)) continue;
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (entry.isFile()) {
        const relative = rel(full);
        if (predicate(relative)) out.push(relative);
      }
    }
  }
  return out.sort();
}

function jsonlRows(relativePath) {
  const text = fs.readFileSync(repoPath(relativePath), "utf8");
  const rows = [];
  let lineNo = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNo += 1;
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      rows.push({ __parse_error: error.message, __line: lineNo });
    }
  }
  return rows;
}

function jsonRows(relativePath) {
  const parsed = JSON.parse(fs.readFileSync(repoPath(relativePath), "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.cards)) return parsed.cards;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [parsed];
}

function rowsFor(relativePath) {
  if (relativePath.endsWith(".jsonl")) return jsonlRows(relativePath);
  if (relativePath.endsWith(".json")) return jsonRows(relativePath);
  return [];
}

function textFrom(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFrom).join("\n");
  if (typeof value === "object") return Object.values(value).map(textFrom).join("\n");
  return String(value);
}

function languageOf(text) {
  const zh = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (zh === 0 && latin === 0) return "unknown";
  if (zh > 0 && latin > 0) return "mixed";
  if (zh > 0) return "zh";
  return "en";
}

function inc(map, key, by = 1) {
  map[key] = (map[key] || 0) + by;
}

function sourceBucket(relativePath) {
  if (relativePath.startsWith("training/llm_corpus/r25l_train")) return "training_corpus_train";
  if (relativePath.startsWith("training/llm_corpus/r25l_dev")) return "training_corpus_dev";
  if (relativePath.startsWith("training/llm_corpus/r25l_heldout")) return "training_corpus_heldout";
  if (relativePath.startsWith("training/llm_corpus/")) return "training_corpus_other";
  if (relativePath.startsWith("training/long_horizon/")) return "long_horizon";
  if (relativePath.startsWith("identity_pack/")) return "identity_pack";
  if (relativePath.startsWith("knowledge_sources/")) return "knowledge_sources";
  if (relativePath.startsWith("evals/")) return "eval_only";
  return "other";
}

function provenanceOf(row, relativePath) {
  const text = `${textFrom(row.provenance)} ${textFrom(row.source_type)} ${textFrom(row.generator)} ${relativePath}`.toLowerCase();
  if (/template/.test(text)) return "template_generated";
  if (/human_seed/.test(text)) return "human_seed";
  if (/repo_derived|project[-_ ]authored|project_authored/.test(text)) return /project[-_ ]authored|project_authored/.test(text) ? "project_authored" : "repo_derived";
  if (/eval/.test(text) || relativePath.startsWith("evals/")) return "eval_fixture";
  return "unknown";
}

function lengthBucket(length) {
  if (length === 0) return "0";
  if (length <= 80) return "1_80";
  if (length <= 240) return "81_240";
  if (length <= 800) return "241_800";
  return "over_800";
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function auditRows(relativePath, rows, totals, duplicates) {
  const bucket = sourceBucket(relativePath);
  inc(totals.rows_by_source, bucket, rows.length);
  inc(totals.rows_by_file, relativePath, rows.length);
  if (bucket === "long_horizon") totals.long_horizon_row_count += rows.length;
  if (bucket === "identity_pack") totals.identity_pack_row_count += rows.length;
  if (bucket === "knowledge_sources") totals.knowledge_sources_row_count += rows.length;
  if (bucket === "eval_only") totals.eval_only_row_count += rows.length;

  for (const row of rows) {
    const rowText = textFrom(row);
    const declaredLanguage = typeof row.language === "string" && /^(zh|mixed|en)$/.test(row.language) ? row.language : null;
    const lang = declaredLanguage || languageOf(rowText);
    inc(totals.language_counts_all_sources, lang);
    if (bucket.startsWith("training_corpus")) inc(totals.language_counts_training_corpus, lang);

    const provenance = provenanceOf(row, relativePath);
    inc(totals.provenance_counts, provenance);
    inc(totals.review_status_counts, row.review_status || "unknown");
    inc(totals.private_data_flag_counts, row.contains_private_data === true ? "true" : row.contains_private_data === false ? "false" : "unknown");

    for (const field of ANSWER_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(row, field)) {
        inc(totals.answer_like_field_counts, field);
        totals.total_answer_like_fields += 1;
      }
    }
    if (row.target_answer) {
      totals.target_answer_rows += 1;
      const target = textFrom(row.target_answer);
      inc(totals.answer_like_text_length_distribution, lengthBucket(target.length));
      const digest = hashText(target);
      duplicates.set(digest, (duplicates.get(digest) || 0) + 1);
    }
    if (Array.isArray(row.rejected_answers)) {
      totals.rejected_answers_rows += 1;
      totals.rejected_answers_total_items += row.rejected_answers.length;
    }
    if (row.messages) totals.messages_rows += 1;
    if (row.expected_behavior || row.expected_behaviors) totals.expected_behavior_rows += 1;
    if (row.scoring_rubric) totals.scoring_rubric_rows += 1;

    const signalText = `${rowText} ${textFrom(row.personal_color_targets)} ${textFrom(row.tags)}`;
    for (const [signal, pattern] of Object.entries(SIGNAL_PATTERNS)) {
      if (pattern.test(signalText)) inc(totals.personal_color_signal_counts, signal);
    }
  }
}

function markdownSummary(report) {
  const lines = [];
  lines.push("# R25AG Existing Answer-Like Text Summary");
  lines.push("");
  lines.push("R25AG counted answer-like and dialogue-like material already present in tracked repo surfaces. This audit is aggregate-only: it did not generate corpus rows, modify `training/llm_corpus`, train, or copy raw private text.");
  lines.push("");
  lines.push("## Row Counts");
  lines.push("");
  for (const [source, count] of Object.entries(report.summary.rows_by_source)) {
    lines.push(`- ${source}: ${count}`);
  }
  lines.push("");
  lines.push("## Answer-Like Counts");
  lines.push("");
  lines.push(`- Total answer-like fields: ${report.summary.total_answer_like_fields}`);
  lines.push(`- target_answer rows: ${report.summary.target_answer_rows}`);
  lines.push(`- rejected_answers rows: ${report.summary.rejected_answers_rows}`);
  lines.push(`- rejected_answers total items: ${report.summary.rejected_answers_total_items}`);
  lines.push(`- messages rows: ${report.summary.messages_rows}`);
  lines.push(`- expected_behavior rows: ${report.summary.expected_behavior_rows}`);
  lines.push(`- scoring_rubric rows: ${report.summary.scoring_rubric_rows}`);
  lines.push("");
  lines.push("## Training Corpus Language Mix");
  lines.push("");
  for (const [lang, count] of Object.entries(report.summary.language_counts_training_corpus)) {
    lines.push(`- ${lang}: ${count}`);
  }
  lines.push("");
  lines.push("## Personal-Color Signals");
  lines.push("");
  for (const [signal, count] of Object.entries(report.summary.personal_color_signal_counts)) {
    lines.push(`- ${signal}: ${count}`);
  }
  lines.push("");
  lines.push("## Duplicate/Boilerplate Risk");
  lines.push("");
  lines.push(`- Duplicate target-answer groups: ${report.summary.duplicate_template_findings.duplicate_target_answer_groups}`);
  lines.push(`- Repeated target-answer rows: ${report.summary.duplicate_template_findings.repeated_target_answer_rows}`);
  lines.push("");
  lines.push("Detailed row-level metadata is written only to ignored artifacts.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const jsonlInputs = [
  ...walkFiles("training/llm_corpus", (p) => p.endsWith(".jsonl")),
  ...walkFiles("training/long_horizon", (p) => p.endsWith(".jsonl")),
  ...walkFiles("identity_pack", (p) => p.endsWith(".jsonl") || p.endsWith(".json")),
  ...walkFiles("knowledge_sources", (p) => p.endsWith(".jsonl") || p.endsWith(".json")),
  ...walkFiles("evals", (p) => p.endsWith(".jsonl") || p.endsWith(".json"))
];
const docInputs = walkFiles("docs", (p) => p.endsWith(".md"));

const totals = {
  rows_by_source: {},
  rows_by_file: {},
  total_answer_like_fields: 0,
  answer_like_field_counts: {},
  target_answer_rows: 0,
  messages_rows: 0,
  rejected_answers_rows: 0,
  rejected_answers_total_items: 0,
  expected_behavior_rows: 0,
  scoring_rubric_rows: 0,
  long_horizon_row_count: 0,
  identity_pack_row_count: 0,
  knowledge_sources_row_count: 0,
  eval_only_row_count: 0,
  language_counts_all_sources: {},
  language_counts_training_corpus: {},
  personal_color_signal_counts: Object.fromEntries(Object.keys(SIGNAL_PATTERNS).map((k) => [k, 0])),
  provenance_counts: {},
  review_status_counts: {},
  private_data_flag_counts: {},
  answer_like_text_length_distribution: {}
};
const duplicates = new Map();

for (const relativePath of jsonlInputs) {
  const rows = rowsFor(relativePath);
  auditRows(relativePath, rows, totals, duplicates);
}

const docAggregate = {
  docs_file_count: docInputs.length,
  docs_total_lines: 0,
  docs_language_signal_counts: {},
  docs_keyword_signal_counts: Object.fromEntries(Object.keys(SIGNAL_PATTERNS).map((k) => [k, 0]))
};
for (const relativePath of docInputs) {
  const text = fs.readFileSync(repoPath(relativePath), "utf8");
  docAggregate.docs_total_lines += text.length ? text.split(/\r?\n/).length : 0;
  inc(docAggregate.docs_language_signal_counts, languageOf(text));
  for (const [signal, pattern] of Object.entries(SIGNAL_PATTERNS)) {
    if (pattern.test(text)) inc(docAggregate.docs_keyword_signal_counts, signal);
  }
}

const duplicateGroups = [...duplicates.values()].filter((count) => count > 1);
const report = {
  report_id: "r25ag_existing_answer_like_text_audit",
  ok: true,
  generated_at: new Date().toISOString(),
  safety: {
    training_ran: false,
    corpus_rows_generated: false,
    training_llm_corpus_modified: false,
    raw_private_text_copied: false,
    eval_text_used_for_training: false
  },
  inputs: {
    json_or_jsonl_files: jsonlInputs.length,
    docs_md_files_aggregate_only: docInputs.length
  },
  summary: {
    ...totals,
    duplicate_template_findings: {
      duplicate_target_answer_groups: duplicateGroups.length,
      repeated_target_answer_rows: duplicateGroups.reduce((sum, count) => sum + count, 0)
    },
    docs_aggregate: docAggregate
  }
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(SUMMARY_PATH, markdownSummary(report));
console.log(JSON.stringify({
  ok: true,
  report: rel(REPORT_PATH),
  summary: rel(SUMMARY_PATH),
  total_answer_like_fields: report.summary.total_answer_like_fields,
  target_answer_rows: report.summary.target_answer_rows,
  language_counts_training_corpus: report.summary.language_counts_training_corpus
}, null, 2));
