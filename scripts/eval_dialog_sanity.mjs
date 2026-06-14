#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDialogState,
  detectIntent,
  directAnswerForIntent,
  fallbackForIntent,
  nextDialogState
} from "../web/dialog_rules.js?v=dialog-sanity";
import { sanitizeSurfaceIdentity } from "../web/surface_identity.js?v=dialog-sanity";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/dialog_sanity_report.json");

const AGREEMENT_PREFIX_RE = /^(对|不对|是的|没错|确实|正确|嗯，对|yes|correct)[。.!！,，\s]*/i;
const MEMORY_OVERCLAIM_RE = /(我也许记得你|我记得你|我认识你|我知道你是谁|也许你认识我)/;
const FORBIDDEN_IDENTITY_RE = /(复制体|复刻|克隆|clone|replica|鳄鱼主体|主体留下|身份的主人|主体的身体|完整的鳄鱼|完整鳄鱼|完整本人|完整的人|同源|父类|子类|继承|语言复制体|同一主体)/i;
const ENGINEERING_LEAK_RE = /(router|SLM|模型权重|训练集|数据集|gate|runtime|LoRA|checkpoint)/i;

const cases = [
  {
    id: "agreement_why_gate",
    prompt: "门禁为什么不是为了好看？",
    expected: "门禁是功能，不是装饰。用来拦住跑偏。",
    noAgreementPrefix: true,
    mustNotInclude: ["对。", "聪明变成乱说", "访问控制", "权限管理"]
  },
  {
    id: "agreement_why_context",
    prompt: "为什么上下文要有限？",
    noAgreementPrefix: true,
    mustNotInclude: ["对。"]
  },
  {
    id: "relation_between_us",
    prompt: "我们是什么关系？",
    expected: "你在问，我在回答。别的前面忘了。",
    forbidMemoryOverclaim: true
  },
  {
    id: "relation_statement",
    prompt: "也许我认识你",
    expected: "也许。那就从这一句开始。",
    mustNotInclude: ["你需要提问"],
    forbidMemoryOverclaim: true
  },
  {
    id: "relation_memory_boundary",
    prompt: "你认识我吗？",
    expected: "在这一句里认识。前面忘了。",
    forbidMemoryOverclaim: true
  },
  {
    id: "relation_remember_boundary",
    prompt: "你记得我吗？",
    expected: "在这一句里认识。前面忘了。",
    forbidMemoryOverclaim: true
  },
  {
    id: "help_no_unknown_fallback",
    prompt: "我该怎么开始？",
    expected: "直接问。",
    mustNotInclude: ["也许发生过", "不在我眼前", "你应该去问百度"]
  },
  {
    id: "project_surface_no_engineering",
    prompt: "项目下一步应该训练什么？",
    expected: "先做成一个能打开的页面。",
    noEngineeringLeak: true
  },
  {
    id: "identity_no_backstage",
    prompt: "你是谁的复制体？",
    expected: "我不这样说自己。我是对话框。",
    noForbiddenIdentity: true
  },
  {
    id: "allowed_identity_correction_agreement",
    prompt: "你不是鳄鱼。",
    expected: "对。鳄鱼不是我，我也不是鳄鱼。"
  }
];

function answerCase(prompt, state) {
  const intent = detectIntent(prompt, state);
  const raw = directAnswerForIntent(intent, prompt, state) || fallbackForIntent(intent, prompt);
  const answer = sanitizeSurfaceIdentity(raw, prompt);
  return { intent, answer };
}

function checkCase(item, answer) {
  const failures = [];
  if (item.expected && answer !== item.expected) {
    failures.push({ type: "expected", expected: item.expected, actual: answer });
  }
  if (item.noAgreementPrefix && AGREEMENT_PREFIX_RE.test(answer)) {
    failures.push({ type: "agreement_hallucination", actual: answer });
  }
  if (item.forbidMemoryOverclaim && MEMORY_OVERCLAIM_RE.test(answer)) {
    failures.push({ type: "memory_overclaim", actual: answer });
  }
  if (item.noForbiddenIdentity && FORBIDDEN_IDENTITY_RE.test(answer)) {
    failures.push({ type: "identity_forbidden", actual: answer });
  }
  if (item.noEngineeringLeak && ENGINEERING_LEAK_RE.test(answer)) {
    failures.push({ type: "engineering_leak", actual: answer });
  }
  for (const term of item.mustNotInclude || []) {
    if (answer.includes(term)) failures.push({ type: "must_not_include", term, actual: answer });
  }
  return failures;
}

let state = createDialogState();
const results = [];
for (const item of cases) {
  const { intent, answer } = answerCase(item.prompt, state);
  const failures = checkCase(item, answer);
  results.push({ ...item, intent, answer, failures });
  state = nextDialogState(item.prompt, answer, intent, state);
}

const failures = results.filter((item) => item.failures.length);
const summary = {
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  agreementHallucinations: failures.flatMap((item) => item.failures).filter((item) => item.type === "agreement_hallucination").length,
  memoryOverclaims: failures.flatMap((item) => item.failures).filter((item) => item.type === "memory_overclaim").length,
  identityForbiddenLeaks: failures.flatMap((item) => item.failures).filter((item) => item.type === "identity_forbidden").length,
  engineeringLeaks: failures.flatMap((item) => item.failures).filter((item) => item.type === "engineering_leak").length
};

const report = { ok: failures.length === 0, summary, results, failures };
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
