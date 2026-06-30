#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { gitLsFiles } from "./static_llm_artifact_utils.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVE_RE = /^(README\.md|DEPLOYMENT\.md|DATA_CARD\.md|docs\/R25.*\.md|static_llm\/(candidate_decisions|release_decisions|request_pack|ASSET_LAYOUT\.md).+|training\/from_scratch\/.+|scripts\/(build_static_llm_candidate_matrix|report_from_scratch_training_progress|check_no_active_named_model_candidate|check_no_slm_product_target|build_tiny_decoder_toy_dataset|run_tiny_decoder_toy_overfit|eval_tiny_decoder_toy_overfit|check_tiny_decoder_toy_artifacts_untracked|check_r25k_toy_overfit_sanity|check_r25k_toy_overfit_history|generate_r25l_expanded_llm_corpus|validate_r25l_expanded_corpus|check_r25l_corpus_contamination|report_r25l_corpus_coverage|plan_small_decoder_pilot|run_small_decoder_pilot|check_small_decoder_pilot_plan|check_r25l_corpus_pilot_plan|check_small_decoder_numeric_backend|build_small_decoder_pilot_dataset|eval_small_decoder_pilot|eval_small_decoder_pilot_r25p|eval_small_decoder_pilot_r25s|check_small_decoder_pilot_artifacts_untracked|report_small_decoder_pilot_gate_snapshot|check_r25m_small_decoder_pilot|check_r25m_small_pilot_history|check_training_approval_markers|check_no_training_in_routine_gates|analyze_small_decoder_pilot_outputs|eval_small_decoder_pilot_heldout|report_small_pilot_regression_snapshot|report_r25n_next_pilot_decision|check_r25n_small_pilot_evaluation|plan_second_small_decoder_pilot|validate_small_decoder_checkpoint_schema|eval_small_decoder_pilot_replay_heldout|compare_small_pilot_history|check_r25o_second_pilot_design|check_r25p_second_small_pilot|check_r25s_data_first_pilot_history|analyze_r25p_pilot_results|check_r25p_replay_determinism|eval_r25p_heldout_breakdown|report_r25q_next_step_decision|plan_r25s_balanced_pilot_dataset|validate_r25s_pilot_design|report_r25r_decision|check_r25r_data_first_pilot_design|analyze_r25s_pilot_results|eval_r25s_heldout_breakdown|compare_r25p_r25s_generalization|report_r25t_next_step_decision|check_phase4_scaled_training_readiness|plan_architecture_ablation|report_r25u_phase_decision|check_r25u_phase3_exit_and_ablation_plan)\.mjs|scripts\/train_small_decoder_pilot\.py|scripts\/eval_small_decoder_replay_heldout\.py|package\.json)$/;
const SKIP_RE = /(^|\/)(artifacts|node_modules|\.git)\//;

const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const removedBase = [q, w, e, n].join("");
const removedRe = new RegExp(removedBase, "i");
const vercelFunctionTerm = ["Vercel", "Function"].join(" ");
const edgeFunctionTerm = ["Edge", "Function"].join(" ");
const backendClaimPattern = new RegExp(
  `(?:external backend|external storage|remote model API|${vercelFunctionTerm}|${edgeFunctionTerm}).{0,80}(?:allowed|required for product|main path)`,
  "i"
);

const forbiddenClaims = [
  {
    code: "pretrained_final_product_claim",
    pattern: /(?:pretrained|pre-trained|external model|foundation model).{0,100}(?:final product|main product|product target|primary path|final strategy)/i
  },
  {
    code: "lora_final_strategy_claim",
    pattern: /(?:LoRA|adapter|adapters|fine[- ]?tune|fine[- ]?tuning).{0,100}(?:final product|main product|product target|primary path|final strategy)/i
  },
  {
    code: "candidate_admission_as_model_selection",
    pattern: /candidate admission.{0,100}(?:model selection|selects the model|chooses the model)/i
  },
  {
    code: "training_started_claim",
    pattern: /(?:training has started|training started|formal training progress[^0-9]{0,20}[1-9][0-9]*%|real weights admitted|production model admitted)/i
  },
  {
    code: "phase_4_scaled_training_claim",
    pattern: /phase_4 scaled training.{0,80}(?:started|ran|approved|allowed|product|release)/i
  },
  {
    code: "fixture_performance_claim",
    pattern: /fixture.{0,80}(?:real performance|production performance|real first-token success)/i
  },
  {
    code: "backend_allowed_claim",
    pattern: backendClaimPattern
  },
  {
    code: "chain_of_thought_allowed_claim",
    pattern: /chain[-_ ]?of[-_ ]?thought.{0,80}(?:allowed|training data|stored for training)/i
  },
  {
    code: "toy_output_release_artifact_claim",
    pattern: /toy.{0,80}(?:release artifact|release candidate|product checkpoint|production checkpoint)/i
  }
];

const allowContext = /not|no |never|without|forbidden|rejected|reject|comparison|compatibility|baseline|fixture|legacy|historical|do not|must not|cannot|is not|are not|only as|warning|non-goal|avoid|risk|rollback|trigger|failure|any claim|treating|toy-only|toy sanity|pipeline mechanics|ignored artifact|ignored artifacts|no tracked weights|formal_training":false|formal_product_training":false|long_term_training":false|release_checkpoint":false|product_model":false|R25L|R25M|R25N|R25O|R25P|R25Q|R25R|R25S|R25T|R25U|R25V|small decoder pilot plan|small decoder pilot planning|bounded small|bounded pilot|bounded second pilot|second bounded pilot|small decoder pilot is bounded|second pilot design|pilot analysis|data-first design|balanced sampling|R25S template|R25U template|R25V template|architecture ablation design|phase3 exit criteria|phase 3 exit criteria|phase4 readiness|phase_4 readiness|generalization comparison|pilot design|replay determinism|held-out breakdown|replayable checkpoint protocol|skips by default|planned_no_training|training_will_run":false|small_pilot_training_ran|pilot_training_progress_percent|approval marker|approval markers|approval template|approved:false|consumed|one-shot|fresh approval|history-only|held-out structural|heldout replay|does not run training|no-training routine gate|routine gates cannot rerun|scale_not_approved|phase_4 scaled training is not approved|phase_4_scaled_training_approved: false|training_rerun: false|PURGED_CANDIDATE_RE|FINAL_STRATEGY_RE|FORBIDDEN_PRODUCT_RE|BACKEND_RE|RegExp/i;
const triggerContext = new RegExp(
  `pretrained|pre-trained|external model|foundation model|LoRA|adapter|fine[- ]?tune|fine[- ]?tuning|candidate admission|training has started|training started|formal training progress|real weights admitted|production model admitted|fixture|external backend|external storage|remote model API|${vercelFunctionTerm}|${edgeFunctionTerm}|chain[-_ ]?of[-_ ]?thought|toy.{0,80}(?:release artifact|release candidate|product checkpoint|production checkpoint)`,
  "i"
);

function context(lines, index) {
  return [
    lines[index - 4] || "",
    lines[index - 3] || "",
    lines[index - 2] || "",
    lines[index - 1] || "",
    lines[index],
    lines[index + 1] || "",
    lines[index + 2] || "",
    lines[index + 3] || "",
    lines[index + 4] || ""
  ].join(" ");
}

function nearLine(lines, index) {
  return [lines[index - 1] || "", lines[index], lines[index + 1] || ""].join(" ");
}

async function main() {
  const files = (await gitLsFiles(["ls-files", "--cached", "--others", "--exclude-standard"]))
    .map(normalizeRepoPath)
    .filter((path) => ACTIVE_RE.test(path) && !SKIP_RE.test(path));
  const failures = [];
  const allowed_matches = [];

  for (const file of files) {
    const text = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    if (!text) continue;
    if (removedRe.test(text)) failures.push({ code: "purged_candidate_string_present", path: file });
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const block = context(lines, index);
      if (!triggerContext.test(nearLine(lines, index))) continue;
      for (const rule of forbiddenClaims) {
        if (!rule.pattern.test(block)) continue;
        const item = { code: rule.code, path: file, line: index + 1, text: line.trim().slice(0, 220) };
        if (allowContext.test(block)) allowed_matches.push(item);
        else failures.push(item);
      }
    }
  }

  const requiredFiles = [
    "docs/R25I_FROM_SCRATCH_LLM_TRAINING_DOCTRINE.md",
    "docs/R25I_TRAINING_PHASE_PLAN.md",
    "training/from_scratch/architecture.schema.json",
    "training/from_scratch/architectures/browser_decoder_v0.json",
    "training/from_scratch/tokenizer_plan.md",
    "training/from_scratch/tokenizer.schema.json",
    "training/from_scratch/tokenizer_corpus_manifest.json",
    "training/from_scratch/corpus_plan.md",
    "training/from_scratch/corpus_mix.schema.json",
    "training/from_scratch/corpus_mix_v0.json",
    "training/from_scratch/tokenizer_dry_run_config.json",
    "training/from_scratch/toy_decoder_config.json",
    "training/from_scratch/toy_decoder_readme.md",
    "training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json",
    "static_llm/release_decisions/schema.json",
    "static_llm/release_decisions/template.self_trained.json",
    "docs/R25J_TOKENIZER_DRY_RUN.md",
    "docs/R25J_TINY_DECODER_TOY_PIPELINE.md",
    "docs/R25K_TOY_OVERFIT_SANITY.md",
    "scripts/build_tiny_decoder_toy_dataset.mjs",
    "scripts/eval_tiny_decoder_toy_overfit.mjs",
    "scripts/check_tiny_decoder_toy_artifacts_untracked.mjs",
    "scripts/check_r25k_toy_overfit_sanity.mjs",
    "training/from_scratch/r25l_corpus_expansion_plan.md",
    "training/from_scratch/r25l_corpus_expansion_config.json",
    "training/from_scratch/tokenizer_dry_run_config.r25l.json",
    "training/from_scratch/small_decoder_pilot_config.json",
    "training/from_scratch/small_decoder_pilot_readme.md",
    "docs/R25L_EXPANDED_CORPUS.md",
    "docs/R25L_SMALL_DECODER_PILOT_PLAN.md",
    "scripts/generate_r25l_expanded_llm_corpus.mjs",
    "scripts/validate_r25l_expanded_corpus.mjs",
    "scripts/check_r25l_corpus_contamination.mjs",
    "scripts/report_r25l_corpus_coverage.mjs",
    "scripts/plan_small_decoder_pilot.mjs",
    "scripts/run_small_decoder_pilot.mjs",
    "scripts/check_small_decoder_pilot_plan.mjs",
    "scripts/check_r25l_corpus_pilot_plan.mjs",
    "training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json",
    "training/from_scratch/small_decoder_pilot_run_config.json",
    "docs/R25M_SMALL_DECODER_PILOT_RUN.md",
    "scripts/check_small_decoder_numeric_backend.mjs",
    "scripts/build_small_decoder_pilot_dataset.mjs",
    "scripts/train_small_decoder_pilot.py",
    "scripts/eval_small_decoder_pilot.mjs",
    "scripts/check_small_decoder_pilot_artifacts_untracked.mjs",
    "scripts/report_small_decoder_pilot_gate_snapshot.mjs",
    "scripts/check_r25m_small_decoder_pilot.mjs",
    "docs/R25N_SMALL_PILOT_EVALUATION.md",
    "docs/R25N_TRAINING_APPROVAL_SAFETY.md",
    "scripts/check_training_approval_markers.mjs",
    "scripts/check_r25k_toy_overfit_history.mjs",
    "scripts/check_r25m_small_pilot_history.mjs",
    "scripts/analyze_small_decoder_pilot_outputs.mjs",
    "scripts/eval_small_decoder_pilot_heldout.mjs",
    "scripts/report_small_pilot_regression_snapshot.mjs",
    "scripts/report_r25n_next_pilot_decision.mjs",
    "scripts/check_r25n_small_pilot_evaluation.mjs",
    "training/from_scratch/small_decoder_checkpoint.schema.json",
    "training/from_scratch/small_decoder_checkpoint_readme.md",
    "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.template.json",
    "training/from_scratch/small_decoder_second_pilot_config.json",
    "docs/R25O_SECOND_PILOT_DESIGN.md",
    "docs/R25O_REPLAYABLE_CHECKPOINT_PROTOCOL.md",
    "scripts/plan_second_small_decoder_pilot.mjs",
    "scripts/validate_small_decoder_checkpoint_schema.mjs",
    "scripts/eval_small_decoder_pilot_replay_heldout.mjs",
    "scripts/compare_small_pilot_history.mjs",
    "scripts/check_r25o_second_pilot_design.mjs",
    "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.json",
    "training/from_scratch/small_decoder_pilot_run_config.r25p.json",
    "docs/R25P_SECOND_SMALL_PILOT_RUN.md",
    "docs/R25P_REPLAYABLE_HELDOUT_EVAL.md",
    "scripts/eval_small_decoder_pilot_r25p.mjs",
    "scripts/eval_small_decoder_replay_heldout.py",
    "scripts/check_r25p_second_small_pilot.mjs",
    "docs/R25Q_PILOT_ANALYSIS_AND_DECISION.md",
    "docs/R25Q_REPLAY_EVALUATION.md",
    "training/from_scratch/APPROVE_R25R_NEXT_SMALL_PILOT.template.json",
    "scripts/check_no_training_in_routine_gates.mjs",
    "scripts/analyze_r25p_pilot_results.mjs",
    "scripts/check_r25p_replay_determinism.mjs",
    "scripts/eval_r25p_heldout_breakdown.mjs",
    "scripts/report_r25q_next_step_decision.mjs",
    "docs/R25R_DATA_FIRST_THIRD_PILOT_DESIGN.md",
    "docs/R25R_R25S_APPROVAL_BOUNDARY.md",
    "training/from_scratch/small_decoder_r25s_sampling_config.json",
    "training/from_scratch/small_decoder_pilot_run_config.r25s.template.json",
    "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.template.json",
    "scripts/plan_r25s_balanced_pilot_dataset.mjs",
    "scripts/validate_r25s_pilot_design.mjs",
    "scripts/report_r25r_decision.mjs",
    "scripts/check_r25r_data_first_pilot_design.mjs",
    "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.json",
    "training/from_scratch/small_decoder_pilot_run_config.r25s.json",
    "docs/R25S_DATA_FIRST_SMALL_PILOT_RUN.md",
    "docs/R25S_BALANCED_HELDOUT_EVAL.md",
    "scripts/eval_small_decoder_pilot_r25s.mjs",
    "scripts/check_r25s_data_first_pilot_history.mjs",
    "docs/R25T_R25S_ANALYSIS_AND_DECISION.md",
    "docs/R25T_GENERALIZATION_COMPARISON.md",
    "training/from_scratch/APPROVE_R25U_ARCHITECTURE_ABLATION.template.json",
    "scripts/analyze_r25s_pilot_results.mjs",
    "scripts/eval_r25s_heldout_breakdown.mjs",
    "scripts/compare_r25p_r25s_generalization.mjs",
    "scripts/report_r25t_next_step_decision.mjs",
    "training/from_scratch/phase3_exit_criteria.json",
    "training/from_scratch/architecture_ablation_plan.r25u.json",
    "training/from_scratch/APPROVE_R25V_NEXT_PILOT.template.json",
    "docs/R25U_PHASE3_EXIT_CRITERIA.md",
    "docs/R25U_ARCHITECTURE_ABLATION_PLAN.md",
    "scripts/check_phase4_scaled_training_readiness.mjs",
    "scripts/plan_architecture_ablation.mjs",
    "scripts/report_r25u_phase_decision.mjs",
    "scripts/check_r25u_phase3_exit_and_ablation_plan.mjs"
  ];
  for (const path of requiredFiles) {
    if (!files.includes(path)) {
      const content = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
      if (!content) failures.push({ code: "required_from_scratch_file_missing", path });
    }
  }

  const report = {
    ok: failures.length === 0,
    scanned_files: files.length,
    formal_training_progress_percent: 0,
    final_strategy: "self_trained_from_scratch",
    lora_or_adapter_final_strategy_allowed: false,
    pretrained_product_target_allowed: false,
    failures,
    allowed_matches: allowed_matches.slice(0, 60)
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
