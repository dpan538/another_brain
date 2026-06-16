import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIR = resolve(ROOT, "evals/r21_control_families");
const OUT = resolve(ROOT, "artifacts/training_os/r21_family_split_report.json");

async function readJsonl(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function main() {
  const splits = {
    train: await readJsonl(resolve(DIR, "train.jsonl")),
    dev: await readJsonl(resolve(DIR, "dev.jsonl")),
    blind: await readJsonl(resolve(DIR, "blind.jsonl"))
  };
  const failures = [];
  const prompts = new Map();
  for (const [split, rows] of Object.entries(splits)) {
    for (const row of rows) {
      const key = row.prompt || JSON.stringify(row.turns || []);
      if (prompts.has(key)) failures.push({ reason: "prompt_overlap", first: prompts.get(key), second: row.id });
      prompts.set(key, row.id);
      if (!row.labels?.response_mode || !row.labels?.binding_kind || !row.labels?.operation) failures.push({ id: row.id, reason: "missing_control_labels" });
    }
  }
  const entities = Object.fromEntries(Object.entries(splits).map(([split, rows]) => [split, new Set(rows.map((row) => row.entity_family))]));
  for (const entity of entities.blind) {
    if (entities.train.has(entity) || entities.dev.has(entity)) failures.push({ reason: "blind_entity_family_leak", entity });
  }
  const scenarioFamilies = new Set(Object.values(splits).flat().map((row) => row.scenario_family));
  const report = {
    ok: failures.length === 0,
    rows: Object.fromEntries(Object.entries(splits).map(([split, rows]) => [split, rows.length])),
    unique_scenario_families: scenarioFamilies.size,
    blind_only_entity_families: [...entities.blind].filter((entity) => !entities.train.has(entity) && !entities.dev.has(entity)).length,
    failures
  };
  if (report.unique_scenario_families < 6) report.failures.push({ reason: "too_few_scenario_families" });
  report.ok = report.failures.length === 0;
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
