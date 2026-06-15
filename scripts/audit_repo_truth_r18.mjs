#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  ARTIFACT_DIR,
  ROOT,
  countLines,
  currentBranch,
  fileSize,
  git,
  gitStatusShort,
  listFiles,
  readJson,
  readJsonl,
  readText,
  splitCounts,
  writeJson
} from "./r18_utils.mjs";

const REPORT = resolve(ARTIFACT_DIR, "r18_repo_truth_audit_report.json");

async function grepTracked(pattern) {
  try {
    return await git(["grep", "-n", pattern]);
  } catch {
    return "";
  }
}

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const key = getter(row) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const branch = await currentBranch();
  const status = await gitStatusShort();
  const commitRange = await git(["log", "--oneline", "-30"]);
  const branches = await git(["branch", "--list"]);
  const trackedFiles = (await git(["ls-files"])).split(/\n/).filter(Boolean);

  const packageJson = JSON.parse(await readText(resolve(ROOT, "package.json")));
  const scripts = Object.keys(packageJson.scripts || {});
  const missingClaimedScripts = [
    "eval:r17-memory",
    "eval:r17-webgpu-memory",
    "train:controlled-gate",
    "eval:controlled-gate",
    "check:controlled-gate",
    "check:internal-session-memory"
  ].filter((script) => !scripts.includes(script));

  const reasoningRows = [
    ...(await readJsonl(resolve(ARTIFACT_DIR, "reasoning_trace_training.jsonl"))),
    ...(await readJsonl(resolve(ARTIFACT_DIR, "r17_reasoning_trace_training.jsonl")))
  ];
  const r17Metrics = await readJson(resolve(ARTIFACT_DIR, "r17_controlled_gate_training_metrics.json"), {});
  const gateModel = resolve(ARTIFACT_DIR, "controlled_gate_model.json");
  const exportedGate = resolve(ROOT, "web/controlled_gate_model.generated.js");
  const operationLayer = await readText(resolve(ROOT, "web/operation_layer.js"));
  const internalMemory = await readText(resolve(ROOT, "web/internal_session_memory.js"));
  const shortContext = await readText(resolve(ROOT, "docs/internal_session_memory_contract.md"));

  const openSources = await readJsonl(resolve(ROOT, "data/external_sources/open_dataset_registry.jsonl"));
  const admittedSources = await readJsonl(resolve(ROOT, "data/external_sources/admitted_open_sources.jsonl"));
  const rejectedSources = await readJsonl(resolve(ROOT, "data/external_sources/rejected_open_sources.jsonl"));
  const externalCards = [
    ...(await readJsonl(resolve(ROOT, "data/culture_cards/external_r17_knowledge_cards.jsonl"))),
    ...(await readJsonl(resolve(ROOT, "data/culture_cards/external_r17_relation_graph.jsonl")))
  ];
  const cultureCards = await listFiles(resolve(ROOT, "data/culture_cards"), (file) => file.endsWith(".jsonl"));
  const cultureCardRows = (await Promise.all(cultureCards.map((file) => readJsonl(file)))).flat();
  const r17MemoryReport = await readJson(resolve(ARTIFACT_DIR, "r17_memory_contract_report.json"), {});
  const webgpuReport = await readJson(resolve(ARTIFACT_DIR, "webgpu_readiness_report.json"), {});
  const personal200m = await readJson(resolve(ARTIFACT_DIR, "personal_200m_candidate_models.json"), []);

  const dialogRulesChangedRecent = commitRange.includes("dialog_rules") || false;
  const answerIndexHits = await grepTracked("answerIndex");
  const rawPrivateCommitted = trackedFiles.filter((file) => /\.(pdf|docx)$/i.test(file));
  const localPathHits = await grepTracked("/Users/jarlgiovanni");

  const claimsVerified = [];
  const claimsFalseOrUnproven = [];
  if (branch === "main") claimsVerified.push("working branch is main");
  else claimsFalseOrUnproven.push(`working branch is ${branch}`);
  if (missingClaimedScripts.length === 0) claimsVerified.push("claimed R17 gate scripts exist");
  else claimsFalseOrUnproven.push(`missing package scripts: ${missingClaimedScripts.join(", ")}`);
  if (/visibleUiExchangeTurns:\s*4/.test(internalMemory) && /internalRuntimeExchangeTurns:\s*16/.test(internalMemory)) {
    claimsVerified.push("16-turn internal runtime memory and 4-turn UI constants exist in code");
  } else {
    claimsFalseOrUnproven.push("memory constants not verified in code");
  }
  if (r17MemoryReport.ok === true) claimsVerified.push("R17 memory eval report exists and passed");
  else claimsFalseOrUnproven.push("R17 memory eval report missing or not passed");
  if (r17Metrics?.blind?.domain_accuracy !== undefined || r17Metrics?.metrics?.blind) {
    claimsVerified.push("controlled gate metrics report exists");
  } else {
    claimsFalseOrUnproven.push("controlled gate metrics not proven by artifact");
  }
  if (existsSync(gateModel) && fileSize(gateModel) > 0) claimsVerified.push("local ignored controlled gate artifact exists");
  else claimsFalseOrUnproven.push("controlled gate artifact missing or not generated");
  if (existsSync(exportedGate)) claimsVerified.push("exported web controlled gate model exists");
  else claimsFalseOrUnproven.push("controlled gate not exported into public runtime");
  if (/answerCultureQuery|solveChineseArithmetic|solveArithmetic|internal_session_memory/.test(operationLayer)) {
    claimsVerified.push("operation layer uses deterministic culture/solver/session mechanisms");
  } else {
    claimsFalseOrUnproven.push("operation layer runtime usage not proven");
  }
  if (webgpuReport?.webgpu?.available === true || webgpuReport?.shell_probe?.webgpu_available === true) {
    claimsVerified.push("WebGPU availability reported");
  } else {
    claimsFalseOrUnproven.push("WebGPU unavailable or only negative shell report exists");
  }
  if (Array.isArray(personal200m) && personal200m.length > 0) claimsVerified.push("personal 100M-200M candidate audit exists");
  else claimsFalseOrUnproven.push("personal 100M-200M audit missing");

  const report = {
    generated_at: new Date().toISOString(),
    commit_range: commitRange.split(/\n/).at(-1) + ".." + commitRange.split(/\n/)[0],
    branch,
    status_short: status,
    branch_list: branches.split(/\n/).map((line) => line.trim()).filter(Boolean),
    claims_verified: claimsVerified,
    claims_false_or_unproven: claimsFalseOrUnproven,
    training_depth: {
      path_coverage_score: 0.82,
      data_training_score: reasoningRows.length >= 50000 ? 0.8 : reasoningRows.length >= 2000 ? 0.35 : 0.1,
      model_training_score: existsSync(gateModel) ? 0.55 : 0.15,
      webgpu_reality_score: webgpuReport?.real_browser_benchmark ? 0.8 : 0.1,
      external_data_score: externalCards.length >= 5000 ? 0.75 : externalCards.length >= 100 ? 0.25 : 0.1,
      mini_web_llm_score: existsSync(exportedGate) ? 0.45 : 0.3
    },
    controlled_gate: {
      rows: r17Metrics?.rows || r17Metrics?.dataset?.rows || 0,
      splits: splitCounts(reasoningRows),
      metrics: r17Metrics?.blind || r17Metrics?.metrics?.blind || r17Metrics || {},
      artifact_exists: existsSync(gateModel),
      exported_artifact_exists: existsSync(exportedGate),
      runtime_used: /controlledGate|controlled_gate|classifyControlledGate|predictControlledGate/.test(operationLayer)
    },
    memory_contract: {
      ui_visible_turns: /visibleUiExchangeTurns:\s*4/.test(internalMemory) ? 4 : null,
      internal_runtime_turns: /internalRuntimeExchangeTurns:\s*16/.test(internalMemory) ? 16 : null,
      verified_by_code: /visibleUiExchangeTurns:\s*4/.test(internalMemory) && /internalRuntimeExchangeTurns:\s*16/.test(internalMemory),
      verified_by_eval: r17MemoryReport.ok === true,
      docs_claim_active_runtime_memory: /not merely a training target|不是只用于训练/.test(shortContext)
    },
    sources: {
      open_registry_rows: openSources.length,
      admitted_rows: admittedSources.length,
      rejected_rows: rejectedSources.length,
      admitted_by_license: countBy(admittedSources, (row) => row.license_name)
    },
    external_knowledge: {
      r17_external_rows: externalCards.length,
      all_culture_rows: cultureCardRows.length,
      public_runtime_external_rows: externalCards.filter((row) => row.approved_for_public_runtime === true).length
    },
    forbidden_scan: {
      raw_pdf_docx_committed: rawPrivateCommitted,
      answer_index_hits: answerIndexHits.split(/\n/).filter(Boolean).slice(0, 20),
      local_path_hits: localPathHits.split(/\n/).filter(Boolean).slice(0, 20),
      dialog_rules_changed_recent: dialogRulesChangedRecent
    },
    package_scripts_claimed: scripts.filter((script) => /r17|controlled|webgpu|external|persona|reasoning/.test(script)).sort(),
    verdict:
      reasoningRows.length >= 50000 && externalCards.length >= 5000 && existsSync(exportedGate)
        ? "mini_web_llm_progress"
        : existsSync(gateModel) && reasoningRows.length >= 2000
          ? "partial_real_training"
          : "scaffold_heavy"
  };

  await writeJson(REPORT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

