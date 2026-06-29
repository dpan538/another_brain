#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeDryrun, encodeDryrun } from "./train_tokenizer_dryrun.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = "artifacts/training_os/tokenizer_dryrun";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function scoreText(text, tokenizer, config) {
  const ids = encodeDryrun(text, tokenizer, config);
  const unkId = tokenizer.vocab["<unk>"];
  const unknown = ids.filter((id) => id === unkId).length;
  return {
    chars: text.length,
    tokens: ids.length,
    unknown_tokens: unknown,
    unknown_rate: ids.length ? unknown / ids.length : 0,
    avg_chars_per_token: ids.length ? text.length / ids.length : 0
  };
}

async function main() {
  const config = await readJson("training/from_scratch/tokenizer_dry_run_config.json");
  const tokenizer = await readJson(`${ARTIFACT_DIR}/r25j_tokenizer.json`);
  const dev = await readFile(resolve(ROOT, `${ARTIFACT_DIR}/r25j_tokenizer_eval_dev.txt`), "utf8");
  const heldout = await readFile(resolve(ROOT, `${ARTIFACT_DIR}/r25j_tokenizer_eval_heldout.txt`), "utf8");
  const devScore = scoreText(dev, tokenizer, config);
  const heldoutScore = scoreText(heldout, tokenizer, config);
  const sampleScores = {
    zh: scoreText("浏览器端静态解码模型保持本地优先。", tokenizer, config),
    en: scoreText("Static browser decoder keeps the verifier active.", tokenizer, config),
    mixed: scoreText("R25J tokenizer dry-run 支持 mixed zh/en text.", tokenizer, config)
  };
  const specialRoundtrip = decodeDryrun(encodeDryrun("<user> hello <assistant>", tokenizer, config), tokenizer) === "<user> hello <assistant>";
  const combinedUnknownRate = (devScore.unknown_tokens + heldoutScore.unknown_tokens) / Math.max(1, devScore.tokens + heldoutScore.tokens);
  const avgCharsPerToken = (devScore.chars + heldoutScore.chars) / Math.max(1, devScore.tokens + heldoutScore.tokens);
  const warnings = [];
  if (combinedUnknownRate > 0.05) warnings.push("unknown_rate_above_dryrun_preference");
  if (avgCharsPerToken < 1.2) warnings.push("token_expansion_risk");
  if (!specialRoundtrip) warnings.push("special_token_roundtrip_failed");
  const output = {
    ok: combinedUnknownRate <= 0.5 && specialRoundtrip,
    tokenizer_id: tokenizer.tokenizer_id,
    vocab_size: tokenizer.vocab_size,
    dev: devScore,
    heldout: heldoutScore,
    unknown_rate: combinedUnknownRate,
    avg_chars_per_token: avgCharsPerToken,
    sample_scores: sampleScores,
    special_token_roundtrip: specialRoundtrip,
    warnings
  };
  await mkdir(resolve(ROOT, ARTIFACT_DIR), { recursive: true });
  await writeFile(resolve(ROOT, `${ARTIFACT_DIR}/r25j_tokenizer_eval_report.json`), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
