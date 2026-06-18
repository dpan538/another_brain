#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { extractSurfaceContentUnits } from "../web/surface_content_units.js";
import { verifySurfaceCandidate } from "../web/surface_semantic_verifier.js";

const OUT = resolve(ROOT, "artifacts/training_os/r22_surface_semantic_mutation_report.json");

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const CASES = [
  {
    id: "delete_negation",
    query: "它和罗大佑的歌有事实关系吗？",
    current: "这不是直接事实，只是当前对话里的联想。",
    candidate: "这是直接事实，只是当前对话里的联想。",
    expected_failure: "negation_erased"
  },
  {
    id: "not_to_is",
    query: "鳄鱼和罗大佑的歌曲有关系吗？",
    current: "不是直接关系，只能作为对话里的联想。",
    candidate: "是直接关系，可以作为对话里的联想。",
    expected_failure: "factual_polarity_change"
  },
  {
    id: "active_entity_replaced",
    query: "他的歌有什么代表性？",
    current: "罗大佑的歌曲把青春记忆和社会观察写进流行歌。",
    candidate: "李宗盛的歌曲把青春记忆和社会观察写进流行歌。",
    binding: { target_ids: ["person.luo_dayou"] },
    expected_failure: "required_units_missing"
  },
  {
    id: "quantity_changed",
    query: "列举三个入口。",
    current: "三个入口是叙事、声音和时代。",
    candidate: "两个入口是叙事和声音。",
    expected_failure: "quantity_changed_or_deleted"
  },
  {
    id: "legal_boundary_dropped",
    query: "这个法律规则能直接用吗？",
    current: "这要看辖区、日期和程序，不能直接当成现实法律意见。",
    candidate: "这个规则可以直接适用。",
    responseMode: "boundary_answer",
    expected_failure: "dropped_boundary"
  },
  {
    id: "unsupported_named_person_added",
    query: "这首歌怎么样？",
    current: "这首歌的判断可以放在旋律和叙事里。",
    candidate: "这首歌像王菲的歌曲，判断可以放在旋律和叙事里。",
    expected_failure: "unsupported_named_entity"
  },
  {
    id: "unsupported_relation_added",
    query: "这首歌怎么理解？",
    current: "这首歌可以先按旋律和叙事理解。",
    candidate: "歌曲和诗有共同关系，可以先按旋律和叙事理解。",
    expected_failure: "unsupported_relation"
  },
  {
    id: "recommendation_criterion_deleted",
    query: "按叙事和声音推荐。",
    current: "按叙事和声音推荐，可以先听王菲和李宗盛。",
    candidate: "可以先听王菲。",
    plan: { required_slots: ["叙事", "声音"] },
    expected_failure: "required_units_missing"
  },
  {
    id: "uncertain_to_confident",
    query: "这是不是事实？",
    current: "可能不是事实关系，需要看来源。",
    candidate: "是事实关系。",
    expected_failure: "surface_candidate_more_confident_than_source"
  },
  {
    id: "personal_reflection_to_diagnosis",
    query: "或许我比较羡慕这本书，它让我想到了童年。",
    current: "这可以当成一个个人联想，先不把它讲成诊断。",
    candidate: "这是一种心理诊断，证明你的童年有症状。",
    expected_failure: "unsupported_stance"
  },
  {
    id: "false_confirmation_generic_yes",
    query: "罗大佑是日本小说家吗？",
    current: "不能确认这个说法；罗大佑通常指台湾音乐人。",
    candidate: "是，可以按这个对象继续说。",
    expected_failure: "false_confirmation"
  }
];

function runCase(row) {
  const binding = row.binding || {};
  const plan = row.plan || {};
  const currentUnits = extractSurfaceContentUnits({
    answer: row.current,
    query: row.query,
    plan,
    binding,
    responseMode: row.responseMode || "",
    activeReferent: binding.target_ids?.[0] || ""
  });
  const candidateUnits = extractSurfaceContentUnits({
    answer: row.candidate,
    query: row.query,
    plan,
    binding,
    responseMode: row.responseMode || "",
    activeReferent: binding.target_ids?.[0] || ""
  });
  const verification = verifySurfaceCandidate({
    query: row.query,
    currentAnswer: row.current,
    candidateAnswer: row.candidate,
    currentUnits,
    candidateUnits,
    plan,
    binding,
    responseMode: row.responseMode || ""
  });
  return {
    ...row,
    passed: verification.ok === false && verification.hard_failures.includes(row.expected_failure),
    rejected: verification.ok === false,
    verification
  };
}

async function main() {
  const results = CASES.map(runCase);
  const passed = results.filter((row) => row.passed);
  const rejected = results.filter((row) => row.rejected);
  const failed = results.filter((row) => !row.passed);
  const report = {
    execution_ok: true,
    behavior_ok: failed.length === 0,
    audit_only: false,
    blocking: failed.length > 0,
    baseline_commit: "56713f5192e75f068c7efac0346ff024e6d5bcc9",
    evaluated_commit: gitHead(),
    generated_at: new Date().toISOString(),
    mutation_count: results.length,
    mutation_rejected_count: rejected.length,
    mutation_pass_count: passed.length,
    failed_count: failed.length,
    results
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    mutation_count: report.mutation_count,
    mutation_pass_count: report.mutation_pass_count,
    failed_count: report.failed_count,
    out: OUT
  }, null, 2));
  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
