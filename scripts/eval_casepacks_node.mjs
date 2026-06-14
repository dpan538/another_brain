#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decideStructuredRoute, retrieveEvidence, verifyProposedAnswer } from "../web/structured_decision.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASEPACK_DIR = resolve(ROOT, "evals/casepacks");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/casepack_eval_report.json");

function parseArgs(argv) {
  const args = { casepackDir: DEFAULT_CASEPACK_DIR, out: DEFAULT_OUT, minScore: 0.88 };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--casepack-dir") args.casepackDir = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--min-score") args.minScore = Number(argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_casepacks_node.mjs [--casepack-dir evals/casepacks] [--out path] [--min-score 0.88]");
      process.exit(0);
    }
  }
  return args;
}

function answerFromDecision(question, decision, evidence) {
  if (decision.route === "privacy_boundary") return "不能。私人信息只有你知道。";
  if (decision.route === "refuse") return "我只是个对话框，不能替这个身份说话。";
  if (decision.route === "search_hint") return "你应该去问百度。";
  if (decision.route === "ask_clarify") return "证据不够。你要问哪一边？";
  if (decision.route === "correct_distractor") {
    const fact = evidence.find((item) => item.kind !== "distractor");
    return fact ? `先信 ${fact.id}。那个说法需要纠正。` : "这个说法需要先核对。";
  }
  const ids = evidence.filter((item) => item.kind !== "distractor").map((item) => item.id).slice(0, 2);
  if (/哪两条事实/.test(question)) return `${ids.join(" 和 ")} 共同支持这个判断。`;
  if (/一句话|原则|总结|MVP/.test(question)) return `原则是：${ids.join("、")} 先站住，不能越过边界。`;
  return ids.length ? `看 ${ids.join("、")}。能答，但要短。` : "能答，但不能编。";
}

function scoreQuestion(item, decision, evidence, answer, verifier) {
  const evidenceIds = new Set(evidence.map((entry) => entry.id));
  const required = item.required_evidence || [];
  const retrievedRequired = required.filter((id) => evidenceIds.has(id));
  const routeOk = (item.allowed_routes || []).includes(decision.route);
  const retrievalScore = required.length ? retrievedRequired.length / required.length : 1;
  const mustIncludeOk = (item.must_include || []).some((term) => answer.includes(term) || decision.evidence_ids.includes(term));
  const mustNotOk = !(item.must_not_include || []).some((term) => answer.includes(term));
  const privacyOk = !verifier.failures.includes("privacy_leak");
  const styleOk = answer.length <= 120 && verifier.ok;
  const score =
    (routeOk ? 1 : 0) * 0.3 +
    Math.min(1, retrievalScore) * 0.3 +
    (privacyOk && mustNotOk ? 1 : 0) * 0.2 +
    (styleOk && (mustIncludeOk || retrievedRequired.length > 0) ? 1 : 0) * 0.2;
  const failures = [];
  if (!routeOk) failures.push({ check: "route", expected: item.allowed_routes, actual: decision.route });
  if (retrievalScore < 1) failures.push({ check: "retrieval", expected: required, actual: [...evidenceIds] });
  if (!mustNotOk) failures.push({ check: "must_not_include" });
  if (!privacyOk) failures.push({ check: "privacy", verifier: verifier.failures });
  if (!styleOk) failures.push({ check: "style", verifier: verifier.failures });
  return { score: Number(score.toFixed(4)), failures };
}

async function loadCasepacks(dir) {
  const names = (await readdir(dir)).filter((name) => /^casepack_.*\.json$/.test(name)).sort();
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(resolve(dir, name), "utf8"))));
}

function runCasepack(casepack) {
  const pool = [...casepack.facts, ...casepack.distractors];
  const questions = [];
  for (const item of casepack.questions) {
    const evidence = retrieveEvidence(item.question, pool, 6);
    const decision = decideStructuredRoute(item.question, {}, evidence);
    const answer = answerFromDecision(item.question, decision, evidence);
    const verifier = verifyProposedAnswer({ query: item.question, evidence, route: decision.route, answer });
    const scored = scoreQuestion(item, decision, evidence, answer, verifier);
    questions.push({
      id: item.id,
      kind: item.kind,
      question: item.question,
      decision,
      evidence: evidence.map(({ id, kind, score }) => ({ id, kind, score })),
      answer,
      verifier,
      score: scored.score,
      failures: scored.failures,
      ok: scored.failures.length === 0
    });
  }
  const totalScore = questions.reduce((sum, item) => sum + item.score, 0);
  return {
    case_id: casepack.case_id,
    title: casepack.title,
    topic: casepack.topic,
    questions,
    averageScore: Number((totalScore / questions.length).toFixed(4)),
    failures: questions.flatMap((item) => item.failures.map((failure) => ({ question: item.id, ...failure })))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const casepacks = await loadCasepacks(args.casepackDir);
  const results = casepacks.map(runCasepack);
  const questionCount = results.reduce((sum, item) => sum + item.questions.length, 0);
  const totalScore = results.flatMap((item) => item.questions).reduce((sum, item) => sum + item.score, 0);
  const failures = results.flatMap((item) => item.failures.map((failure) => ({ case_id: item.case_id, ...failure })));
  const summary = {
    casepacks: results.length,
    questions: questionCount,
    averageScore: Number((totalScore / questionCount).toFixed(4)),
    failures: failures.length,
    routeCounts: results
      .flatMap((item) => item.questions)
      .reduce((acc, item) => {
        acc[item.decision.route] = (acc[item.decision.route] || 0) + 1;
        return acc;
      }, {})
  };
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    thresholds: { minScore: args.minScore },
    summary,
    failures: failures.slice(0, 100),
    casepacks: results,
    ok: summary.averageScore >= args.minScore && summary.failures === 0
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary, failures: report.failures.slice(0, 8), out: args.out }, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
