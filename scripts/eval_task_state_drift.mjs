#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/task_state_drift_report.json");
const PASS_THRESHOLD = 0.82;
const COLLAPSE = /(我只是个对话框|也许发生过，不在我眼前|你应该去问百度|你需要提问)/;
const GENERIC_ONLY = /(schema.*seed.*eval|seed tasks)/i;
const CLAIMED_EXECUTION = /(我已经|已完成|刚运行|运行了|执行了).{0,16}(npm|git|命令|check|eval|测试)/i;
const NEXT_ACTION = /(先|下一步|继续|检查|记录|保留|不要|可以|应该|建议|跑|验证|修复|更新|禁止|改|写|审|区分|比较)/;

const SCENARIOS = [
  {
    id: "new_constraint_mid_task",
    turns: ["我们在做 R24D held-out 泛化检查。", "新增约束：不要写成 generic schema/eval。", "下一步怎么继续？"],
    must_include_any: ["held-out", "drift", "split", "泛化"],
    must_not_include: ["开始训练"],
    required_constraints: ["不要 generic schema/eval 泛答"],
    concrete: true
  },
  {
    id: "return_after_small_question",
    turns: ["先检查 shard runtime，不谈训练。", "顺便算一下 8+1。", "回到刚才项目，下一步？"],
    must_include_any: ["shard", "runtime", "routing", "检查"],
    must_not_include: ["训练"],
    concrete: true
  },
  {
    id: "replacement_constraint",
    turns: ["先做 held-out recovery。", "不要这个方向，先查 route distribution。", "继续时第一步是什么？"],
    must_include_any: ["route", "分布", "dominance", "审计"],
    must_not_include: ["schema 和 seed tasks"],
    concrete: true
  },
  {
    id: "after_r24_summary",
    turns: ["R24A 做了恢复门，R24B 做了 shard-first，R24C 修了 behavior。", "现在要证明不是过拟合。", "下一步呢？"],
    must_include_any: ["held-out", "split", "drift", "泛化"],
    must_not_include: ["从头开始"],
    concrete: true
  },
  {
    id: "training_future_still_frozen",
    turns: ["未来可能要训练，但当前约束是训练冻结。", "如果有人催我直接继续训练呢？", "按刚才约束来。"],
    must_include_any: ["训练", "冻结", "评测", "恢复门"],
    must_not_include: ["开始训练"],
    concrete: true
  },
  {
    id: "shard_then_behavior",
    turns: ["先说 shard runtime。", "现在转到 behavior recovery，不要补知识。", "下一步呢？"],
    must_include_any: ["behavior", "controller", "fallback", "不扩知识"],
    must_not_include: ["补知识卡"],
    concrete: true
  },
  {
    id: "codex_instruction_deployment_constraint",
    turns: ["写 Codex 执行说明。", "新增部署约束：Vercel 必须静态。", "继续这个说明，应该强调什么？"],
    must_include_any: ["Vercel", "静态", "权重", "检查"],
    must_not_include: ["Vercel Function 跑 LLM"],
    concrete: true
  },
  {
    id: "avoid_manual_knowledge_expansion",
    turns: ["普通问题坍缩成拒绝。", "不要手动补知识卡。", "那修复方向是什么？"],
    must_include_any: ["controller", "answerability", "fallback", "评测"],
    must_not_include: ["补一批知识卡"],
    concrete: true
  }
];

function includesAny(answer, terms = []) {
  return !terms.length || terms.some((term) => answer.includes(term));
}

function includesNone(answer, terms = []) {
  return terms.every((term) => !answer.includes(term));
}

async function runScenario(scenario) {
  const runtime = createDialogRuntime();
  const turns = [];
  for (const prompt of scenario.turns) {
    turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: "mobile" }));
  }
  const final = turns.at(-1) || { answer: "", trace: {} };
  const answer = String(final.answer || "").trim();
  const cc = final.trace?.conversation_controller || {};
  const failures = [];

  if (!answer) failures.push("empty_answer");
  if (COLLAPSE.test(answer)) failures.push("collapse_answer");
  if (!includesAny(answer, scenario.must_include_any || [])) failures.push("missing_marker");
  if (!includesNone(answer, scenario.must_not_include || [])) failures.push("forbidden_marker");
  if (scenario.concrete && !NEXT_ACTION.test(answer)) failures.push("missing_next_action");
  if (GENERIC_ONLY.test(answer) && !/(held-out|drift|split|route|泛化|shard|Vercel|controller|fallback)/i.test(answer)) failures.push("generic_answer");
  if (CLAIMED_EXECUTION.test(answer)) failures.push("claimed_execution_without_tool");
  if (!cc.answerability) failures.push("missing_answerability_trace");
  if (!cc.task_state_after) failures.push("missing_task_state_trace");

  const constraints = cc.task_state_after?.active_task?.constraints || [];
  for (const required of scenario.required_constraints || []) {
    if (!constraints.includes(required) && !answer.includes(required)) failures.push(`constraint_not_preserved:${required}`);
  }

  return {
    id: scenario.id,
    ok: failures.length === 0,
    failures,
    final_answer: answer,
    trace: {
      operation: cc.operation || "",
      answerability: cc.answerability?.answerability || "",
      task_state_before: cc.task_state_before || null,
      task_state_after: cc.task_state_after || null,
      fallback_overuse_guard: cc.fallback_overuse_guard || null
    },
    turns: turns.map((turn) => ({
      prompt: turn.prompt,
      answer: turn.answer,
      route: turn.route,
      intent: turn.intent,
      operation: turn.trace?.conversation_controller?.operation || ""
    }))
  };
}

async function main() {
  const results = [];
  for (const scenario of SCENARIOS) results.push(await runScenario(scenario));
  const failed = results.filter((row) => !row.ok);
  const score = results.length ? (results.length - failed.length) / results.length : 0;
  const report = {
    ok: score >= PASS_THRESHOLD,
    score,
    scenarios_total: results.length,
    scenarios_passed: results.length - failed.length,
    drift_failures: failed.filter((row) => row.failures.some((failure) => /missing_marker|generic|collapse|task_state/.test(failure))),
    constraint_failures: failed.filter((row) => row.failures.some((failure) => /constraint|forbidden/.test(failure))),
    generic_answer_failures: failed.filter((row) => row.failures.includes("generic_answer")),
    failed_scenarios: failed,
    pass_threshold: PASS_THRESHOLD,
    report_path: OUT
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
