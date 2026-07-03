#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const DEFAULT_CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.json";
const PRIVATE_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const FORBIDDEN_MARKER_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|api_key|BEGIN PRIVATE KEY/i;

function configPathFromArgs() {
  const index = process.argv.indexOf("--config");
  return index >= 0 ? process.argv[index + 1] || DEFAULT_CONFIG_PATH : DEFAULT_CONFIG_PATH;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readText(path) {
  return readFile(resolve(ROOT, path), "utf8");
}

async function gitLsFiles(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function isIgnored(path) {
  const result = await execFileAsync("git", ["check-ignore", path], { cwd: ROOT }).catch(() => null);
  return Boolean(result?.stdout?.trim());
}

function sameList(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const failures = [];
  const configPath = configPathFromArgs();
  const config = await readJson(configPath);
  const artifactDir = config.artifact_dir || "artifacts/training_os/tokenizer_dryrun";
  const tokenizerPath = `${artifactDir}/r25j_tokenizer.json`;
  const tokenizerReportPath = `${artifactDir}/r25j_tokenizer_report.json`;
  const corpusReportPath = `${artifactDir}/r25j_tokenizer_corpus_report.json`;
  const evalReportPath = `${artifactDir}/r25j_tokenizer_eval_report.json`;
  const tokenizer = await readJson(tokenizerPath).catch(() => null);
  const tokenizerReport = await readJson(tokenizerReportPath).catch(() => null);
  const corpusReport = await readJson(corpusReportPath).catch(() => null);
  const evalReport = await readJson(evalReportPath).catch(() => null);

  if (!tokenizer) failures.push({ code: "tokenizer_artifact_missing", path: tokenizerPath });
  if (!tokenizerReport) failures.push({ code: "tokenizer_report_missing", path: tokenizerReportPath });
  if (!corpusReport) failures.push({ code: "tokenizer_corpus_report_missing", path: corpusReportPath });
  if (!evalReport) failures.push({ code: "tokenizer_eval_report_missing", path: evalReportPath });

  if (tokenizer) {
    if (tokenizer.tokenizer_id !== config.tokenizer_id) failures.push({ code: "tokenizer_id_mismatch" });
    if (tokenizer.vocab_size > config.selected_dryrun_vocab_size + config.special_tokens.length) failures.push({ code: "vocab_size_exceeds_target" });
    for (const token of config.special_tokens || []) {
      if (!(token in (tokenizer.vocab || {}))) failures.push({ code: "missing_special_token", token });
    }
    if (!sameList(tokenizer.training_sources_used || [], config.train_sources || [])) {
      failures.push({ code: "unexpected_training_source_used", sources: tokenizer.training_sources_used });
    }
    if (!sameList(tokenizer.eval_sources_not_used_for_training || [], config.eval_sources || [])) {
      failures.push({ code: "unexpected_eval_sources_recorded", sources: tokenizer.eval_sources_not_used_for_training });
    }
  }

  for (const [path, parsed] of [
    [tokenizerPath, tokenizer],
    [tokenizerReportPath, tokenizerReport],
    [evalReportPath, evalReport]
  ]) {
    if (!parsed) continue;
    const text = await readText(path).catch(() => "");
    if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "private_path_in_tokenizer_history_artifact", path });
    if (FORBIDDEN_MARKER_RE.test(text)) failures.push({ code: "forbidden_marker_in_tokenizer_history_artifact", path });
  }

  if (tokenizerReport?.formal_decoder_training !== false) failures.push({ code: "tokenizer_report_claims_formal_decoder_training" });
  if (tokenizerReport?.production_tokenizer !== false) failures.push({ code: "tokenizer_report_claims_production_tokenizer" });
  if (!Array.isArray(corpusReport?.forbidden_sources_touched) || corpusReport.forbidden_sources_touched.length !== 0) {
    failures.push({ code: "tokenizer_corpus_report_forbidden_sources_touched" });
  }
  if (!Array.isArray(corpusReport?.private_data_markers) || corpusReport.private_data_markers.length !== 0) {
    failures.push({ code: "tokenizer_corpus_report_private_data_markers" });
  }
  if (!Array.isArray(corpusReport?.chain_of_thought_markers) || corpusReport.chain_of_thought_markers.length !== 0) {
    failures.push({ code: "tokenizer_corpus_report_chain_of_thought_markers" });
  }
  if (evalReport?.ok !== true) failures.push({ code: "tokenizer_eval_report_not_ok" });
  if (!(await isIgnored(artifactDir))) failures.push({ code: "tokenizer_artifact_dir_not_ignored", path: artifactDir });
  const trackedArtifacts = (await gitLsFiles(["ls-files", artifactDir])).filter(Boolean);
  if (trackedArtifacts.length) failures.push({ code: "tokenizer_artifacts_tracked_by_git", trackedArtifacts });

  const output = {
    ok: failures.length === 0,
    config_path: configPath,
    artifact_dir: artifactDir,
    tokenizer_id: tokenizer?.tokenizer_id || "",
    vocab_size: tokenizer?.vocab_size || 0,
    history_only: true,
    tokenizer_training_rerun: false,
    tokenizer_eval_rerun: false,
    artifacts_tracked_by_git: trackedArtifacts,
    failures
  };
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
