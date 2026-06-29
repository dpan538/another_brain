#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { decodeDryrun, encodeDryrun, trainDryrunTokenizer } from "./train_tokenizer_dryrun.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const DEFAULT_CONFIG_PATH = "training/from_scratch/tokenizer_dry_run_config.json";
const PRIVATE_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const FORBIDDEN_MARKER_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|raw_private_data|private_memory|api_key|BEGIN PRIVATE KEY/i;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function gitLsFiles(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

function configPathFromArgs() {
  const index = process.argv.indexOf("--config");
  return index >= 0 ? process.argv[index + 1] || DEFAULT_CONFIG_PATH : DEFAULT_CONFIG_PATH;
}

function sameList(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const failures = [];
  const configPath = configPathFromArgs();
  const config = await readJson(configPath);
  const artifactDir = config.artifact_dir || "artifacts/training_os/tokenizer_dryrun";
  const tokenizer = await readJson(`${artifactDir}/r25j_tokenizer.json`).catch(() => null);
  const trainText = await readFile(resolve(ROOT, `${artifactDir}/r25j_tokenizer_train.txt`), "utf8").catch(() => "");
  if (!tokenizer) failures.push({ code: "tokenizer_artifact_missing" });
  else {
    if (tokenizer.tokenizer_id !== config.tokenizer_id) failures.push({ code: "tokenizer_id_mismatch" });
    if (tokenizer.vocab_size > config.selected_dryrun_vocab_size + config.special_tokens.length) failures.push({ code: "vocab_size_exceeds_target" });
    for (const token of config.special_tokens) {
      if (!(token in tokenizer.vocab)) failures.push({ code: "missing_special_token", token });
    }
    if (!sameList(tokenizer.training_sources_used || [], config.train_sources || [])) {
      failures.push({ code: "unexpected_training_source_used", sources: tokenizer.training_sources_used });
    }
    if (!sameList(tokenizer.eval_sources_not_used_for_training || [], config.eval_sources || [])) {
      failures.push({ code: "unexpected_eval_sources_recorded", sources: tokenizer.eval_sources_not_used_for_training });
    }
    const artifactText = JSON.stringify(tokenizer);
    if (PRIVATE_PATH_RE.test(artifactText)) failures.push({ code: "private_path_in_tokenizer_artifact" });
    if (FORBIDDEN_MARKER_RE.test(artifactText)) failures.push({ code: "forbidden_marker_in_tokenizer_artifact" });

    const fixture = "浏览器 decoder LLM keeps R24 gates active.";
    const ids = encodeDryrun(fixture, tokenizer, config);
    const decoded = decodeDryrun(ids, tokenizer);
    if (!ids.length) failures.push({ code: "fixture_encode_empty" });
    if (decoded !== fixture) failures.push({ code: "fixture_roundtrip_failed", decoded });
    const unknownIds = encodeDryrun("☃", tokenizer, config);
    if (!unknownIds.includes(tokenizer.vocab["<unk>"])) failures.push({ code: "unknown_token_not_used" });

    const rebuilt = trainDryrunTokenizer(trainText, config);
    const originalSha = createHash("sha256").update(JSON.stringify(tokenizer)).digest("hex");
    const rebuiltSha = createHash("sha256").update(JSON.stringify(rebuilt)).digest("hex");
    if (originalSha !== rebuiltSha) failures.push({ code: "deterministic_rerun_sha_mismatch", originalSha, rebuiltSha });
  }
  const trackedArtifacts = (await gitLsFiles(["ls-files", artifactDir])).filter(Boolean);
  if (trackedArtifacts.length) failures.push({ code: "tokenizer_artifacts_tracked_by_git", trackedArtifacts });

  const output = {
    ok: failures.length === 0,
    config_path: configPath,
    tokenizer_id: tokenizer?.tokenizer_id || "",
    vocab_size: tokenizer?.vocab_size || 0,
    deterministic: failures.every((failure) => failure.code !== "deterministic_rerun_sha_mismatch"),
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
