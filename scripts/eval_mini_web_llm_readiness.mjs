#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/mini_web_llm_readiness_report.json");

async function exists(path) {
  try {
    await access(resolve(ROOT, path), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, fallback = {}) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return fallback;
  }
}

function clamp(value) {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function passScore(condition, value = 1) {
  return condition ? value : 0;
}

async function main() {
  const r9 = await readJson("artifacts/training_os/r9_regression_report.json");
  const r10 = await readJson("artifacts/training_os/r10_culture_report.json");
  const r11 = await readJson("artifacts/training_os/r11_reasoning_report.json");
  const r13 = await readJson("artifacts/training_os/r13_coverage_report.json");
  const cultureCoverage = await readJson("artifacts/training_os/r12b_culture_coverage_audit.json");
  const trainingDepth = await readJson("artifacts/training_os/training_depth_audit_report.json");
  const personaPrivacy = await readJson("artifacts/training_os/persona_privacy_validation_report.json");
  const personalFacts = await readJson("artifacts/training_os/personal_facts_validation_report.json");

  const files = {
    cultureRuntime: await exists("web/culture_runtime.js"),
    cultureCards: await exists("web/culture_cards.generated.js"),
    operationLayer: await exists("web/operation_layer.js"),
    microSolvers: await exists("web/micro_solvers.js"),
    draftVerifier: await exists("web/draft_verifier.js"),
    coverageGate: await exists("web/coverage_gate.js"),
    reasoningTrace: await exists("web/reasoning_trace.js"),
    shortContext: await exists("web/compact_context.js"),
    personaDocs: await exists("docs/persona_layer_design.md"),
    personalFactSchema: await exists("docs/personal_fact_card_schema.md"),
    controlledGateModel: await exists("web/controlled_gate_model.generated.js"),
    sourceRegistry: await exists("data/external_sources/open_dataset_registry.jsonl"),
    licensePolicy: await exists("docs/source_license_policy.md"),
    browserProfile: await exists("docs/browser_mini_web_llm_profile.md")
  };

  const scores = {
    knowledge_coverage: clamp(
      passScore(files.cultureRuntime, 0.2) +
        passScore(files.cultureCards, 0.2) +
        passScore(Boolean(r10?.ok), 0.2) +
        passScore(Boolean(r13?.ok), 0.2) +
        passScore(Boolean(cultureCoverage?.domains || cultureCoverage?.coverage_by_domain), 0.2)
    ),
    reasoning_coverage: clamp(
      passScore(files.microSolvers, 0.25) +
        passScore(files.reasoningTrace, 0.2) +
        passScore(Boolean(r11?.ok), 0.25) +
        passScore(await exists("artifacts/training_os/reasoning_trace_training_report.json"), 0.15) +
        passScore(await exists("artifacts/training_os/coverage_trace_training_report.json"), 0.15)
    ),
    culture_graph_coverage: clamp(
      passScore(files.coverageGate, 0.2) +
        passScore(await exists("data/culture_cards/r13_relation_gap_cards.jsonl"), 0.2) +
        passScore(Boolean(r13?.summary?.anchor_only_failures === 0), 0.2) +
        passScore(Boolean(r13?.summary?.missing_entity_count === 0), 0.2) +
        passScore(Boolean(r13?.summary?.missing_period_count === 0), 0.2)
    ),
    personal_method_layer: clamp(
      passScore(files.personaDocs, 0.25) +
        passScore(files.personalFactSchema, 0.2) +
        passScore(Boolean(personaPrivacy?.high_risk === 0), 0.2) +
        passScore(Boolean(personalFacts?.issues === 0), 0.2) +
        passScore(await exists("evals/persona/reasoning_with_persona.jsonl"), 0.15)
    ),
    verifier_coverage: clamp(
      passScore(files.draftVerifier, 0.25) +
        passScore(files.coverageGate, 0.25) +
        passScore(Boolean(r9?.ok), 0.15) +
        passScore(Boolean(r10?.ok), 0.15) +
        passScore(Boolean(r11?.ok), 0.2)
    ),
    browser_inference_readiness: clamp(
      passScore(files.shortContext, 0.25) +
        passScore(files.controlledGateModel, 0.25) +
        passScore(files.browserProfile, 0.25) +
        passScore(await exists("web/tiny_router_model.generated.js"), 0.25)
    ),
    license_provenance_readiness: clamp(
      passScore(files.sourceRegistry, 0.35) +
        passScore(files.licensePolicy, 0.35) +
        passScore(await exists("artifacts/training_os/source_license_report.json"), 0.15) +
        passScore(await exists("artifacts/training_os/source_notice_report.md"), 0.15)
    ),
    training_depth: clamp(
      passScore(trainingDepth?.verdict === "controlled_training", 0.45) +
        passScore(trainingDepth?.verdict === "data_expansion", 0.25) +
        passScore(Number(trainingDepth?.data_training_score || 0), 0.2) +
        passScore(Number(trainingDepth?.model_training_score || 0), 0.1)
    ),
    blackbox_generalization: clamp(
      passScore(await exists("artifacts/training_os/r12b_initial_blackbox_probe.json"), 0.25) +
        passScore(await exists("artifacts/training_os/r12b_blackbox_loop_report.json"), 0.25) +
        passScore(Boolean(r13?.ok), 0.25) +
        passScore(Boolean(r9?.ok), 0.25)
    ),
    runtime_profile_readiness: clamp(
      passScore(files.operationLayer, 0.2) +
        passScore(files.shortContext, 0.2) +
        passScore(files.browserProfile, 0.2) +
        passScore(await exists("artifacts/training_os/browser_profile_budget_report.json"), 0.2) +
        passScore(files.controlledGateModel, 0.2)
    )
  };

  const average = clamp(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length);
  const verdict =
    average >= 0.85 && files.controlledGateModel
      ? "mini_web_llm_profile_candidate"
      : average >= 0.65
        ? "hybrid_runtime_with_missing_training_or_browser_profile"
        : "deterministic_hybrid_runtime";

  const report = {
    ok: true,
    scores,
    average,
    verdict,
    files,
    blockers: [
      !files.sourceRegistry ? "open dataset registry missing" : "",
      !files.licensePolicy ? "source license policy missing" : "",
      !files.controlledGateModel ? "controlled gate model artifact missing" : "",
      !files.browserProfile ? "browser profile audit missing" : ""
    ].filter(Boolean),
    note: "This readiness score is a product/runtime audit. It does not claim free-generative LLM training."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
