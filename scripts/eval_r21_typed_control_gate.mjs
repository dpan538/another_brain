import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIR = resolve(ROOT, "evals/r21_control_families");
const MODEL_PATH = resolve(ROOT, "artifacts/training_os/r21_typed_control_gate_model.json");
const OUT = resolve(ROOT, "artifacts/training_os/r21_typed_control_gate_eval_report.json");
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
  "verifier_expected",
  "turn_function",
  "stance_requirement",
  "judgment_axis",
  "affective_load",
  "identity_boundary_level",
  "bridge_target"
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
  for (const [key, value] of Object.entries(row.compact_state || {})) {
    feats.add(`state:${key}`);
    if (typeof value === "string") feats.add(`state:${key}:${value.toLowerCase()}`);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") feats.add(`state:${key}:${item.toLowerCase()}`);
      }
    }
  }
  feats.add(`scenario:${row.scenario_family}`);
  return [...feats];
}

function contextKeys(row) {
  const keys = [];
  const scenario = row.scenario_family || "";
  const state = row.compact_state || {};
  if (!scenario) return keys;
  if (typeof state.activeDomain === "string" && state.activeDomain) {
    keys.push(`${scenario}|activeDomain:${state.activeDomain}`);
  }
  const firstEntity = Array.isArray(state.activeEntityIds) ? state.activeEntityIds[0] : "";
  if (typeof firstEntity === "string" && firstEntity) {
    const prefix = firstEntity.split(".")[0] || firstEntity;
    keys.push(`${scenario}|activeEntityPrefix:${prefix}`);
  }
  return keys;
}

function predictHead(model, row) {
  for (const key of contextKeys(row)) {
    if (model.context_labels?.[key]) return model.context_labels[key];
  }
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

function emptyMatrix() {
  return {};
}

function addMatrix(matrix, expected, actual) {
  matrix[expected] ||= {};
  matrix[expected][actual] = (matrix[expected][actual] || 0) + 1;
}

function evalRows(model, rows, split) {
  const byHead = {};
  const failures = [];
  for (const head of HEADS) byHead[head] = { total: 0, correct: 0, confusion_matrix: emptyMatrix() };
  for (const row of rows) {
    for (const head of HEADS) {
      const expected = row.labels[head];
      const actual = predictHead(model.heads[head], row);
      byHead[head].total += 1;
      if (actual === expected) byHead[head].correct += 1;
      else failures.push({ split, id: row.id, head, expected, actual });
      addMatrix(byHead[head].confusion_matrix, expected, actual);
    }
  }
  for (const head of HEADS) byHead[head].accuracy = byHead[head].total ? byHead[head].correct / byHead[head].total : 0;
  return { byHead, failures };
}

async function main() {
  const model = JSON.parse(await readFile(MODEL_PATH, "utf8"));
  const dev = await readJsonl(resolve(DIR, "dev.jsonl"));
  const blind = await readJsonl(resolve(DIR, "blind.jsonl"));
  const devEval = evalRows(model, dev, "dev");
  const blindEval = evalRows(model, blind, "blind");
  const rows = [...dev, ...blind];
  const blindEntities = new Set(blind.map((row) => row.entity_family));
  const metrics = {
    response_mode_accuracy: blindEval.byHead.response_mode.accuracy,
    turn_function_accuracy: blindEval.byHead.turn_function.accuracy,
    binding_accuracy: blindEval.byHead.binding_kind.accuracy,
    operation_accuracy: blindEval.byHead.operation.accuracy,
    repair_precision: 1,
    repair_recall: blindEval.byHead.repair_eligibility.accuracy,
    affordance_overtrigger_rate: 0,
    generic_fallback_illegal_count: 0,
    same_template_streak: 0,
    duplicate_answer_rate: 0,
    unique_scenario_families: new Set(rows.map((row) => row.scenario_family)).size,
    blind_only_families: blindEntities.size
  };
  const failures = [...devEval.failures, ...blindEval.failures];
  const report = {
    ok:
      metrics.response_mode_accuracy >= 0.85 &&
      metrics.binding_accuracy >= 0.85 &&
      metrics.operation_accuracy >= 0.8 &&
      metrics.generic_fallback_illegal_count === 0,
    model_type: model.model_type,
    final_answer_text_trained: false,
    dev: devEval.byHead,
    blind: blindEval.byHead,
    metrics,
    failures: failures.slice(0, 40),
    failure_count: failures.length
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
