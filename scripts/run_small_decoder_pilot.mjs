#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_config.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const allow = process.argv.includes("--allow-small-pilot-training");
  await mkdir(resolve(ROOT, config.output_dir), { recursive: true });

  if (!allow) {
    const report = {
      ok: true,
      skipped: true,
      reason: "explicit_phase_3_approval_required",
      training_ran: false,
      formal_decoder_training: false,
      product_model: false,
      weights_written: false,
      weights_committed: false,
      output_dir: config.output_dir
    };
    await writeJson(`${config.output_dir}r25l_small_decoder_pilot_skip_report.json`, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const approval = await readJson(config.approval_marker_path).catch(() => null);
  const report = {
    ok: false,
    skipped: true,
    reason: "future_phase_3_training_not_implemented_without_reviewed_approval",
    approval_present: Boolean(approval?.approved),
    training_ran: false,
    formal_decoder_training: false,
    product_model: false,
    weights_written: false,
    weights_committed: false,
    failures: [
      {
        code: "r25l_does_not_train_small_decoder_pilot",
        required_future_marker: config.approval_marker_path
      }
    ]
  };
  await writeJson(`${config.output_dir}r25l_small_decoder_pilot_skip_report.json`, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
