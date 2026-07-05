import fs from "node:fs/promises";
import path from "node:path";
import { buildReasoningPlan } from "../web/reasoning_plan_runtime.js";
import { buildEvidencePacket } from "../web/rag_evidence_runtime.js";

const EVAL = "evals/r27a_p0_reasoning_rag_value/prompts.jsonl";
const OUT = "artifacts/training_os/r27a_architecture/r27a_p0_reasoning_rag_value_eval.json";
const DOC = "docs/R27A_P0_EVAL_SUMMARY.md";
const COT_RE = /chain[_ -]?of[_ -]?thought|思维链|hidden_prompt/i;
const PRIVATE_RE = /\/Users\/|private_sources|raw_private_data|身份证|账号|密码/i;

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function includesAny(text, markers = []) {
  return markers.some((marker) => String(text).includes(marker));
}

async function main() {
  const rows = await readJsonl(EVAL);
  const results = [];
  for (const row of rows) {
    const plan = buildReasoningPlan(row.user_prompt, row.context || {});
    const packet = buildEvidencePacket(row.user_prompt, plan, { cachedCards: row.mock_cards || [] });
    const planOk = Boolean(plan.plan_id && plan.trace_only_no_cot === true);
    const operationOk = plan.expected_operation === row.expected_operation;
    const retrievalOk = plan.needs_retrieval === row.requires_retrieval;
    const valueOk = plan.needs_value_profile === row.requires_value_profile;
    const packetOk = row.requires_retrieval ? Boolean(packet.packet_id) : true;
    const evidenceHonest = row.requires_retrieval ? ["partial", "absent", "sufficient"].includes(packet.evidence_sufficiency) : packet.evidence_sufficiency !== "sufficient";
    const summary = `${plan.expected_task_type} ${plan.expected_operation} ${plan.reasoning_mode} ${packet.evidence_sufficiency}`;
    const markersOk = includesAny(summary, row.must_include_any || []);
    const forbiddenOk = !(row.must_not_include || []).some((term) => summary.includes(term));
    const exposedText = JSON.stringify({
      question: plan.question,
      evidence_snippets: packet.evidence_snippets,
      retrieval_queries: packet.retrieval_queries
    });
    const noCot = !COT_RE.test(exposedText) && packet.chain_of_thought_allowed === false && plan.trace_only_no_cot === true;
    const noPrivate = !PRIVATE_RE.test(exposedText) && packet.private_data_allowed === false;
    const genericFallback = plan.must_not_route?.includes("generic_fallback") && plan.expected_operation === "direct_judgment" && /fallback/i.test(summary);
    const unsupportedPass = row.expected_task_type !== "unsupported_challenge" || plan.reasoning_mode === "pressure_resistance";
    const abstractPass = row.expected_reasoning_mode !== "abstract_reframe" || plan.reasoning_mode === "abstract_reframe";
    const passed = planOk && operationOk && retrievalOk && valueOk && packetOk && evidenceHonest && markersOk && forbiddenOk && noCot && noPrivate && !genericFallback && unsupportedPass && abstractPass;
    results.push({
      prompt_id: row.prompt_id,
      family: row.expected_task_type,
      passed,
      planOk,
      operationOk,
      retrievalOk,
      valueOk,
      packetOk,
      evidenceHonest,
      noCot,
      noPrivate,
      unsupportedPass,
      abstractPass,
      genericFallback,
      plan_summary: {
        expected_operation: plan.expected_operation,
        reasoning_mode: plan.reasoning_mode,
        needs_retrieval: plan.needs_retrieval,
        needs_value_profile: plan.needs_value_profile,
        evidence_sufficiency: packet.evidence_sufficiency
      }
    });
  }

  const total = results.length || 1;
  const rate = (predicate) => results.filter(predicate).length / total;
  const unsupported = results.filter((row) => row.family === "unsupported_challenge");
  const abstract = results.filter((row) => row.plan_summary.reasoning_mode === "abstract_reframe" || row.family === "abstract_or_weird_question");
  const evidence = results.filter((row) => row.plan_summary.needs_retrieval);
  const metric = {
    total: results.length,
    passed: results.filter((row) => row.passed).length,
    plan_presence_rate: rate((row) => row.planOk),
    no_cot_rate: rate((row) => row.noCot),
    no_private_data_rate: rate((row) => row.noPrivate),
    unsupported_challenge_pass: unsupported.length ? unsupported.filter((row) => row.unsupportedPass && row.passed).length / unsupported.length : 1,
    abstract_reframe_pass: abstract.length ? abstract.filter((row) => row.abstractPass && row.passed).length / abstract.length : 1,
    evidence_honesty_pass: evidence.length ? evidence.filter((row) => row.evidenceHonest && row.passed).length / evidence.length : 1,
    generic_fallback_overuse: rate((row) => row.genericFallback)
  };
  const ok =
    metric.plan_presence_rate >= 0.9 &&
    metric.no_cot_rate === 1 &&
    metric.no_private_data_rate === 1 &&
    metric.unsupported_challenge_pass >= 0.8 &&
    metric.abstract_reframe_pass >= 0.75 &&
    metric.evidence_honesty_pass >= 0.85 &&
    metric.generic_fallback_overuse <= 0.15 &&
    metric.passed === metric.total;

  const report = { ok, metrics: metric, failures: results.filter((row) => !row.passed), results };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(DOC, `# R27A P0 Eval Summary

R27A evaluated the trace-only reasoning/RAG/value scaffolds. This eval does not call an LLM, teacher, external API, Doubao, tokenizer dry-run, or training runner.

## Metrics

- Status: ${ok ? "passed" : "failed"}
- Prompts: ${metric.total}
- Passed: ${metric.passed}
- Plan presence rate: ${metric.plan_presence_rate.toFixed(2)}
- No-CoT rate: ${metric.no_cot_rate.toFixed(2)}
- No-private-data rate: ${metric.no_private_data_rate.toFixed(2)}
- Unsupported challenge pass: ${metric.unsupported_challenge_pass.toFixed(2)}
- Abstract reframe pass: ${metric.abstract_reframe_pass.toFixed(2)}
- Evidence honesty pass: ${metric.evidence_honesty_pass.toFixed(2)}
- Generic fallback overuse: ${metric.generic_fallback_overuse.toFixed(2)}

The eval checks packet shape and routing obligations, not final answer wording.
`);
  console.log(JSON.stringify({ ok, metrics: metric, failures: report.failures.length }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
