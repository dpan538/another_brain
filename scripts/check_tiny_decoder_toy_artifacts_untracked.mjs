#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const ARTIFACT_DIR = "artifacts/training_os/tiny_decoder_toy";
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const TOY_ARTIFACT_RE = /r25k_toy_|tiny_decoder_toy|toy_checkpoint|toy_metrics|toy_run_report/i;

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 12 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function isIgnored(path) {
  try {
    await execFileAsync("git", ["check-ignore", path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

async function walk(path) {
  const abs = resolve(ROOT, path);
  const info = await stat(abs).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [path];
  const out = [];
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(child)));
    else out.push(child);
  }
  return out.sort();
}

async function main() {
  const failures = [];
  if (!(await exists(ARTIFACT_DIR))) failures.push({ code: "toy_artifact_dir_missing", path: ARTIFACT_DIR });

  const toyFiles = await walk(ARTIFACT_DIR);
  for (const path of toyFiles) {
    if (!(await isIgnored(path))) failures.push({ code: "toy_artifact_not_ignored", path });
  }

  const trackedToyArtifacts = await gitLines(["ls-files", "--cached", ARTIFACT_DIR]);
  if (trackedToyArtifacts.length) failures.push({ code: "toy_artifacts_tracked_or_staged", trackedToyArtifacts });

  const trackedGeneratedToy = (await gitLines(["ls-files", "--cached"])).filter((path) => TOY_ARTIFACT_RE.test(path) && path.startsWith("artifacts/"));
  if (trackedGeneratedToy.length) failures.push({ code: "generated_toy_checkpoint_or_report_tracked", trackedGeneratedToy });

  const trackedModelLikeFiles = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  if (trackedModelLikeFiles.length) failures.push({ code: "tracked_model_like_binary_extension", trackedModelLikeFiles });

  const forbiddenRoots = ["web", "static_llm/assets", "build_sources"];
  const misplaced = [];
  for (const root of forbiddenRoots) {
    for (const path of await walk(root)) {
      if (TOY_ARTIFACT_RE.test(path)) misplaced.push(path);
    }
  }
  if (misplaced.length) failures.push({ code: "toy_artifacts_in_forbidden_runtime_path", misplaced });

  const output = {
    ok: failures.length === 0,
    toy_artifact_dir: ARTIFACT_DIR,
    toy_artifact_file_count: toyFiles.length,
    toy_artifacts_ignored: toyFiles.length > 0 && failures.every((failure) => failure.code !== "toy_artifact_not_ignored"),
    toy_artifacts_tracked_or_staged: trackedToyArtifacts,
    tracked_model_like_files: trackedModelLikeFiles,
    forbidden_runtime_toy_artifacts: misplaced,
    failures
  };
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
