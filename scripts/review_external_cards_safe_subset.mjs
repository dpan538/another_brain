#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CARD_DIR = resolve(ROOT, "data/culture_cards");
const REPORT = resolve(ROOT, "artifacts/training_os/external_cards_safe_review_report.json");

function parseJsonl(text, file) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => ({ ...JSON.parse(line), __file: file }));
}

function isExternalCard(card) {
  return String(card.id || "").startsWith("external.");
}

function lowRiskMetadata(card) {
  return (
    card.visibility === "public" &&
    card.needs_review === true &&
    card.approved_for_public_runtime === false &&
    Number(card.confidence || 0) >= 0.85 &&
    Array.isArray(card.source_ids) &&
    card.source_ids.length > 0 &&
    Array.isArray(card.license_refs) &&
    card.license_refs.length > 0 &&
    /metadata/i.test(`${card.factual_core} ${card.source_summary}`)
  );
}

async function main() {
  const files = (await readdir(CARD_DIR)).filter((file) => file.startsWith("external_") && file.endsWith(".jsonl"));
  const cards = [];
  for (const file of files) cards.push(...parseJsonl(await readFile(resolve(CARD_DIR, file), "utf8"), file));
  const external = cards.filter(isExternalCard);
  const lowRisk = external.filter(lowRiskMetadata);
  const report = {
    ok: true,
    files: files.length,
    external_cards: external.length,
    low_risk_metadata_candidates: lowRisk.length,
    auto_approved_for_public_runtime: 0,
    decision: "No external metadata card is auto-enabled for public runtime in R16; low-risk candidates remain review-only.",
    candidate_ids: lowRisk.map((card) => card.id)
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
