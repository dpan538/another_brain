#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeDryrun } from "./train_tokenizer_dryrun.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.r25al.json";
const QUALITY_PATH = "artifacts/training_os/corpus_review/r25al/r25al_expanded_corpus_quality.json";
const REPORT_PATH = "artifacts/training_os/tokenizer_dryrun/r25al/r25al_tokenizer_readiness_report.json";
const SUMMARY_PATH = "docs/R25AL_TOKENIZER_READINESS_SUMMARY.md";

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

async function writeText(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

function collectText(row) {
  const out = [];
  for (const message of Array.isArray(row.messages) ? row.messages : []) {
    if (typeof message?.content === "string") out.push(message.content);
  }
  for (const item of Array.isArray(row.constraints) ? row.constraints : []) out.push(String(item));
  if (typeof row.target_answer === "string") out.push(row.target_answer);
  return out.join("\n");
}

function addScore(bucket, text, tokenizer, config) {
  const ids = encodeDryrun(text, tokenizer, config);
  const unkId = tokenizer.vocab["<unk>"];
  bucket.chars += text.length;
  bucket.tokens += ids.length;
  bucket.unknown_tokens += ids.filter((id) => id === unkId).length;
}

function finishBucket(bucket) {
  return {
    chars: bucket.chars,
    tokens: bucket.tokens,
    unknown_tokens: bucket.unknown_tokens,
    unknown_rate: bucket.tokens ? bucket.unknown_tokens / bucket.tokens : 0,
    avg_chars_per_token: bucket.tokens ? bucket.chars / bucket.tokens : 0
  };
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const artifactDir = config.artifact_dir || config.output_dir || "artifacts/training_os/tokenizer_dryrun/r25al";
  const tokenizer = await readJson(`${artifactDir}/r25j_tokenizer.json`);
  const tokenizerReport = await readJson(`${artifactDir}/r25j_tokenizer_report.json`);
  const tokenizerEvalReport = await readJson(`${artifactDir}/r25j_tokenizer_eval_report.json`);
  const corpusReport = await readJson(`${artifactDir}/r25j_tokenizer_corpus_report.json`);
  const quality = await readJson(QUALITY_PATH);
  const splitBuckets = {};
  const languageBuckets = {};

  for (const source of [...(config.train_sources || []), ...(config.eval_sources || [])]) {
    for (const row of await readJsonl(source)) {
      const text = collectText(row);
      splitBuckets[row.split] ||= { chars: 0, tokens: 0, unknown_tokens: 0 };
      languageBuckets[row.language] ||= { chars: 0, tokens: 0, unknown_tokens: 0 };
      addScore(splitBuckets[row.split], text, tokenizer, config);
      addScore(languageBuckets[row.language], text, tokenizer, config);
    }
  }

  const unknownBySplit = Object.fromEntries(Object.entries(splitBuckets).map(([key, bucket]) => [key, finishBucket(bucket)]));
  const unknownByLanguage = Object.fromEntries(Object.entries(languageBuckets).map(([key, bucket]) => [key, finishBucket(bucket)]));
  const maxUnknownRate = Math.max(0, ...Object.values(unknownBySplit).map((item) => item.unknown_rate), ...Object.values(unknownByLanguage).map((item) => item.unknown_rate));
  const zhAvgCharsPerToken = unknownByLanguage.zh?.avg_chars_per_token || 0;
  const warnings = [];
  if (maxUnknownRate > 0.05) warnings.push("unknown_rate_above_review_threshold");
  if (zhAvgCharsPerToken && zhAvgCharsPerToken < 1.1) warnings.push("chinese_token_expansion_risk");
  if ((quality.chinese_first_gap?.combined_zh_share || 0) < 0.7) warnings.push("combined_corpus_below_zh_70_target");
  if (quality.boilerplate_repeated_template_risk !== "low") warnings.push("duplicate_or_template_risk_needs_review");

  let recommendation = "corpus_ready_for_future_microcycle";
  if (tokenizerEvalReport.ok !== true || corpusReport.ok !== true || tokenizerReport.ok !== true) recommendation = "blocked";
  else if (maxUnknownRate > 0.05 || warnings.includes("chinese_token_expansion_risk")) recommendation = "tokenizer_risk_review_needed";
  else if ((quality.chinese_first_gap?.combined_zh_share || 0) < 0.7) recommendation = "corpus_needs_more_chinese_rows";

  const report = {
    ok: tokenizerEvalReport.ok === true && corpusReport.ok === true && tokenizerReport.ok === true,
    phase: "R25AL",
    tokenizer_run_id: config.run_id,
    tokenizer_id: tokenizer.tokenizer_id,
    vocab_size: tokenizer.vocab_size,
    corpus_row_counts: {
      train: quality.row_counts_by_split?.train || 0,
      dev: quality.row_counts_by_split?.dev || 0,
      heldout: quality.row_counts_by_split?.heldout || 0,
      total: quality.total_rows || 0
    },
    language_distribution: quality.language_counts || {},
    unknown_token_rate_by_split: unknownBySplit,
    unknown_token_rate_by_language: unknownByLanguage,
    average_chars_per_token_by_language: Object.fromEntries(Object.entries(unknownByLanguage).map(([key, value]) => [key, value.avg_chars_per_token])),
    longest_token_summary: {
      max_token_chars: Math.max(0, ...Object.keys(tokenizer.vocab || {}).map((token) => token.length)),
      tokens_over_12_chars: Object.keys(tokenizer.vocab || {}).filter((token) => token.length > 12).length,
      examples_omitted: true
    },
    chinese_segmentation_risk: warnings.includes("chinese_token_expansion_risk") ? "review_needed" : "low",
    mixed_language_boundary_risk: (unknownByLanguage.mixed?.unknown_rate || 0) > 0.05 ? "review_needed" : "low",
    repeated_template_risk: quality.boilerplate_repeated_template_risk,
    recommendation,
    warnings,
    safety: {
      decoder_training_ran: false,
      small_pilot_training_ran: false,
      phase4_scaled_training_ran: false,
      production_tokenizer: false,
      tokenizer_artifacts_committed: false,
      weights_committed: false,
      external_api_used: false
    }
  };
  await writeJson(REPORT_PATH, report);
  const zhRate = quality.total_rows ? Math.round(((quality.language_counts?.zh || 0) / quality.total_rows) * 10000) / 100 : 0;
  const summary = `# R25AL Tokenizer Readiness Summary

R25AL ran one tokenizer dry-run readiness pass over the expanded tracked corpus. This was not decoder training, not small-pilot training, and not a production tokenizer admission.

## Tokenizer Metrics

- Run id: \`${config.run_id}\`
- Vocab size: ${tokenizer.vocab_size}
- Corpus rows: ${quality.total_rows}
- Language counts: zh ${quality.language_counts?.zh || 0}, mixed ${quality.language_counts?.mixed || 0}, en ${quality.language_counts?.en || 0}
- Combined zh share: ${zhRate}%
- Dev unknown-token rate: ${unknownBySplit.dev ? Math.round(unknownBySplit.dev.unknown_rate * 10000) / 100 : 0}%
- Heldout unknown-token rate: ${unknownBySplit.heldout ? Math.round(unknownBySplit.heldout.unknown_rate * 10000) / 100 : 0}%
- Chinese segmentation risk: ${report.chinese_segmentation_risk}
- Mixed-language boundary risk: ${report.mixed_language_boundary_risk}
- Recommendation: ${recommendation}

Tokenizer artifacts remain ignored under \`${artifactDir}/\` and are not committed. Future R25AM training still requires fresh explicit approval.
`;
  await writeText(SUMMARY_PATH, summary);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
