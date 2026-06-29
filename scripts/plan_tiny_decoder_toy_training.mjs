#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const config = JSON.parse(await readFile(resolve(ROOT, "training/from_scratch/toy_decoder_config.json"), "utf8"));
  const plan = {
    ok: true,
    skipped_training: true,
    architecture_id: config.architecture_id,
    product_model: false,
    formal_decoder_training: false,
    commit_weights_allowed: false,
    output_dir: config.output_dir,
    estimated_parameters: config.layers * (config.hidden_size * config.hidden_size * 4 + config.hidden_size * config.intermediate_size * 2),
    steps_planned: [
      "load dry-run tokenizer artifact",
      "build tiny sequence batches from approved tokenizer train text",
      "initialize toy decoder in ignored artifact space only if future approval is present",
      "run tiny overfit sanity only in phase_2 and never as product"
    ],
    gates: [
      "check:tokenizer-dryrun",
      "check:tokenizer-data-boundaries",
      "check:no-unapproved-model-weights",
      "check:from-scratch-training-doctrine"
    ]
  };
  await mkdir(resolve(ROOT, config.output_dir), { recursive: true });
  await writeFile(resolve(ROOT, config.output_dir, "r25j_toy_training_plan_report.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
