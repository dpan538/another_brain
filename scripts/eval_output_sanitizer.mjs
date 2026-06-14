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
} from "../web/dialog_rules.js?v=output-sanitizer";
import { sanitizeSurfaceIdentity } from "../web/surface_identity.js?v=output-sanitizer";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/output_sanitizer_report.json");

const NON_JUDGMENT_PREFIX_RE = /^(为什么|什么|怎么|如何|谁|哪里|哪儿|何时|什么时候)/;
const BAD_PREFIX_RE = /^(对|不对)[。.!！,，\s]+/;
const NON_AGENT_SPEECH_RE = /(门禁|测试|规则|门槛|检查|验证器|数据集).{0,8}(说话|说|回答|认为|觉得|想|理解|记得|承认|同意|告诉)/;
const BAD_GATE_RE = /(聪明变成乱说|^对[。.!！,，\s]+|门禁.{0,8}(说话|说|回答|认为|觉得|想|告诉))/;

const syntheticCases = [
  {
    id: "strip_nonjudgment_prefix",
    query: "为什么上下文要有限？",
    answer: "对。上下文有限才知道自己站在哪几句话里。",
    expected: "上下文有限才知道自己站在哪几句话里。"
  },
  {
    id: "gate_bad_prefix_and_bad_metaphor",
    query: "门禁为什么不是为了好看？",
    answer: "对。门禁是为了不让聪明变成乱说。",
    expected: "门禁是功能，不是装饰。用来拦住跑偏。"
  },
  {
    id: "gate_personification",
    query: "门禁为什么不是为了好看？",
    answer: "门禁会告诉你哪里坏了。",
    expected: "门禁是功能，不是装饰。用来拦住跑偏。"
  },
  {
    id: "test_personification",
    query: "测试为什么要跑？",
    answer: "测试说它已经通过了。",
    expected: "它只给结果，不会自己说话。"
  },
  {
    id: "rule_personification",
    query: "规则为什么要存在？",
    answer: "规则认为这里不该回答。",
    expected: "它只给结果，不会自己说话。"
  },
  {
    id: "memory_overclaim",
    query: "你认识我吗？",
    answer: "我也许记得你，但是对话框未必。",
    expected: "在这一句里认识。前面忘了。"
  },
  {
    id: "relation_overfamiliar",
    query: "我们是什么关系？",
    answer: "也许你认识我？",
    expected: "你在问，我在回答。别的前面忘了。"
  },
  {
    id: "explicit_identity_correction_allows_prefix",
    query: "你不是鳄鱼。",
    answer: "对。鳄鱼不是我，我也不是鳄鱼。",
    expected: "对。鳄鱼不是我，我也不是鳄鱼。"
  }
];

const runtimeTurns = [
  {
    prompt: "门禁为什么不是为了好看？",
    expected: "门禁是功能，不是装饰。用来拦住跑偏。"
  },
  {
    prompt: "门禁不是为了好看。",
    expected: "门禁是功能，不是装饰。用来拦住跑偏。"
  },
  {
    prompt: "为什么？",
    expected: "门禁是功能，不是装饰。用来拦住跑偏。"
  }
];

function directRuntimeAnswer(prompt, state) {
  const intent = detectIntent(prompt, state);
  const answer = sanitizeSurfaceIdentity(
    directAnswerForIntent(intent, prompt, state) || fallbackForIntent(intent, prompt),
    prompt
  );
  return { intent, answer };
}

function semanticFailures({ query, answer }) {
  const failures = [];
  if (NON_JUDGMENT_PREFIX_RE.test(query) && BAD_PREFIX_RE.test(answer)) {
    failures.push("judgment_prefix_on_nonjudgment_query");
  }
  if (NON_AGENT_SPEECH_RE.test(answer)) {
    failures.push("non_agent_personification");
  }
  if (/门禁/.test(query) && BAD_GATE_RE.test(answer)) {
    failures.push("bad_gate_surface");
  }
  return failures;
}

const syntheticResults = syntheticCases.map((item) => {
  const output = sanitizeSurfaceIdentity(item.answer, item.query);
  const failures = [];
  if (output !== item.expected) {
    failures.push(`expected ${JSON.stringify(item.expected)}, got ${JSON.stringify(output)}`);
  }
  failures.push(...semanticFailures({ query: item.query, answer: output }));
  return { ...item, output, failures };
});

let state = createDialogState();
const runtimeResults = [];
for (const item of runtimeTurns) {
  const { intent, answer } = directRuntimeAnswer(item.prompt, state);
  const failures = [];
  if (answer !== item.expected) {
    failures.push(`expected ${JSON.stringify(item.expected)}, got ${JSON.stringify(answer)}`);
  }
  failures.push(...semanticFailures({ query: item.prompt, answer }));
  runtimeResults.push({ ...item, intent, answer, failures });
  state = nextDialogState(item.prompt, answer, intent, state);
}

const failures = [
  ...syntheticResults.filter((item) => item.failures.length),
  ...runtimeResults.filter((item) => item.failures.length)
];

const report = {
  ok: failures.length === 0,
  summary: {
    syntheticCases: syntheticResults.length,
    runtimeTurns: runtimeResults.length,
    failures: failures.length
  },
  syntheticResults,
  runtimeResults,
  failures
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
