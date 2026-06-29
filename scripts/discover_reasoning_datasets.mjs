#!/usr/bin/env node
import { resolve } from "node:path";

import { ARTIFACT_DIR, ROOT, writeJson, writeJsonl } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "data/external_sources/reasoning_dataset_registry.jsonl");
const REPORT = resolve(ARTIFACT_DIR, "r18_reasoning_dataset_discovery_report.json");

function candidate(patch) {
  return {
    source_id: "",
    name: "",
    homepage_url: "",
    data_url: "",
    license_name: "",
    license_url: "",
    license_confidence: "unclear",
    task_types: [],
    languages: ["en"],
    allowed_uses: {
      training_examples: false,
      model_weights: false,
      public_runtime: false,
      metadata_only: true,
      local_only: true
    },
    copyright_risk: "medium",
    share_alike_required: false,
    noncommercial_only: false,
    no_derivatives: false,
    attribution_required: false,
    sample_cap: 0,
    admission_status: "candidate",
    rejection_reason: "",
    notes: "",
    ...patch
  };
}

const rows = [
  candidate({
    source_id: "src_gsm8k_mit",
    name: "GSM8K / Grade School Math",
    homepage_url: "https://github.com/openai/grade-school-math",
    data_url: "https://raw.githubusercontent.com/openai/grade-school-math/master/grade_school_math/data/train.jsonl",
    license_name: "MIT",
    license_url: "https://github.com/openai/grade-school-math/blob/master/LICENSE",
    license_confidence: "verified",
    task_types: ["arithmetic", "math_word_problem"],
    allowed_uses: { training_examples: true, model_weights: true, public_runtime: false, metadata_only: false, local_only: false },
    copyright_risk: "low",
    sample_cap: 1200,
    admission_status: "admitted",
    notes: "Use only question and final numeric answer; do not import chain-of-thought rationale."
  }),
  candidate({
    source_id: "src_bigbench_apache2",
    name: "BIG-Bench / BBH",
    homepage_url: "https://github.com/google/BIG-bench",
    data_url: "https://github.com/google/BIG-bench/tree/main/bigbench/benchmark_tasks",
    license_name: "Apache-2.0",
    license_url: "https://github.com/google/BIG-bench/blob/main/LICENSE",
    license_confidence: "verified",
    task_types: ["logic", "symbolic", "reasoning_benchmark"],
    allowed_uses: { training_examples: true, model_weights: true, public_runtime: false, metadata_only: false, local_only: false },
    copyright_risk: "low",
    attribution_required: true,
    sample_cap: 800,
    admission_status: "admitted",
    notes: "Admitted for task metadata and short benchmark examples after importer strips long prompts."
  }),
  candidate({
    source_id: "src_babi_facebook_research",
    name: "bAbI tasks",
    homepage_url: "https://research.facebook.com/downloads/babi/",
    data_url: "https://research.facebook.com/downloads/babi/",
    license_name: "BSD-style research license / unclear current terms",
    license_url: "https://research.facebook.com/downloads/babi/",
    license_confidence: "likely",
    task_types: ["logic", "reading_reasoning", "memory"],
    sample_cap: 0,
    admission_status: "candidate",
    rejection_reason: "Candidate until current redistributable license terms are verified outside dataset mirrors.",
    notes: "Do not import until license proof is pinned."
  }),
  candidate({
    source_id: "src_proofwriter_mit",
    name: "ProofWriter",
    homepage_url: "https://github.com/allenai/proofwriter",
    data_url: "https://github.com/allenai/proofwriter",
    license_name: "Apache-2.0",
    license_url: "https://github.com/allenai/proofwriter/blob/main/LICENSE",
    license_confidence: "verified",
    task_types: ["logical_reasoning", "proof_verification"],
    allowed_uses: { training_examples: true, model_weights: true, public_runtime: false, metadata_only: false, local_only: false },
    copyright_risk: "low",
    attribution_required: true,
    sample_cap: 500,
    admission_status: "admitted",
    notes: "Use synthetic-like logical triples and final labels only; no long explanations."
  }),
  candidate({
    source_id: "src_project_synthetic_reasoning_cc0",
    name: "Project-generated synthetic reasoning set",
    homepage_url: "https://github.com/dpan538/another_brain",
    data_url: "artifacts/training_os/r18_reasoning_trace_training.jsonl",
    license_name: "Project local CC0-equivalent synthetic rows",
    license_url: "docs/source_license_policy.md",
    license_confidence: "verified",
    task_types: ["arithmetic", "syllogism", "transitive", "set_quantifier", "memory_binding"],
    languages: ["en", "zh"],
    allowed_uses: { training_examples: true, model_weights: true, public_runtime: false, metadata_only: false, local_only: false },
    copyright_risk: "low",
    sample_cap: 50000,
    admission_status: "admitted",
    notes: "Rows are generated locally from templates, not copied from external corpora; counted separately from external rows."
  }),
  ...[
    ["src_ai2_arc", "AI2 ARC", "https://allenai.org/data/arc", "science_reasoning", "License terms require additional review before training use."],
    ["src_openbookqa", "OpenBookQA", "https://allenai.org/data/open-book-qa", "science_reasoning", "License needs pinned proof and passage copyright review."],
    ["src_strategyqa", "StrategyQA", "https://allenai.org/data/strategyqa", "commonsense_reasoning", "License and decomposition data terms require review."],
    ["src_commonsenseqa", "CommonsenseQA", "https://www.tau-nlp.sites.tau.ac.il/commonsenseqa", "commonsense_reasoning", "Often distributed for research; public model-weight use unclear."],
    ["src_openmathinstruct", "OpenMathInstruct", "https://github.com/kunalghosh/OpenMathInstruct", "math_reasoning", "Dataset license and source mix need row-level provenance audit."],
    ["src_math23k", "Math23K", "https://aclanthology.org/D17-1088/", "chinese_math", "Publication dataset license unclear for model training."],
    ["src_reclor", "ReClor", "https://whyu.me/reclor/", "logical_reasoning", "Contest-style passages may be copyrighted; reject until terms clear."],
    ["src_logiqa", "LogiQA", "https://github.com/lgw863/LogiQA-dataset", "logical_reasoning", "License and source text rights unclear."],
    ["src_clutrr", "CLUTRR", "https://github.com/facebookresearch/clutrr", "relation_reasoning", "License needs current proof."],
    ["src_mathqa", "MathQA", "https://math-qa.github.io/math-QA/", "math_reasoning", "License and source rights unclear."],
    ["src_svamp", "SVAMP", "https://github.com/arkilpatel/SVAMP", "math_reasoning", "License needs review before model-weight use."],
    ["src_asdiv", "ASDiv", "https://github.com/chaochun/nlu-asdiv-dataset", "math_reasoning", "License needs review."],
    ["src_multiarith", "MultiArith", "https://github.com/allenai/arithmetic", "math_reasoning", "License needs pinned proof."],
    ["src_mawps", "MAWPS", "https://github.com/sroy9/mawps", "math_reasoning", "License/source mix unclear."],
    ["src_aqua_rat", "AQuA-RAT", "https://github.com/google-deepmind/AQuA", "math_reasoning", "License and rationale text policy need review."],
    ["src_drop", "DROP", "https://allennlp.org/drop", "reading_reasoning", "Passage copyright and license require careful filtering."],
    ["src_boolq", "BoolQ", "https://github.com/google-research-datasets/boolean-questions", "reading_reasoning", "Wikipedia-derived; downstream obligations need review."],
    ["src_piqa", "PIQA", "https://yonatanbisk.com/piqa/", "physical_reasoning", "License/model-weight status needs review."],
    ["src_hellaswag", "HellaSwag", "https://rowanzellers.com/hellaswag/", "commonsense_reasoning", "Video-caption source rights need review."],
    ["src_winogrande", "WinoGrande", "https://winogrande.allenai.org/", "commonsense_reasoning", "License needs pinned proof."],
    ["src_scibench", "SciBench", "https://github.com/mandyyyyii/scibench", "science_math", "License needs review."],
    ["src_minerva_math", "Minerva Math", "https://github.com/google-deepmind/mathematics_dataset", "math_reasoning", "Verify exact source and license before use."],
    ["src_deepmind_math", "DeepMind Mathematics Dataset", "https://github.com/google-deepmind/mathematics_dataset", "math_reasoning", "Apache-2.0 likely but generated data policy needs validation."],
    ["src_synthetic_symbolic_local", "Synthetic symbolic local generator", "https://github.com/dpan538/another_brain", "symbolic_reasoning", "Generated locally; not external."],
    ["src_public_domain_math_word_problems", "Public-domain math word problem candidates", "https://www.loc.gov/", "math_reasoning", "Needs source-specific public-domain proof before import."],
    ["src_bbh_logical_deduction", "BBH logical deduction subset", "https://github.com/suzgunmirac/BIG-Bench-Hard", "logical_reasoning", "License depends on upstream BIG-Bench; admit only after Apache proof."],
    ["src_mmlu_math_subsets", "MMLU math/logical subsets", "https://github.com/hendrycks/test", "benchmark", "License and source rights unclear for training."],
    ["src_agieval_logic", "AGIEval logic/math subsets", "https://github.com/ruixiangcui/AGIEval", "benchmark", "Exam copyright risk; reject for training until provenance proof."]
  ].map(([source_id, name, homepage_url, task, reason]) => {
    const rejectedIds = new Set([
      "src_reclor",
      "src_logiqa",
      "src_math23k",
      "src_mathqa",
      "src_mawps",
      "src_aqua_rat",
      "src_drop",
      "src_hellaswag",
      "src_mmlu_math_subsets",
      "src_agieval_logic",
      "src_public_domain_math_word_problems"
    ]);
    return candidate({
    source_id,
    name,
    homepage_url,
    data_url: homepage_url,
    license_name: "unclear",
    license_url: "",
    license_confidence: /BBH logical/.test(name) ? "likely" : "unclear",
    task_types: [task],
    admission_status: rejectedIds.has(source_id) ? "rejected" : "candidate",
    rejection_reason: rejectedIds.has(source_id) ? reason : "",
    notes: reason
  });
  })
];

async function main() {
  await writeJsonl(OUT, rows);
  const report = {
    generated_at: new Date().toISOString(),
    candidates: rows.length,
    admitted: rows.filter((row) => row.admission_status === "admitted").length,
    rejected: rows.filter((row) => row.admission_status === "rejected").length,
    candidate_only: rows.filter((row) => row.admission_status === "candidate").length,
    admitted_sources: rows.filter((row) => row.admission_status === "admitted").map((row) => row.source_id),
    rejected_sources: rows.filter((row) => row.admission_status === "rejected").map((row) => ({ source_id: row.source_id, reason: row.rejection_reason }))
  };
  await writeJson(REPORT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
