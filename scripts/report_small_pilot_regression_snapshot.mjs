#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25n/r25n_regression_snapshot.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function statusFrom(path, predicate = (value) => value?.ok === true) {
  const value = await readJson(path).catch(() => null);
  if (!value) return "not_run";
  return predicate(value) ? "pass" : "unknown";
}

async function main() {
  const r25Gates = {
    r25m_history: await statusFrom("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_eval_report.json"),
    r25n_analysis: await statusFrom("artifacts/training_os/small_decoder_pilot/r25n/r25n_small_pilot_analysis.json"),
    r25n_heldout: await statusFrom("artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json"),
    r25k_history: await statusFrom("artifacts/training_os/tiny_decoder_toy/r25k_toy_eval_report.json"),
    r25l_tokenizer: await statusFrom("artifacts/training_os/tokenizer_dryrun/r25l/r25j_tokenizer_eval_report.json")
  };
  const report = {
    ok: true,
    r24_recovery_candidate: await statusFrom("artifacts/training_os/r24_recovery_candidate_report.json"),
    r25_gates: r25Gates,
    no_eval_hardcoding: await statusFrom("artifacts/training_os/no_eval_prompt_hardcoding_report.json"),
    eval_split_integrity: await statusFrom("artifacts/training_os/eval_split_integrity_report.json"),
    anti_lobotomy: await statusFrom("artifacts/training_os/canary_anti_lobotomy_report.json"),
    dialogue_boundary: await statusFrom("artifacts/training_os/r19_dialogue_boundary_report.json"),
    vercel_build: "unknown",
    notes: [
      "R25N snapshot summarizes local report artifacts and does not rerun large gates.",
      "Use the command log from this run as the source of truth for gates that do not write JSON reports.",
      "R25N does not train, rerun toy overfit, or rerun the small decoder pilot."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
