#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ACTIVE_CORPUS_FILES, readJson, readJsonlRows, writeJson, writeText } from "./r26a_project_utils.mjs";
import { encodeDryrun } from "./train_tokenizer_dryrun.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.r26h.json";
const READINESS_PATH = "artifacts/training_os/user_answer_readiness/r26h/r26h_user_answer_corpus_readiness.json";
const REPORT_PATH = "artifacts/training_os/tokenizer_dryrun/r26h/r26h_tokenizer_readiness_report.json";
const SUMMARY_PATH = "docs/R26H_TOKENIZER_READINESS.md";

function isUserAnswered(row) {
  return row?.provenance?.source_type === "user_answered" || /^r26[eg]_/.test(String(row?.sample_id || ""));
}

function collectText(row) {
  return [
    ...(Array.isArray(row.messages) ? row.messages.map((msg) => msg.content) : []),
    row.target_answer
  ].filter(Boolean).join("\n");
}

function emptyBucket() {
  return { chars: 0, tokens: 0, unknown_tokens: 0 };
}

function addScore(bucket, text, tokenizer, config) {
  const ids = encodeDryrun(text, tokenizer, config);
  const unk = tokenizer.vocab["<unk>"];
  bucket.chars += text.length;
  bucket.tokens += ids.length;
  bucket.unknown_tokens += ids.filter((id) => id === unk).length;
}

function finish(bucket) {
  return {
    chars: bucket.chars,
    tokens: bucket.tokens,
    unknown_tokens: bucket.unknown_tokens,
    unknown_rate: bucket.tokens ? bucket.unknown_tokens / bucket.tokens : 0,
    avg_chars_per_token: bucket.tokens ? bucket.chars / bucket.tokens : 0
  };
}

function pct(value) {
  return `${Math.round(value * 10000) / 100}%`;
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const artifactDir = (config.artifact_dir || config.output_dir || "").replace(/\/+$/, "");
  const tokenizer = await readJson(`${artifactDir}/r25j_tokenizer.json`);
  const tokenizerReport = await readJson(`${artifactDir}/r25j_tokenizer_report.json`);
  const evalReport = await readJson(`${artifactDir}/r25j_tokenizer_eval_report.json`);
  const corpusReport = await readJson(`${artifactDir}/r25j_tokenizer_corpus_report.json`);
  const readiness = await readJson(READINESS_PATH);
  const splitBuckets = {};
  const languageBuckets = {};
  const userBucket = emptyBucket();

  for (const file of ACTIVE_CORPUS_FILES) {
    for (const { row } of await readJsonlRows(file)) {
      const text = collectText(row);
      splitBuckets[row.split] ||= emptyBucket();
      languageBuckets[row.language || "unknown"] ||= emptyBucket();
      addScore(splitBuckets[row.split], text, tokenizer, config);
      addScore(languageBuckets[row.language || "unknown"], text, tokenizer, config);
      if (isUserAnswered(row)) addScore(userBucket, text, tokenizer, config);
    }
  }
  const bySplit = Object.fromEntries(Object.entries(splitBuckets).map(([key, bucket]) => [key, finish(bucket)]));
  const byLanguage = Object.fromEntries(Object.entries(languageBuckets).map(([key, bucket]) => [key, finish(bucket)]));
  const userAnswered = finish(userBucket);
  const maxUnknown = Math.max(0, ...Object.values(bySplit).map((x) => x.unknown_rate), ...Object.values(byLanguage).map((x) => x.unknown_rate), userAnswered.unknown_rate);
  const warnings = [];
  if (maxUnknown > 0.05) warnings.push("unknown_rate_above_review_threshold");
  if ((byLanguage.zh?.avg_chars_per_token || 0) < 1.1) warnings.push("zh_token_expansion_review_needed");
  if ((userAnswered.avg_chars_per_token || 0) < 1.1) warnings.push("answer_as_user_token_expansion_review_needed");
  const recommendation = tokenizerReport.ok !== true || evalReport.ok !== true || corpusReport.ok !== true || readiness.ok !== true
    ? "blocked"
    : warnings.length
      ? "tokenizer_risk_review_needed"
      : "tokenizer_ready_for_r26i";
  const report = {
    ok: recommendation !== "blocked",
    phase: "R26H",
    tokenizer_run_id: config.run_id,
    tokenizer_id: tokenizer.tokenizer_id,
    vocab_size: tokenizer.vocab_size,
    unknown_token_rate_by_split: bySplit,
    unknown_token_rate_for_user_answered: userAnswered.unknown_rate,
    user_answered_score: userAnswered,
    avg_chars_per_token_by_language: Object.fromEntries(Object.entries(byLanguage).map(([key, value]) => [key, value.avg_chars_per_token])),
    unknown_token_rate_by_language: byLanguage,
    segmentation_risk: warnings.includes("zh_token_expansion_review_needed") ? "review_needed" : "low",
    answer_as_user_tokenization_risk: warnings.includes("answer_as_user_token_expansion_review_needed") ? "review_needed" : "low",
    weird_question_abstraction_risk: userAnswered.unknown_rate > 0.05 ? "review_needed" : "low",
    recommendation,
    warnings,
    safety: {
      decoder_training_ran: false,
      small_pilot_training_ran: false,
      phase4_scaled_training_ran: false,
      product_tokenizer: false,
      tokenizer_artifacts_committed: false
    }
  };
  await writeJson(REPORT_PATH, report);
  await writeText(SUMMARY_PATH, `# R26H Tokenizer Readiness

R26H ran one tokenizer dry-run/readiness pass over the current reviewed corpus. This is not decoder training, not small-pilot training, not product tokenizer admission, and not phase_4.

## Result

- Run id: \`${config.run_id}\`
- Vocab size: ${tokenizer.vocab_size}
- Dev unknown-token rate: ${pct(bySplit.dev?.unknown_rate || 0)}
- Heldout unknown-token rate: ${pct(bySplit.heldout?.unknown_rate || 0)}
- User-answer unknown-token rate: ${pct(userAnswered.unknown_rate)}
- User-answer avg chars/token: ${Math.round(userAnswered.avg_chars_per_token * 100) / 100}
- Segmentation risk: ${report.segmentation_risk}
- Answer-as-user tokenization risk: ${report.answer_as_user_tokenization_risk}
- Weird-question abstraction risk: ${report.weird_question_abstraction_risk}
- Recommendation: ${recommendation}

Tokenizer artifacts remain ignored under \`${artifactDir}/\` and are not committed. R26I requires fresh approval.
`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
