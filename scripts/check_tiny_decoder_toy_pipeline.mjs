#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const failures = [];
  const config = JSON.parse(await readFile(resolve(ROOT, "training/from_scratch/toy_decoder_config.json"), "utf8"));
  if (config.product_model !== false) failures.push({ code: "toy_config_must_not_be_product" });
  if (config.commit_weights_allowed !== false) failures.push({ code: "toy_config_must_not_allow_weight_commit" });
  if (config.formal_decoder_training !== false) failures.push({ code: "toy_config_must_not_mark_formal_training" });
  if (!String(config.output_dir || "").startsWith("artifacts/training_os/tiny_decoder_toy/")) failures.push({ code: "toy_output_dir_must_be_ignored_artifacts" });
  if (!(await exists("artifacts/training_os/tokenizer_dryrun/r25j_tokenizer.json"))) failures.push({ code: "tokenizer_dryrun_artifact_missing" });
  if (!(await exists("training/from_scratch/toy_decoder_readme.md"))) failures.push({ code: "toy_decoder_readme_missing" });
  const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
  const trackedWeights = stdout.split(/\r?\n/).filter((path) => WEIGHT_RE.test(path));
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weights_present", trackedWeights });
  const output = {
    ok: failures.length === 0,
    architecture_id: config.architecture_id,
    product_model: false,
    formal_decoder_training: false,
    toy_weights_committed: false,
    failures
  };
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
