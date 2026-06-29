#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const config = JSON.parse(await readFile(resolve(ROOT, "training/from_scratch/toy_decoder_config.json"), "utf8"));
  const allow = process.argv.includes("--allow-toy-training");
  const report = {
    ok: true,
    skipped: true,
    reason: allow ? "toy_training_flag_seen_but_training_not_implemented_in_r25j" : "explicit_allow_toy_training_flag_required",
    formal_decoder_training: false,
    product_model: false,
    weights_written: false,
    weights_committed: false,
    output_dir: config.output_dir
  };
  await mkdir(resolve(ROOT, config.output_dir), { recursive: true });
  await writeFile(resolve(ROOT, config.output_dir, "r25j_toy_overfit_skip_report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
