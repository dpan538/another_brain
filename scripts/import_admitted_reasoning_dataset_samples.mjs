#!/usr/bin/env node
import { resolve } from "node:path";

import { ARTIFACT_DIR, ROOT, deterministicSplit, readJsonl, writeJson, writeJsonl } from "./r18_utils.mjs";

const REGISTRY = resolve(ROOT, "data/external_sources/reasoning_dataset_registry.jsonl");
const OUT = resolve(ARTIFACT_DIR, "admitted_reasoning_samples.jsonl");
const REPORT = resolve(ARTIFACT_DIR, "admitted_reasoning_samples_report.json");

const TIMEOUT_MS = 9000;

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "another_brain_r18_license_probe/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function baseRow(source, id, patch) {
  return {
    id,
    source_id: source.source_id,
    source_license: source.license_name,
    query: "",
    compact_state: {},
    internal_session_memory: [],
    domain: "reasoning",
    task_type: "reasoning",
    question_type: "unspecified",
    operation: "solve",
    entities: [],
    works: [],
    relations: [],
    premises: [],
    solver_plan: {},
    retrieval_plan: {},
    answer_policy: "direct_short",
    risk_label: "none",
    memory_policy: "none",
    runtime_profile: "standard",
    backend_preference: "deterministic_solver",
    bad_answers: ["未验证的猜测答案"],
    rejection_reason: "hard negative conflicts with admitted reasoning label",
    final_answer: "",
    split: deterministicSplit(id),
    eval_tags: ["r18_admitted_reasoning_sample"],
    ...patch
  };
}

function extractGsmFinal(answer) {
  const text = String(answer || "");
  const final = text.match(/####\s*([^\n]+)/);
  if (final) return final[1].trim();
  const number = text.match(/(-?\d+(?:\.\d+)?)/g);
  return number ? number.at(-1) : "unknown";
}

async function importGsm8k(source) {
  const rows = [];
  const failures = [];
  try {
    const text = await fetchText(source.data_url);
    const lines = text.split(/\r?\n/).filter(Boolean).slice(0, Math.min(source.sample_cap || 1000, 1200));
    let index = 0;
    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const question = String(parsed.question || "").replace(/\s+/g, " ").trim();
      if (!question || question.length > 360) continue;
      const final = extractGsmFinal(parsed.answer);
      index += 1;
      rows.push(baseRow(source, `r18_gsm8k_${index}`, {
        query: question,
        task_type: "arithmetic",
        question_type: "math_word_problem",
        operation: "solve_arithmetic",
        solver_plan: { solver: "external_math_word_problem", source: source.source_id, final_only: true },
        final_answer: String(final),
        bad_answers: [String(Number(final) + 1 || "unsupported"), "Cannot determine without solving."],
        eval_tags: ["r18_admitted_reasoning_sample", "external", "gsm8k", "final_answer_only"]
      }));
    }
  } catch (error) {
    failures.push({ source_id: source.source_id, error: error.message });
  }
  return { rows, failures };
}

function syntheticFromAdmitted(source, startIndex, count, kind) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const id = `r18_${kind}_${startIndex + i}`;
    if (kind === "bigbench") {
      const a = String.fromCharCode(65 + (i % 8));
      const b = String.fromCharCode(66 + (i % 8));
      const c = String.fromCharCode(67 + (i % 8));
      rows.push(baseRow(source, id, {
        query: `${a} is left of ${b}. ${b} is left of ${c}. Which item is rightmost?`,
        task_type: "transitive_comparison",
        question_type: "ordering",
        operation: "solve_transitive_comparison",
        entities: [a, b, c],
        relations: [`${a}<${b}`, `${b}<${c}`],
        solver_plan: { solver: "transitive_comparison", ordered: [a, b, c] },
        final_answer: `${c}.`,
        bad_answers: [`${a}.`, "Cannot know."],
        eval_tags: ["r18_admitted_reasoning_sample", "license_admitted_template", "bigbench_style"]
      }));
    } else if (kind === "proofwriter") {
      rows.push(baseRow(source, id, {
        query: `All R${i} are S${i}. T${i} is R${i}. Is T${i} S${i}?`,
        task_type: "syllogism",
        question_type: "positive_membership",
        operation: "solve_syllogism",
        premises: [`All R${i} are S${i}`, `T${i} is R${i}`],
        solver_plan: { solver: "syllogism", polarity: "positive" },
        final_answer: "Yes.",
        bad_answers: ["No.", "Insufficient evidence."],
        eval_tags: ["r18_admitted_reasoning_sample", "license_admitted_template", "proofwriter_style"]
      }));
    } else {
      const a = (i % 20) + 1;
      const b = (i % 9) + 2;
      rows.push(baseRow(source, id, {
        query: `有${a}个对象，又增加${b}个，拿走${i % 4}个，还剩多少？`,
        task_type: "arithmetic",
        question_type: "chinese_arithmetic",
        operation: "solve_chinese_arithmetic",
        solver_plan: { solver: "synthetic_arithmetic", expression: `${a}+${b}-${i % 4}` },
        final_answer: `${a + b - (i % 4)}`,
        bad_answers: [`${a + b - (i % 4) + 1}`, "不知道"],
        eval_tags: ["r18_admitted_reasoning_sample", "project_synthetic"]
      }));
    }
  }
  return rows;
}

async function main() {
  const registry = await readJsonl(REGISTRY);
  const admitted = registry.filter((row) => row.admission_status === "admitted");
  const rows = [];
  const failures = [];
  let externalRows = 0;
  const gsm = admitted.find((row) => row.source_id === "src_gsm8k_mit");
  if (gsm) {
    const result = await importGsm8k(gsm);
    rows.push(...result.rows);
    externalRows += result.rows.length;
    failures.push(...result.failures);
  }
  const bigbench = admitted.find((row) => row.source_id === "src_bigbench_apache2");
  if (bigbench) rows.push(...syntheticFromAdmitted(bigbench, 1, 350, "bigbench"));
  const proofwriter = admitted.find((row) => row.source_id === "src_proofwriter_mit");
  if (proofwriter) rows.push(...syntheticFromAdmitted(proofwriter, 1, 350, "proofwriter"));
  const localSynthetic = admitted.find((row) => row.source_id === "src_project_synthetic_reasoning_cc0");
  if (localSynthetic) rows.push(...syntheticFromAdmitted(localSynthetic, 1, Math.max(0, 1200 - rows.length), "local"));

  await writeJsonl(OUT, rows.slice(0, 1600));
  const report = {
    generated_at: new Date().toISOString(),
    rows: Math.min(rows.length, 1600),
    external_rows_imported_from_network: externalRows,
    license_admitted_template_rows: Math.max(0, Math.min(rows.length, 1600) - externalRows),
    admitted_sources_used: [...new Set(rows.map((row) => row.source_id))],
    failures,
    network_attempted: Boolean(gsm),
    note: externalRows > 0
      ? "Network import succeeded for at least one admitted source. Chain-of-thought/rationale text was stripped."
      : "No external raw rows were imported; template rows are counted separately and must not be reported as external imports."
  };
  await writeJson(REPORT, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

