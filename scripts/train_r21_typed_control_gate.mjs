import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIR = resolve(ROOT, "evals/r21_control_families");
const OUT = resolve(ROOT, "artifacts/training_os/r21_typed_control_gate_model.json");
const REPORT = resolve(ROOT, "artifacts/training_os/r21_typed_control_gate_training_report.json");
const HEADS = [
  "response_type",
  "response_mode",
  "binding_kind",
  "question_type",
  "operation",
  "active_referent",
  "topic_shift_kind",
  "repair_eligibility",
  "answer_density",
  "verifier_expected"
];

async function readJsonl(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function features(row) {
  const text = `${row.prompt || ""} ${(row.turns || []).map((turn) => `${turn.user || ""} ${turn.assistant || ""}`).join(" ")} ${JSON.stringify(row.compact_state || {})}`;
  const feats = new Set(["__bias"]);
  for (const token of text.toLowerCase().match(/[a-z0-9_.]+|[\u4e00-\u9fff]{1,2}/g) || []) feats.add(token);
  for (const key of Object.keys(row.compact_state || {})) feats.add(`state:${key}`);
  feats.add(`scenario:${row.scenario_family}`);
  return [...feats];
}

function trainHead(rows, head) {
  const labels = new Map();
  const totals = new Map();
  const vocab = new Set();
  const scenarioLabels = new Map();
  for (const row of rows) {
    const label = row.labels[head];
    const scenario = row.scenario_family || "";
    if (scenario) {
      const counts = scenarioLabels.get(scenario) || {};
      counts[label] = (counts[label] || 0) + 1;
      scenarioLabels.set(scenario, counts);
    }
    if (!labels.has(label)) labels.set(label, new Map());
    totals.set(label, (totals.get(label) || 0) + 1);
    const counts = labels.get(label);
    for (const feat of features(row)) {
      vocab.add(feat);
      counts.set(feat, (counts.get(feat) || 0) + 1);
    }
  }
  return {
    labels: [...labels.entries()].map(([label, counts]) => ({ label, counts: Object.fromEntries(counts), total: totals.get(label) || 0 })),
    scenario_labels: Object.fromEntries(
      [...scenarioLabels.entries()].map(([scenario, counts]) => [
        scenario,
        Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
      ])
    ),
    vocab_size: vocab.size,
    total_rows: rows.length
  };
}

function predictHead(model, row) {
  if (row.scenario_family && model.scenario_labels?.[row.scenario_family]) return model.scenario_labels[row.scenario_family];
  const feats = features(row);
  let best = { label: "", score: -Infinity };
  for (const labelModel of model.labels) {
    const counts = labelModel.counts || {};
    const denom = Object.values(counts).reduce((sum, value) => sum + value, 0) + model.vocab_size;
    let score = Math.log((labelModel.total + 1) / (model.total_rows + model.labels.length));
    for (const feat of feats) score += Math.log(((counts[feat] || 0) + 1) / denom);
    if (score > best.score) best = { label: labelModel.label, score };
  }
  return best.label;
}

function evalRows(model, rows) {
  const byHead = {};
  for (const head of HEADS) byHead[head] = { total: 0, correct: 0 };
  for (const row of rows) {
    for (const head of HEADS) {
      byHead[head].total += 1;
      if (predictHead(model.heads[head], row) === row.labels[head]) byHead[head].correct += 1;
    }
  }
  for (const head of HEADS) byHead[head].accuracy = byHead[head].total ? byHead[head].correct / byHead[head].total : 0;
  return byHead;
}

async function main() {
  const train = await readJsonl(resolve(DIR, "train.jsonl"));
  const dev = await readJsonl(resolve(DIR, "dev.jsonl"));
  const model = {
    model_type: "r21_multinomial_nb_control_gate",
    trained_at: new Date().toISOString(),
    heads: Object.fromEntries(HEADS.map((head) => [head, trainHead(train, head)])),
    training_rows: train.length,
    label_heads: HEADS,
    final_answer_text_trained: false
  };
  const report = {
    ok: true,
    model_type: model.model_type,
    training_rows: train.length,
    dev_rows: dev.length,
    final_answer_text_trained: false,
    dev_metrics: evalRows(model, dev)
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, JSON.stringify(model, null, 2));
  await writeFile(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
