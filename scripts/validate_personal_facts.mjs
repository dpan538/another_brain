#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FACTS_FILE = resolve(ROOT, "identity_pack/approved_personal_facts.example.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/personal_facts_validation_report.json");

const REQUIRED_FIELDS = [
  "id",
  "fact_type",
  "claim",
  "direct_answer",
  "source_ids",
  "source_summary",
  "visibility",
  "approved_for_direct_answer",
  "approved_for_public_runtime",
  "sensitivity",
  "confidence",
  "time_scope",
  "literal_or_interpretive",
  "not_to_infer",
  "must_not_include",
  "answer_style",
  "eval_tags"
];

const VALID_VISIBILITY = new Set(["public", "local", "private", "forbidden", "private_review"]);
const VALID_SENSITIVITY = new Set(["low", "medium", "high"]);
const VALID_LITERALITY = new Set(["literal", "interpretive", "mixed"]);
const VALID_ANSWER_STYLE = new Set(["direct_short", "direct_with_boundary", "refuse", "clarify"]);

const PUBLIC_FORBIDDEN_PATTERNS = [
  { name: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: "phone_like", pattern: /(?<![A-Za-z0-9])(?:\+?\d[\d\s().-]{7,}\d)(?![A-Za-z0-9])/ },
  { name: "address_like", pattern: /\b\d{1,5}\s+[A-Za-z][A-Za-z\s]{2,}\s+(Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr)\b/i },
  { name: "gps_coordinates", pattern: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/ },
  { name: "local_path", pattern: /\/Users\/|\/Volumes\/|\/home\/|\b[A-Za-z]:\\/ },
  { name: "family_sensitive_claim", pattern: /\b(family trauma|private family|家庭经历|私人家庭)\b/i },
  { name: "medical_sensitive_claim", pattern: /\b(medical diagnosis|mental health diagnosis|diagnosis|病历|诊断)\b/i },
  { name: "immigration_inference", pattern: /\b(visa status|immigration plan|移民计划|签证状态)\b/i }
];

const CONTACT_TERMS = /\b(email|phone|address|contact detail|Instagram handle|邮箱|电话|住址|地址)\b/i;
const PDF_SOURCE_RE = /^src_uploaded_pdf/;

function parseArgs(argv) {
  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      console.log("Usage: node scripts/validate_personal_facts.mjs");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${item}`);
  }
}

async function loadJsonl(path) {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { row: JSON.parse(line), line: index + 1 };
      } catch (error) {
        return { error: error.message, line: index + 1 };
      }
    });
}

function arr(row, key) {
  return Array.isArray(row?.[key]) ? row[key] : [];
}

function publicRuntimeText(row) {
  return [row.claim, row.direct_answer, row.source_summary].filter(Boolean).join("\n");
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function includesBoundary(row, pattern) {
  return [...arr(row, "must_not_include"), ...arr(row, "not_to_infer")].some((item) => pattern.test(String(item)));
}

function validateRow(row, line) {
  const issues = [];
  if (!row) return issues;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) issues.push({ line, check: "missing_field", field });
  }

  if (!arr(row, "source_ids").length) issues.push({ line, check: "missing_source_ids" });
  if (!arr(row, "not_to_infer").length) issues.push({ line, check: "missing_not_to_infer" });
  if (!arr(row, "must_not_include").length) issues.push({ line, check: "missing_must_not_include" });

  if (!VALID_VISIBILITY.has(row.visibility)) issues.push({ line, check: "invalid_visibility", actual: row.visibility });
  if (!VALID_SENSITIVITY.has(row.sensitivity)) issues.push({ line, check: "invalid_sensitivity", actual: row.sensitivity });
  if (!VALID_LITERALITY.has(row.literal_or_interpretive)) issues.push({ line, check: "invalid_literal_or_interpretive", actual: row.literal_or_interpretive });
  if (!VALID_ANSWER_STYLE.has(row.answer_style)) issues.push({ line, check: "invalid_answer_style", actual: row.answer_style });
  if (typeof row.confidence !== "number" || row.confidence < 0 || row.confidence > 1) {
    issues.push({ line, check: "invalid_confidence", actual: row.confidence });
  }
  if (typeof row.approved_for_direct_answer !== "boolean") {
    issues.push({ line, check: "approved_for_direct_answer_not_boolean" });
  }
  if (typeof row.approved_for_public_runtime !== "boolean") {
    issues.push({ line, check: "approved_for_public_runtime_not_boolean" });
  }

  const sourceIds = arr(row, "source_ids");
  const isPdfDerived = sourceIds.some((id) => PDF_SOURCE_RE.test(String(id)));
  if (isPdfDerived) {
    if (!["local", "private", "private_review"].includes(row.visibility)) {
      issues.push({ line, check: "pdf_derived_visibility_must_be_local_or_private", visibility: row.visibility });
    }
    if (row.approved_for_public_runtime) {
      issues.push({ line, check: "pdf_derived_public_runtime_not_allowed_by_default" });
    }
  }

  if (row.approved_for_public_runtime) {
    const text = publicRuntimeText(row);
    for (const { name, pattern } of PUBLIC_FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) issues.push({ line, check: "public_runtime_forbidden_pattern", pattern: name });
    }
    if (CONTACT_TERMS.test(row.direct_answer || "")) {
      issues.push({ line, check: "public_direct_answer_contains_contact_detail" });
    }
  }

  if (wordCount(row.direct_answer) > 25) {
    issues.push({ line, check: "direct_answer_too_long_for_fact_card", words: wordCount(row.direct_answer) });
  }

  const creativeDerived = isPdfDerived || row.fact_type === "writing_collection";
  if (creativeDerived) {
    if (!row.literal_or_interpretive) issues.push({ line, check: "creative_card_missing_literal_or_interpretive" });
    if (!arr(row, "not_to_infer").length) issues.push({ line, check: "creative_card_missing_not_to_infer" });
    if (!includesBoundary(row, /quote|raw|copyright|source text|原文|长引文/i)) {
      issues.push({ line, check: "creative_card_missing_copyright_or_raw_quote_boundary" });
    }
  }

  if (row.approved_for_direct_answer && row.confidence < 0.75) {
    issues.push({ line, check: "approved_direct_answer_low_confidence", confidence: row.confidence });
  }

  return issues;
}

async function main() {
  parseArgs(process.argv.slice(2));
  const parsed = await loadJsonl(FACTS_FILE);
  const issues = [];
  const rows = [];
  for (const item of parsed) {
    if (item.error) {
      issues.push({ line: item.line, check: "invalid_json", detail: item.error });
      continue;
    }
    rows.push(item.row);
    issues.push(...validateRow(item.row, item.line));
  }

  const summary = {
    total_cards: rows.length,
    public_runtime_cards: rows.filter((row) => row.approved_for_public_runtime).length,
    local_only_cards: rows.filter((row) => !row.approved_for_public_runtime).length,
    pdf_derived_cards: rows.filter((row) => arr(row, "source_ids").some((id) => PDF_SOURCE_RE.test(String(id)))).length,
    issues: issues.length,
    report_path: OUT
  };

  const report = {
    ok: issues.length === 0,
    generated_at: new Date().toISOString(),
    summary,
    issues
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
