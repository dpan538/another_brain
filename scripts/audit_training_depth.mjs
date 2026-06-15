#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/training_depth_audit_report.json");

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function lines(text) {
  return String(text || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniq(items) {
  return [...new Set(items)];
}

function score(value, max) {
  return max ? Math.round((Math.min(value, max) / max) * 1000) / 1000 : 0;
}

function classifyFiles(files) {
  const groups = {
    docs: [],
    evals: [],
    cards: [],
    gates: [],
    runtime: [],
    scripts: [],
    trainingRows: [],
    modelArtifacts: [],
    externalData: [],
    generatedModel: [],
    answerBank: [],
    forbiddenRisk: []
  };

  for (const file of files) {
    if (file.startsWith("docs/")) groups.docs.push(file);
    if (file.startsWith("evals/")) groups.evals.push(file);
    if (file.startsWith("data/culture_cards/") || file.includes("culture_cards")) groups.cards.push(file);
    if (/coverage_gate|draft_verifier|controlled_gate|gate/i.test(file)) groups.gates.push(file);
    if (file.startsWith("web/")) groups.runtime.push(file);
    if (file.startsWith("scripts/")) groups.scripts.push(file);
    if (/trace_training|training.*jsonl|reasoning_examples|persona_method/i.test(file)) groups.trainingRows.push(file);
    if (/artifacts\/.*(model|metrics|confusion|checkpoint|lora|adapter|weights)/i.test(file)) groups.modelArtifacts.push(file);
    if (file.startsWith("data/external_") || file.includes("external_sources")) groups.externalData.push(file);
    if (/model\.generated\.js|controlled_gate_model/i.test(file)) groups.generatedModel.push(file);
    if (/dialog_rules\.js|tiny_router_model\.generated\.js|knowledge_base\.generated\.js|answerIndex/i.test(file)) {
      groups.answerBank.push(file);
    }
    if (/\.(pdf|docx)$/i.test(file) || /\/Users\/|\/Volumes\//.test(file)) groups.forbiddenRisk.push(file);
  }
  return groups;
}

function verdictFrom(groups, commits) {
  const hasTrainingRows = groups.trainingRows.length > 0;
  const hasModel = groups.modelArtifacts.length > 0 || groups.generatedModel.length > 0;
  const hasExternal = groups.externalData.length > 0;
  const hasRuntime = groups.runtime.length > 0;
  const hasGate = groups.gates.length > 0;
  const hasEvalsOrCards = groups.evals.length + groups.cards.length > 0;
  const mentionsTraining = commits.some((commit) => /train|training|model|gate/i.test(commit.subject));

  if (hasModel && hasTrainingRows) return "controlled_training";
  if (hasExternal && hasTrainingRows) return "data_expansion";
  if (hasTrainingRows && hasGate) return "data_expansion";
  if (hasRuntime && hasGate && hasEvalsOrCards) return "deterministic_gate_hardening";
  if (hasEvalsOrCards || mentionsTraining) return "path_coverage_only";
  return "unknown";
}

async function main() {
  const commits = lines(git(["log", "--format=%H%x09%s", "-15"])).map((line) => {
    const [sha, ...rest] = line.split("\t");
    return { sha, subject: rest.join("\t") };
  });
  const oldest = commits.at(-1)?.sha || "HEAD";
  const newest = commits[0]?.sha || "HEAD";
  const commitRange = `${oldest}..${newest}`;
  const files = uniq(lines(git(["diff", "--name-only", `${oldest}^..${newest}`])));
  const groups = classifyFiles(files);
  const commitSubjects = commits.map((commit) => commit.subject).join("\n");

  const report = {
    commit_range: commitRange,
    commits,
    changed_files: files.length,
    path_coverage_score: score(groups.evals.length + groups.cards.length + groups.docs.length, 60),
    data_training_score: score(groups.trainingRows.length, 8),
    model_training_score: score(groups.modelArtifacts.length + groups.generatedModel.length, 4),
    eval_hardening_score: score(groups.evals.length + groups.gates.length, 40),
    runtime_rule_patch_score: score(groups.runtime.length, 12),
    external_data_score: score(groups.externalData.length, 12),
    mini_web_llm_score: 0,
    answer_bank_growth: groups.answerBank.length > 0,
    training_artifacts_changed: groups.trainingRows,
    training_rows_delta: groups.trainingRows.length,
    model_artifacts_delta: [...groups.modelArtifacts, ...groups.generatedModel],
    verdict: verdictFrom(groups, commits),
    evidence: [
      `${commits.length} commits inspected`,
      `${groups.evals.length} eval files changed`,
      `${groups.cards.length} culture/card files changed`,
      `${groups.gates.length} gate/verifier files changed`,
      `${groups.trainingRows.length} training-row-like files changed`,
      `${groups.modelArtifacts.length + groups.generatedModel.length} model artifact files changed`,
      `${groups.externalData.length} external-data files changed`,
      groups.answerBank.length ? `answer-bank-risk files changed: ${groups.answerBank.join(", ")}` : "no answer-bank-risk files changed in diff window",
      /controlled gate|mini web llm/i.test(commitSubjects)
        ? "commit subjects mention controlled gate or mini web llm"
        : "commit subjects do not prove neural training"
    ],
    groups
  };

  if (report.model_training_score === 0 && report.data_training_score === 0) {
    report.evidence.push("No model artifact or train/dev/test training-row delta detected; this must not be described as neural training.");
  }
  if (report.data_training_score > 0 && report.model_training_score === 0) {
    report.evidence.push("Trace/training data exists, but no controlled model artifact was detected in the inspected range.");
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
