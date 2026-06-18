#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runDialogPrompts } from "../dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "artifacts/training_os/r23/review");

const SESSION_A = [
  "你知道罗大佑吗？",
  "他有什么代表作？",
  "换个说法。",
  "能不能简单一点？",
  "罗大佑有什么代表作？",
  "你看过日本文学吗？",
  "日本文学的特点是什么？",
  "什么是季节感？"
];

const SESSION_B = [
  "你知道罗大佑吗？",
  "是那个台湾的歌手吗？",
  "你觉得他的歌怎么样？",
  "还有其他港台流行歌手可以推荐的吗？",
  "你觉得专辑和单曲的创作模式有什么区别？",
  "这个其实和文学诗歌很像。",
  "日本文学和台湾文学有一些相似性，你能注意到吗？",
  "日本文学的代表作和作家你能列举三个吗？",
  "这其实有点像舞台剧，比较有细节和冲突。",
  "或许我比较羡慕夏目漱石的我的猫这本书，他让我想到了童年。",
  "罗大佑也有一首歌是童年，你觉得他讲的真是童年吗？",
  "这或许不像是一个对话框能说出来的话，你是谁？",
  "你为什么要提到鳄鱼？",
  "鳄鱼和罗大佑的歌曲有什么关系？",
  "我很喜欢你在文学和诗歌上的努力。",
  "你是否有别的更深的提问？"
];

const SIBLING_SESSIONS = [
  {
    id: "person_pronoun_works_film",
    family: "person_to_pronoun_to_works",
    domain: "film",
    turns: ["你知道小津安二郎吗？", "他有什么代表作？", "简单一点。"]
  },
  {
    id: "domain_familiarity_art",
    family: "domain_familiarity_question",
    domain: "art",
    turns: ["你看过现代艺术吗？", "它有什么特点？"]
  },
  {
    id: "concept_followup_literature",
    family: "overview_introduces_concept",
    domain: "literature",
    turns: ["日本文学的特点是什么？", "什么是季节感？"]
  },
  {
    id: "non_question_food",
    family: "meaningful_non_question_uptake",
    domain: "food",
    turns: ["食谱和小说其实有点像。", "我喜欢这种把味道和记忆放在一起的说法。"]
  },
  {
    id: "false_confirmation_science",
    family: "false_confirmation",
    domain: "science",
    turns: ["你知道达尔文吗？", "是那个研究进化论的人吗？", "他有什么代表作？"]
  }
];

const IMPLEMENTATION_RE = /本地知识卡|知识卡|当前会话|active topic|response mode|route|controller|runtime|profile|ontology|内部主体|本体|复制体|这个音乐对象|这个文学对象|这个历史对象|这个艺术对象|表层称呼|身份边界|按自己的领域来谈|我会按/i;
const PROFILE_RE = /可以从[^。！？]{0,30}进入|可以理解为[^。！？]{0,30}入口|这个[^。！？]{0,12}对象|重点在于|常从[^。！？]{0,40}进入/i;

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function compactTrace(turn) {
  const trace = turn.trace?.conversation_controller || turn.trace || {};
  return {
    response_mode: trace.response_mode || trace.responseMode?.mode || "",
    turn_function: trace.turn_function || "",
    operation: trace.operation || trace.question_type || "",
    active_referent: trace.binding?.selected_referent || trace.content_plan?.active_referent || "",
    selected_domain: trace.binding?.selected_domain || trace.content_plan?.domain || "",
    evidence_ids: trace.content_plan?.evidence_ids || trace.answer_plan?.evidenceIds || [],
    finalizer: trace.finalizer || null
  };
}

function hardFailures({ user = "", answer = "", trace = {} }) {
  const failures = [];
  const operation = trace.operation || "";
  const finalizerFailures = trace.finalizer?.failures || [];
  failures.push(...finalizerFailures.map((item) => `finalizer:${item}`));
  if (!answer.trim()) failures.push("empty_answer");
  if (IMPLEMENTATION_RE.test(answer)) failures.push("implementation_leakage");
  if (PROFILE_RE.test(answer)) failures.push("generic_profile_template");
  if (/代表作|作品/.test(user) && !/《[^》]+》|夏目漱石|川端康成|太宰治|小津|东京物语|物种起源/.test(answer)) failures.push("list_request_missing_items");
  if (/什么是季节感/.test(user) && /历史对象|史料|解释责任/.test(answer)) failures.push("wrong_domain");
  if (/你看过|你读过|你听过|你懂|你了解/.test(user) && /我不是人|不能说真的|知识卡/.test(answer)) failures.push("identity_boundary_overtrigger");
  if (/区别|差别|不同/.test(user) && !/差别|更像|一个|另一个|整体|集中|结构/.test(answer)) failures.push("comparison_not_answered");
  if (/像|羡慕|喜欢/.test(user) && /需要先确认|你需要提问|请明确/.test(answer)) failures.push("meaningful_non_question_misrouted");
  if (/你是谁/.test(user) && !/对话框|不是人/.test(answer)) failures.push("identity_boundary_missing");
  return [...new Set(failures)];
}

async function runSession({ id, source, family = "", domain = "", turns }) {
  const current = await runDialogPrompts(turns, { withThinkingDelay: false });
  const candidate = await runDialogPrompts(turns, { withThinkingDelay: false, r23Candidate: true });
  return {
    id,
    source,
    family,
    domain,
    turns: turns.map((user, index) => {
      const currentTurn = current.turns[index];
      const candidateTurn = candidate.turns[index];
      const currentTrace = compactTrace(currentTurn);
      const candidateTrace = compactTrace(candidateTurn);
      return {
        turn_index: index + 1,
        user,
        current_answer: currentTurn.answer,
        candidate_answer: candidateTurn.answer,
        selected_turn_function: candidateTrace.turn_function,
        selected_operation: candidateTrace.operation,
        active_referent: candidateTrace.active_referent,
        selected_domain: candidateTrace.selected_domain,
        evidence_ids: candidateTrace.evidence_ids,
        finalizer_result: candidateTrace.finalizer,
        current_hard_failures: hardFailures({ user, answer: currentTurn.answer, trace: currentTrace }),
        candidate_hard_failures: hardFailures({ user, answer: candidateTurn.answer, trace: candidateTrace })
      };
    })
  };
}

function summarize(sessions) {
  const turns = sessions.flatMap((session) => session.turns.map((turn) => ({ ...turn, session_id: session.id, family: session.family, domain: session.domain })));
  const currentFailures = turns.flatMap((turn) => turn.current_hard_failures.map((failure) => ({ ...turn, failure })));
  const candidateFailures = turns.flatMap((turn) => turn.candidate_hard_failures.map((failure) => ({ ...turn, failure })));
  const byFamily = {};
  for (const turn of turns) {
    const key = turn.family || "public_canary";
    if (!byFamily[key]) byFamily[key] = { turns: 0, current_failures: 0, candidate_failures: 0 };
    byFamily[key].turns += 1;
    byFamily[key].current_failures += turn.current_hard_failures.length;
    byFamily[key].candidate_failures += turn.candidate_hard_failures.length;
  }
  return {
    total_sessions: sessions.length,
    total_turns: turns.length,
    current_failure_count: currentFailures.length,
    candidate_failure_count: candidateFailures.length,
    by_family: byFamily,
    current_failure_examples: currentFailures.slice(0, 20).map(({ session_id, turn_index, user, current_answer, failure }) => ({ session_id, turn_index, user, answer: current_answer, failure })),
    candidate_failure_examples: candidateFailures.slice(0, 20).map(({ session_id, turn_index, user, candidate_answer, failure }) => ({ session_id, turn_index, user, answer: candidate_answer, failure }))
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const sessions = [
    await runSession({ id: "public_session_a", source: "r23_public_canary", turns: SESSION_A }),
    await runSession({ id: "public_session_b", source: "r23_public_canary", turns: SESSION_B }),
    ...(await Promise.all(SIBLING_SESSIONS.map((session) => runSession({ ...session, source: "r23_codex_diagnostic_sibling" }))))
  ];
  const summary = summarize(sessions);
  const buildInfo = {
    generated_at: new Date().toISOString(),
    baseline_commit: "5338ac22dee506b216ef2c625875caaaaf662d31",
    evaluated_commit: git(["rev-parse", "HEAD"]),
    public_default_changed: false,
    r23_candidate_flag: "--r23-candidate or ?r23Candidate=true",
    human_review_status: "pending",
    hidden_holdout_status: "not_run",
    promotion_ready: false
  };
  const diff = sessions.map((session) => ({
    id: session.id,
    family: session.family,
    domain: session.domain,
    turns: session.turns.map((turn) => ({
      turn_index: turn.turn_index,
      user: turn.user,
      current_answer: turn.current_answer,
      candidate_answer: turn.candidate_answer,
      current_hard_failures: turn.current_hard_failures,
      candidate_hard_failures: turn.candidate_hard_failures
    }))
  }));
  const traceSummary = sessions.map((session) => ({
    id: session.id,
    turns: session.turns.map((turn) => ({
      turn_index: turn.turn_index,
      operation: turn.selected_operation,
      active_referent: turn.active_referent,
      selected_domain: turn.selected_domain,
      evidence_ids: turn.evidence_ids,
      finalizer_ok: turn.finalizer_result?.ok ?? null,
      finalizer_failures: turn.finalizer_result?.failures || []
    }))
  }));
  const knownRemainingFailures = summary.candidate_failure_examples;
  const reviewerInstructions = [
    "# R23 Candidate Review Instructions",
    "",
    "This packet is for concentrated external review. The candidate is not public default.",
    "",
    "- Use hidden prompts outside the repository for acceptance.",
    "- Do not treat these public canaries as independent proof.",
    "- Compare current vs candidate for turn fit, active referent, factual correctness, naturalness, specificity, and boundary discipline.",
    "- Mark any case where the candidate is shorter but less useful.",
    "- Hidden holdout status remains `not_run`; promotion remains false."
  ].join("\n");

  await writeFile(resolve(OUT, "public_canary_transcripts.json"), `${JSON.stringify(sessions.slice(0, 2), null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT, "candidate_browser_transcripts.json"), `${JSON.stringify(sessions, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT, "current_vs_candidate_diff.json"), `${JSON.stringify(diff, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT, "candidate_trace_summary.json"), `${JSON.stringify(traceSummary, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT, "known_remaining_failures.json"), `${JSON.stringify(knownRemainingFailures, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT, "candidate_build_info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT, "reviewer_instructions.md"), reviewerInstructions, "utf8");
  await writeFile(resolve(ROOT, "artifacts/training_os/r23/r23_candidate_diagnostic_summary.json"), `${JSON.stringify({ ...summary, build_info: buildInfo }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...summary, build_info: buildInfo }, null, 2));
  process.exit(summary.candidate_failure_count === 0 ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
