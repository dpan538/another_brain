#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const ARTIFACT_DIR = "artifacts/training_os/small_decoder_pilot/r25m";
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const PILOT_ARTIFACT_RE = /r25m_|small_decoder_checkpoint|small_decoder_metrics|small_decoder_run_report|small_decoder_pilot/i;

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
  if (!(await exists(ARTIFACT_DIR))) failures.push({ code: "pilot_artifact_dir_missing", path: ARTIFACT_DIR });
  const artifactFiles = await walk(ARTIFACT_DIR);
  for (const path of artifactFiles) {
    if (!(await isIgnored(path))) failures.push({ code: "pilot_artifact_not_ignored", path });
    if (MODEL_WEIGHT_RE.test(path)) failures.push({ code: "forbidden_model_binary_artifact_extension", path });
  }

  const trackedPilotArtifacts = await gitLines(["ls-files", "--cached", ARTIFACT_DIR]);
  if (trackedPilotArtifacts.length) failures.push({ code: "pilot_artifacts_tracked_or_staged", trackedPilotArtifacts });

  const trackedGeneratedPilot = (await gitLines(["ls-files", "--cached"]))
    .filter((path) => path.startsWith("artifacts/") && PILOT_ARTIFACT_RE.test(path));
  if (trackedGeneratedPilot.length) failures.push({ code: "generated_pilot_checkpoint_or_report_tracked", trackedGeneratedPilot });

  const trackedModelLikeFiles = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  if (trackedModelLikeFiles.length) failures.push({ code: "tracked_model_like_binary_extension", trackedModelLikeFiles });

  const forbiddenRoots = ["web", "static_llm/assets", "build_sources", "knowledge_sources"];
  const misplaced = [];
  for (const root of forbiddenRoots) {
    for (const path of await walk(root)) {
      if (PILOT_ARTIFACT_RE.test(path) && /r25m|checkpoint|metrics|run_report|train_sequences|dev_sequences/.test(path)) {
        misplaced.push(path);
      }
    }
  }
  if (misplaced.length) failures.push({ code: "pilot_artifacts_in_forbidden_runtime_path", misplaced });

  const output = {
    ok: failures.length === 0,
    pilot_artifact_dir: ARTIFACT_DIR,
    pilot_artifact_file_count: artifactFiles.length,
    pilot_artifacts_ignored: artifactFiles.length > 0 && failures.every((failure) => failure.code !== "pilot_artifact_not_ignored"),
    pilot_artifacts_tracked_or_staged: trackedPilotArtifacts,
    tracked_model_like_files: trackedModelLikeFiles,
    forbidden_runtime_pilot_artifacts: misplaced,
    failures
  };
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
