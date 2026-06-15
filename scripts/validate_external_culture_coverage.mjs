#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CARD_DIR = resolve(ROOT, "data/culture_cards");
const REPORT = resolve(ROOT, "artifacts/training_os/external_culture_coverage_report.json");

const TARGETS = {
  "music.chinese_pop_general": { cards: 50, relations: 30 },
  "literature.japanese": { cards: 50, relations: 60 },
  "literature.asian_general": { cards: 1, relations: 3 },
  "literature.chinese_modern": { cards: 20, relations: 10 },
  "literature.korean_modern": { cards: 10, relations: 5 },
  art_history: { cards: 100, relations: 80 },
  philosophy: { cards: 50, relations: 20 }
};

const FORBIDDEN = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|根据你的|according to your|完整歌词|歌词[:：]|passport|visa|bank account|student ID/i;

function parseJsonl(text, file, failures) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return { ...JSON.parse(line), __file: file, __line: index + 1 };
      } catch (error) {
        failures.push({ code: "json_parse_error", file, line: index + 1, message: error.message });
        return null;
      }
    })
    .filter(Boolean);
}

function domainReport(cards, domain) {
  const domainCards = cards.filter((card) => card.domain === domain);
  const relationCards = domainCards.filter((card) => card.entity_type === "relation").length;
  const target = TARGETS[domain] || { cards: 1, relations: 0 };
  return {
    domain,
    cards: domainCards.length,
    relation_cards: relationCards,
    public_runtime_enabled: domainCards.filter((card) => card.approved_for_public_runtime).length,
    needs_review: domainCards.filter((card) => card.needs_review).length,
    target,
    target_met: domainCards.length >= target.cards && relationCards >= target.relations,
    coverage_level:
      domainCards.length === 0 ? "none" : domainCards.length < target.cards || relationCards < target.relations ? "seed" : "target_met"
  };
}

async function main() {
  const failures = [];
  const files = (await readdir(CARD_DIR)).filter((file) => file.startsWith("external_") && file.endsWith(".jsonl")).sort();
  const cards = [];
  for (const file of files) cards.push(...parseJsonl(await readFile(resolve(CARD_DIR, file), "utf8"), file, failures));

  for (const card of cards) {
    if (!String(card.id || "").startsWith("external.")) failures.push({ code: "non_external_id", file: card.__file, id: card.id });
    if (card.approved_for_public_runtime) failures.push({ code: "external_card_runtime_enabled", file: card.__file, id: card.id });
    if (card.needs_review !== true) failures.push({ code: "external_card_missing_review_flag", file: card.__file, id: card.id });
    if (!Array.isArray(card.source_ids) || card.source_ids.length === 0) failures.push({ code: "missing_source_ids", file: card.__file, id: card.id });
    if (!Array.isArray(card.license_refs) || card.license_refs.length === 0) failures.push({ code: "missing_license_refs", file: card.__file, id: card.id });
    if (FORBIDDEN.test(JSON.stringify(card))) failures.push({ code: "forbidden_content", file: card.__file, id: card.id });
  }

  const domains = Object.keys(TARGETS).map((domain) => domainReport(cards, domain));
  const report = {
    ok: failures.length === 0,
    meets_large_r16_targets: domains.every((domain) => domain.target_met),
    files: files.length,
    external_cards: cards.length,
    public_runtime_enabled: cards.filter((card) => card.approved_for_public_runtime).length,
    domains,
    failures,
    note: "A passing safety check does not mean large R16 knowledge reserve targets are met."
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
