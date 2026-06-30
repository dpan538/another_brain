#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MARKERS = [
  {
    id: "r25k_toy_overfit",
    path: "training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json",
    expectedScope: "toy_overfit_sanity_only",
    expectedPhase: "phase_2_tiny_overfit_sanity",
    consumedByCommit: "0a3b5a65f4a28e09aed66aa2cd722608a2b377ba",
    trainingFlagKeys: []
  },
  {
    id: "r25m_small_decoder_pilot",
    path: "training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json",
    expectedScope: "small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "56613c64ef2c7400f13be051030c09883877fa5d",
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25p_second_small_pilot_template",
    path: "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.template.json",
    expectedScope: "second_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25p_second_small_pilot",
    path: "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.json",
    expectedScope: "second_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "pending_r25p_commit",
    expectedRunId: "r25p_more_sequences_128",
    expectedVariantId: "r25p_more_sequences_128",
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25r_next_small_pilot_template",
    path: "training/from_scratch/APPROVE_R25R_NEXT_SMALL_PILOT.template.json",
    expectedScope: "next_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25s_data_first_pilot_template",
    path: "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.template.json",
    expectedScope: "data_first_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25s_data_first_balanced_192",
    expectedVariantId: "r25s_data_first_balanced_192",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25s_data_first_pilot",
    path: "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.json",
    expectedScope: "data_first_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "pending_r25s_commit",
    expectedRunId: "r25s_data_first_balanced_192",
    expectedVariantId: "r25s_data_first_balanced_192",
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25u_architecture_ablation_template",
    path: "training/from_scratch/APPROVE_R25U_ARCHITECTURE_ABLATION.template.json",
    expectedScope: "architecture_ablation_design_or_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training", "allow_architecture_ablation_training"]
  }
];

const SECRET_RE = /(?:BEGIN PRIVATE KEY|api[_-]?key|secret|token|password|\/Users\/[^/\s]+|[A-Za-z]:\\Users\\)/i;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function markerAllowsTraining(marker, spec) {
  if (!marker?.approved || marker.consumed === true) return false;
  if (spec.template || spec.path.endsWith(".template.json")) return false;
  if (spec.id === "r25k_toy_overfit") return marker.scope === spec.expectedScope;
  return spec.trainingFlagKeys.some((key) => marker[key] === true);
}

function markerSummary(spec, marker, failures) {
  return {
    id: spec.id,
    path: spec.path,
    approved: marker?.approved === true,
    consumed: marker?.consumed === true,
    allow_additional_runs: marker?.allow_additional_runs === true,
    template: spec.template === true,
    active_training_approval: markerAllowsTraining(marker, spec),
    active_product_training_approval: marker?.consumed !== true && marker?.allow_product_model_training === true,
    active_weight_commit_approval: marker?.consumed !== true && marker?.allow_weight_commit === true,
    consumed_by_commit: marker?.consumed_by_commit || null,
    failures: failures.filter((failure) => failure.marker === spec.id)
  };
}

async function main() {
  const failures = [];
  const summaries = [];
  let activeTraining = 0;
  let activeProductTraining = 0;
  let activeWeightCommit = 0;

  for (const spec of MARKERS) {
    const marker = await readJson(spec.path).catch((error) => {
      failures.push({ marker: spec.id, code: "approval_marker_missing_or_invalid_json", path: spec.path, detail: error.message });
      return null;
    });
    if (!marker) {
      summaries.push(markerSummary(spec, marker, failures));
      continue;
    }

    if (marker.scope !== spec.expectedScope) failures.push({ marker: spec.id, code: "scope_mismatch", expected: spec.expectedScope, actual: marker.scope });
    if (marker.phase !== spec.expectedPhase) failures.push({ marker: spec.id, code: "phase_mismatch", expected: spec.expectedPhase, actual: marker.phase });
    if (spec.expectedRunId && marker.run_id !== spec.expectedRunId) failures.push({ marker: spec.id, code: "run_id_mismatch", expected: spec.expectedRunId, actual: marker.run_id });
    if (spec.expectedVariantId && marker.variant_id !== spec.expectedVariantId) failures.push({ marker: spec.id, code: "variant_id_mismatch", expected: spec.expectedVariantId, actual: marker.variant_id });
    if (spec.template) {
      if (marker.approved !== false) failures.push({ marker: spec.id, code: "template_must_not_be_approved" });
      for (const key of spec.trainingFlagKeys) {
        if (marker[key] !== false) failures.push({ marker: spec.id, code: "template_training_flag_must_be_false", key });
      }
      if (marker.reviewer !== "") failures.push({ marker: spec.id, code: "template_reviewer_must_be_blank" });
      if (!spec.path.endsWith(".template.json")) failures.push({ marker: spec.id, code: "template_path_must_end_template_json" });
    } else {
      if (marker.consumed !== true) failures.push({ marker: spec.id, code: "approval_marker_not_consumed" });
      if (marker.allow_additional_runs !== false) failures.push({ marker: spec.id, code: "allow_additional_runs_must_be_false" });
      if (marker.consumed_by_commit !== spec.consumedByCommit) {
        failures.push({ marker: spec.id, code: "consumed_by_commit_mismatch", expected: spec.consumedByCommit, actual: marker.consumed_by_commit });
      }
      if (!String(marker.consumed_reason || "").includes("future runs require a new approval marker")) {
        failures.push({ marker: spec.id, code: "consumed_reason_missing_new_marker_requirement" });
      }
    }
    if (marker.allow_weight_commit !== false) failures.push({ marker: spec.id, code: "allow_weight_commit_must_be_false" });
    if (marker.allow_long_term_training !== false) failures.push({ marker: spec.id, code: "allow_long_term_training_must_be_false" });
    if (marker.allow_product_model_training !== false) failures.push({ marker: spec.id, code: "allow_product_model_training_must_be_false" });
    if (spec.id.includes("r25s") && marker.allow_phase_4_scaled_training === true) failures.push({ marker: spec.id, code: "allow_phase_4_scaled_training_must_not_be_true" });
    if (marker.allow_release_checkpoint === true) failures.push({ marker: spec.id, code: "allow_release_checkpoint_must_not_be_true" });
    if (SECRET_RE.test(JSON.stringify(marker))) failures.push({ marker: spec.id, code: "private_path_or_secret_marker_present" });

    const trainingActive = markerAllowsTraining(marker, spec);
    const productActive = marker.consumed !== true && marker.allow_product_model_training === true;
    const weightActive = marker.consumed !== true && marker.allow_weight_commit === true;
    if (trainingActive) activeTraining += 1;
    if (productActive) activeProductTraining += 1;
    if (weightActive) activeWeightCommit += 1;
    summaries.push(markerSummary(spec, marker, failures));
  }

  if (activeTraining !== 0) failures.push({ code: "active_training_approval_count_must_be_zero", activeTraining });
  if (activeProductTraining !== 0) failures.push({ code: "active_product_training_approval_count_must_be_zero", activeProductTraining });
  if (activeWeightCommit !== 0) failures.push({ code: "active_weight_commit_approval_count_must_be_zero", activeWeightCommit });

  const report = {
    ok: failures.length === 0,
    markers: summaries,
    active_training_approval_count: activeTraining,
    active_product_training_approval_count: activeProductTraining,
    active_weight_commit_approval_count: activeWeightCommit,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
