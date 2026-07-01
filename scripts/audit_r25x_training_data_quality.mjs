#!/usr/bin/env node
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/r25x_data_quality_audit_config.json";
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25x/r25x_data_quality_audit.json";
const FORBIDDEN_KEYS = new Set([
  "chain_of_thought",
  "hidden_prompt",
  "system_prompt",
  "raw_private_data",
  "private_memory",
  "secret",
  "api_key",
  "local_user_path"
]);
const SECRET_RE = /(?:BEGIN PRIVATE KEY|api[_-]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|token\s*[:=]|\/Users\/[^/\s]+|[A-Za-z]:\\Users\\)/i;
const LOCAL_PATH_RE = /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\)/;
const EVAL_EXTENSIONS = new Set([".json", ".jsonl", ".txt", ".md"]);

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readJsonl(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/r25l_[a-z0-9_]+_(?:train|dev|heldout)_\d+/g, "sample_id")
    .replace(/\b(?:train|dev|heldout)\/\d{3}\b/g, "split_marker")
    .replace(/\d+/g, "0")
    .replace(/\s+/g, " ")
    .trim();
}

function strictNormalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function fullRowText(row) {
  return [
    row.user_goal,
    ...(row.messages || []).map((message) => `${message.role || ""}: ${message.content || ""}`),
    ...(row.constraints || []),
    ...(row.retrieved_evidence || []).map((evidence) => evidence.text || ""),
    row.target_answer,
    ...(row.rejected_answers || []),
    ...(row.expected_behavior || []),
    ...(row.forbidden_behavior || [])
  ].filter(Boolean).join("\n");
}

function targetPattern(row) {
  return normalizeText(row.target_answer)
    .replace(/\b(?:short_direct|boundary_first|reviewer_note)\b/g, "style")
    .replace(/\b(?:draft_answer|verify_draft|repair_draft|route_plan|retrieval_grounded_answer|constraint_preservation|no_backend_policy|tokenizer_sensitive_prompt|toy_training_boundary|release_packaging_boundary)\b/g, "task_type");
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = typeof key === "function" ? key(row) : row[key];
    const normalized = String(value || "unknown");
    out[normalized] = (out[normalized] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function policyTagCounts(rows) {
  const counts = {};
  for (const row of rows) {
    for (const tag of row.policy_tags || []) counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function rejectedCoverage(rows) {
  const withRejected = rows.filter((row) => Array.isArray(row.rejected_answers) && row.rejected_answers.length > 0).length;
  return {
    rows_with_rejected_answers: withRejected,
    total_rows: rows.length,
    ratio: rows.length ? withRejected / rows.length : 0
  };
}

function averageTargetChars(rows) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + String(row.target_answer || "").length, 0) / rows.length;
}

function shortTargetBias(rows) {
  const shortRows = rows.filter((row) => String(row.target_answer || "").length < 120);
  return {
    short_target_rows: shortRows.length,
    ratio: rows.length ? shortRows.length / rows.length : 0,
    sample_ids: shortRows.slice(0, 20).map((row) => row.sample_id)
  };
}

function duplicateTargets(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = normalizeText(row.target_answer);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.sample_id);
  }
  const duplicates = [...map.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([target, ids]) => ({ normalized_target_preview: target.slice(0, 160), count: ids.length, sample_ids: ids.slice(0, 20) }))
    .sort((a, b) => b.count - a.count);
  return {
    duplicate_group_count: duplicates.length,
    max_duplicate_count: duplicates[0]?.count || 0,
    top_duplicate_groups: duplicates.slice(0, 10)
  };
}

function nearDuplicatePatterns(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = targetPattern(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.sample_id);
  }
  const groups = [...map.entries()]
    .filter(([, ids]) => ids.length > 12)
    .map(([pattern, ids]) => ({ normalized_pattern_preview: pattern.slice(0, 180), count: ids.length, sample_ids: ids.slice(0, 20) }))
    .sort((a, b) => b.count - a.count);
  return {
    high_repetition_pattern_count: groups.length,
    max_pattern_count: groups[0]?.count || 0,
    top_repetition_patterns: groups.slice(0, 12)
  };
}

function boilerplateFrequency(rows) {
  const phrases = [
    "preserve no-backend",
    "no-private-data",
    "from-scratch boundaries",
    "report uncertainty instead of inventing",
    "formal decoder training remains disabled",
    "ignored planning artifacts"
  ];
  const counts = {};
  for (const phrase of phrases) counts[phrase] = 0;
  for (const row of rows) {
    const text = normalizeText(fullRowText(row));
    for (const phrase of phrases) {
      if (text.includes(phrase)) counts[phrase] += 1;
    }
  }
  return counts;
}

function collectForbiddenKeyPaths(value, path = []) {
  const hits = [];
  if (!value || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...collectForbiddenKeyPaths(item, [...path, String(index)])));
    return hits;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (FORBIDDEN_KEYS.has(key)) hits.push(nextPath.join("."));
    hits.push(...collectForbiddenKeyPaths(nested, nextPath));
  }
  return hits;
}

async function readEvalSnippets() {
  const snippets = [];
  async function walk(relativeDir) {
    const abs = resolve(ROOT, relativeDir);
    if (!(await exists(relativeDir))) return;
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      const rel = join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await walk(rel);
      } else if (EVAL_EXTENSIONS.has(extname(entry.name))) {
        const text = await readFile(resolve(ROOT, rel), "utf8").catch(() => "");
        for (const line of text.split(/\r?\n/)) {
          const normalized = normalizeText(line);
          if (normalized.length >= 80) snippets.push({ source: rel, text: normalized.slice(0, 400) });
        }
      }
    }
  }
  await walk("evals");
  return snippets.slice(0, 2000);
}

function splitOverlap(splitRows) {
  const rowTextBySplit = {};
  const sampleIdsBySplit = {};
  for (const [split, rows] of Object.entries(splitRows)) {
    rowTextBySplit[split] = new Map(rows.map((row) => [strictNormalizeText(fullRowText(row)), row.sample_id]));
    sampleIdsBySplit[split] = new Set(rows.map((row) => row.sample_id));
  }
  const pairs = [["train", "dev"], ["train", "heldout"], ["dev", "heldout"]];
  const overlaps = {};
  for (const [a, b] of pairs) {
    const idOverlap = [...sampleIdsBySplit[a]].filter((id) => sampleIdsBySplit[b].has(id));
    const textOverlap = [];
    for (const [text, id] of rowTextBySplit[a]) {
      if (rowTextBySplit[b].has(text)) textOverlap.push({ [a]: id, [b]: rowTextBySplit[b].get(text), preview: text.slice(0, 160) });
    }
    overlaps[`${a}_${b}`] = {
      sample_id_overlap_count: idOverlap.length,
      exact_text_overlap_count: textOverlap.length,
      sample_id_overlaps: idOverlap.slice(0, 20),
      exact_text_overlaps: textOverlap.slice(0, 20)
    };
  }
  return overlaps;
}

function evalPromptCopying(rows, snippets) {
  const hits = [];
  if (!snippets.length) return hits;
  for (const row of rows) {
    const target = normalizeText(row.target_answer);
    const messages = normalizeText((row.messages || []).map((message) => message.content || "").join("\n"));
    for (const snippet of snippets) {
      if (snippet.text.length < 80) continue;
      if (target.includes(snippet.text) || messages.includes(snippet.text)) {
        hits.push({ sample_id: row.sample_id, eval_source: snippet.source, snippet: snippet.text.slice(0, 180) });
        if (hits.length >= 20) return hits;
      }
    }
  }
  return hits;
}

function focusBucketCounts(rows, focusBuckets) {
  const counts = {};
  for (const bucket of focusBuckets) counts[bucket] = 0;
  for (const row of rows) {
    const rowBuckets = new Set([row.language, row.task_type, row.task_family, ...(row.policy_tags || [])].map(String));
    for (const bucket of focusBuckets) {
      if (rowBuckets.has(bucket)) counts[bucket] += 1;
    }
  }
  return counts;
}

function hardViolations(rows, splitOverlaps, evalHits) {
  const failures = [];
  for (const [splitPair, overlap] of Object.entries(splitOverlaps)) {
    if (overlap.sample_id_overlap_count || overlap.exact_text_overlap_count) {
      failures.push({ code: "train_dev_heldout_overlap", split_pair: splitPair, overlap });
    }
  }
  if (evalHits.length) failures.push({ code: "eval_prompt_copying", hits: evalHits });
  for (const row of rows) {
    const forbiddenKeys = collectForbiddenKeyPaths(row);
    if (forbiddenKeys.length) failures.push({ code: "forbidden_key_present", sample_id: row.sample_id, paths: forbiddenKeys });
    const text = JSON.stringify(row);
    if (LOCAL_PATH_RE.test(text)) failures.push({ code: "local_private_path_marker", sample_id: row.sample_id });
    if (SECRET_RE.test(text)) failures.push({ code: "secret_like_marker", sample_id: row.sample_id });
    if (row.contains_private_data !== false) failures.push({ code: "contains_private_data_not_false", sample_id: row.sample_id });
    if (row.provenance?.contains_private_data !== false) failures.push({ code: "provenance_contains_private_data_not_false", sample_id: row.sample_id });
  }
  return failures;
}

function softWarnings(allRows, duplicates, nearDuplicates, rejected, shortBias, focusCounts) {
  const warnings = [];
  if (duplicates.max_duplicate_count > 1) warnings.push({ code: "duplicate_target_answer", max_duplicate_count: duplicates.max_duplicate_count });
  if (nearDuplicates.max_pattern_count > 30) warnings.push({ code: "high_template_repetition", max_pattern_count: nearDuplicates.max_pattern_count });
  if (rejected.ratio < 0.95) warnings.push({ code: "weak_rejected_answer_coverage", ratio: rejected.ratio });
  if (shortBias.ratio > 0.1) warnings.push({ code: "short_target_bias", ratio: shortBias.ratio });
  for (const [bucket, count] of Object.entries(focusCounts)) {
    if (count === 0) warnings.push({ code: "focus_bucket_missing", bucket });
  }
  if (!allRows.length) warnings.push({ code: "no_rows_loaded" });
  return warnings;
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const splitRows = {
    train: await readJsonl(config.train_source),
    dev: await readJsonl(config.dev_source),
    heldout: await readJsonl(config.heldout_source)
  };
  const allRows = [...splitRows.train, ...splitRows.dev, ...splitRows.heldout];
  const evalSnippets = await readEvalSnippets();
  const overlaps = splitOverlap(splitRows);
  const evalHits = evalPromptCopying(allRows, evalSnippets);
  const duplicateSummary = duplicateTargets(allRows);
  const nearDuplicateSummary = nearDuplicatePatterns(allRows);
  const rejectedSummary = rejectedCoverage(allRows);
  const shortBias = shortTargetBias(allRows);
  const focusCounts = focusBucketCounts(allRows, config.focus_buckets || []);
  const failures = hardViolations(allRows, overlaps, evalHits);
  const warnings = softWarnings(allRows, duplicateSummary, nearDuplicateSummary, rejectedSummary, shortBias, focusCounts);

  const report = {
    ok: failures.length === 0,
    training_ran: false,
    product_model: false,
    phase4_scaled_training_approved: false,
    config_path: CONFIG_PATH,
    split_counts: {
      train: splitRows.train.length,
      dev: splitRows.dev.length,
      heldout: splitRows.heldout.length,
      total: allRows.length
    },
    language_distribution: countBy(allRows, "language"),
    task_type_distribution: countBy(allRows, "task_type"),
    family_distribution: countBy(allRows, "task_family"),
    policy_tag_coverage: policyTagCounts(allRows),
    rejected_answer_coverage: rejectedSummary,
    average_target_chars: averageTargetChars(allRows),
    duplicate_target_answers: duplicateSummary,
    template_near_duplicates: nearDuplicateSummary,
    boilerplate_frequency: boilerplateFrequency(allRows),
    train_dev_heldout_overlap: overlaps,
    focus_bucket_counts: focusCounts,
    eval_prompt_similarity: {
      eval_snippets_compared: evalSnippets.length,
      exact_copy_hits: evalHits
    },
    short_target_bias: shortBias,
    failures,
    warnings,
    notes: [
      "R25X data-quality audit is read-only and does not train.",
      "Hard failures are limited to split overlap, eval copying, private/secret markers, and hidden prompt or chain-of-thought fields.",
      "Template repetition and target repetition are warnings for future data regularization design."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
