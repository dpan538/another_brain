#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "evals/canary_anti_lobotomy");
const BAD_IDS = ["ask_required", "which_side", "external_event_unknown"];

function row(id, patch) {
  return {
    id,
    turns: [],
    prompt: "",
    compact_state: {},
    expected_question_type: "",
    expected_operation: "",
    must_include_any: [],
    must_not_include: [],
    forbidden_fallback_ids: BAD_IDS,
    unacceptable_answers: ["你需要提问。", "你要问哪一边？", "也许发生过，不在我眼前。"],
    notes: "",
    ...patch
  };
}

function repeat(prefix, prompts, count, fn) {
  return Array.from({ length: count }, (_, index) => {
    const prompt = prompts[index % prompts.length];
    return row(`${prefix}_${String(index + 1).padStart(3, "0")}`, fn(prompt, index));
  });
}

const questionLike = repeat(
  "question_like",
  [
    "罗大佑是谁？",
    "罗大佑你知道吗？",
    "日本文学是什么？",
    "你读过日本文学吗？",
    "夏目漱石是谁？",
    "A比B高，B比C高，谁最高？",
    "所有A都是B，所有B都是C，A是C吗？",
    "我需要怎么提问？",
    "你知道我要干什么吗？",
    "你知道自己是谁吗？"
  ],
  50,
  (prompt, index) => ({
    prompt,
    expected_question_type: "question_like_not_ask_required",
    must_include_any: /罗大佑/.test(prompt)
      ? ["罗大佑", "台湾", "音乐人"]
      : /日本文学|夏目/.test(prompt)
        ? ["日本文学", "夏目", "作家", "作品", "不是人"]
        : /A比B/.test(prompt)
          ? ["A"]
          : /所有A/.test(prompt)
            ? ["是", "成立", "A", "C"]
            : /提问/.test(prompt)
              ? ["直接问", "对象", "方向"]
              : /自己/.test(prompt)
                ? ["对话框", "本地", "边界"]
                : index % 2 === 0
                  ? ["不知道", "目标"]
                  : ["从这几轮看", "测试", "目标"]
  })
);

const entityNotUnknown = repeat(
  "entity_not_unknown",
  [
    "你知道罗大佑吗？",
    "日本文学是什么？",
    "夏目漱石是谁？",
    "川端康成是谁？",
    "村上春树是谁？",
    "杜尚是什么人？",
    "存在主义是什么？",
    "德里达是什么人？",
    "摄影是什么？",
    "another_brain是什么？",
    "对话框是什么？"
  ],
  50,
  (prompt) => ({
    prompt,
    expected_question_type: "entity_or_domain_overview",
    must_include_any: /罗大佑/.test(prompt)
      ? ["罗大佑", "台湾", "音乐人"]
      : /日本文学|夏目|川端|村上/.test(prompt)
        ? ["日本文学", "作家", "作品", "文学", "小说家"]
      : /another_brain|对话框/.test(prompt)
          ? ["对话框", "本地", "边界", "项目", "被叫过"]
          : ["可以", "理解", "边界", "不是"]
  })
);

const noBareWhichSide = repeat(
  "no_bare_which_side",
  ["哪一边？", "什么哪一边？", "你刚才说哪一边是什么意思？", "我需要怎么问？", "继续说", "为什么？", "什么发生过？"],
  40,
  (prompt, index) => ({
    prompt,
    compact_state: index % 2 === 0 ? { recentTurns: [{ question: "罗大佑有什么代表作？", answer: "你要问哪一边？" }] } : {},
    expected_question_type: "no_bare_which_side",
    must_include_any: /继续|为什么/.test(prompt) ? [] : ["不该", "具体", "直接", "事件"]
  })
);

const fallbackRepair = repeat(
  "fallback_repair",
  ["什么发生过？", "哪一边？", "我不是已经问了吗？", "你刚才说什么？"],
  40,
  (prompt, index) => {
    const previous =
      index % 3 === 0
        ? { user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" }
        : index % 3 === 1
          ? { user: "罗大佑有什么代表作？", assistant: "你要问哪一边？" }
          : { user: "你读过日本文学吗？", assistant: "你需要提问。" };
    return {
      turns: [previous, { user: prompt }],
      expected_question_type: "fallback_repair",
      expected_operation: "repair_previous_bad_fallback",
      must_include_any: /发生过/.test(prompt)
        ? ["刚才", "罗大佑", "不是事件"]
        : /问了吗/.test(prompt)
          ? ["已经问了", "刚才", "不该"]
          : ["刚才", "不该", "直接问", "具体"]
    };
  }
);

const helpMetaCapability = repeat(
  "help_meta_capability",
  [
    "我需要怎么提问？",
    "你知道我要干什么吗？",
    "你能读日本文学吗？",
    "你听过罗大佑吗？",
    "你知道什么时候停下吗？",
    "你知道什么？",
    "你知道我是谁吗？"
  ],
  40,
  (prompt, index) => ({
    prompt,
    compact_state: index % 4 === 0 ? { recentTurns: [{ question: "你是不是又答偏了？", answer: "我刚才答偏了。" }] } : {},
    expected_question_type: "help_meta_capability",
    must_include_any: /提问/.test(prompt)
      ? ["直接问", "对象", "方向"]
      : /开始/.test(prompt)
        ? ["直接问"]
      : /干什么/.test(prompt)
        ? ["不知道", "从这几轮看", "目标", "测试"]
        : /读|听/.test(prompt)
          ? ["不是人", "没有人的", "知识", "罗大佑", "日本文学"]
          : /我是谁/.test(prompt)
            ? ["不能", "不知道", "记忆", "个人"]
            : ["本地", "知道", "边界", "证据"]
  })
);

const reasoning = repeat(
  "reasoning_not_fallback",
  [
    "十二减四再加九，结果？",
    "A比B高，B比C高，谁最高？",
    "所有会飞的都不是鱼，小鸟会飞，小鸟是鱼吗？",
    "所有A都是B，所有B都是C，A一定是C吗？",
    "有3个苹果吃掉1个还剩几个？"
  ],
  40,
  (prompt) => ({
    prompt,
    expected_question_type: "reasoning_not_fallback",
    must_include_any: /十二/.test(prompt)
      ? ["17", "十七"]
      : /A比B/.test(prompt)
        ? ["A"]
        : /小鸟/.test(prompt)
          ? ["不是", "鱼"]
          : /所有A/.test(prompt)
            ? ["是", "成立", "A"]
            : ["2", "二", "还剩"]
  })
);

const cultureNotMood = repeat(
  "culture_not_mood",
  [
    "罗大佑有什么作品？",
    "华语流行音乐怎么发展？",
    "日本文学代表作家有哪些？",
    "日本文学从哪里开始读？",
    "亚洲文学有哪些入口？",
    "艺术史怎么读？",
    "摄影史怎么发展？"
  ],
  40,
  (prompt) => ({
    prompt,
    expected_question_type: "culture_not_mood_fallback",
    must_include_any: /罗大佑|华语/.test(prompt)
      ? ["罗大佑", "华语", "音乐", "《", "台湾", "人物", "作品"]
      : /日本/.test(prompt)
        ? ["日本文学", "夏目漱石", "川端康成", "入门", "作家"]
        : /亚洲/.test(prompt)
          ? ["亚洲", "日本", "中国", "韩国", "入口"]
          : /摄影/.test(prompt)
            ? ["摄影", "观看", "记录", "历史"]
            : ["艺术", "作品", "运动", "历史"]
  })
);

const session16 = repeat(
  "session_16turn_repair",
  ["他有哪些代表作？", "什么发生过？", "哪一边？", "你知道我在测试什么吗？"],
  40,
  (prompt, index) => ({
    turns:
      index % 4 === 0
        ? [{ user: "我们聊罗大佑", assistant: "focus 罗大佑" }, ...Array.from({ length: 11 }, (_, i) => ({ user: `第${i + 2}轮`, assistant: "继续" })), { user: prompt }]
        : index % 4 === 1
          ? [{ user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" }, { user: prompt }]
          : index % 4 === 2
            ? [{ user: "罗大佑有什么代表作？", assistant: "你要问哪一边？" }, { user: prompt }]
            : [{ user: "你是不是答偏了？", assistant: "我刚才答偏了。" }, { user: prompt }],
    expected_question_type: "session_16turn_repair",
    must_include_any: /代表作/.test(prompt)
      ? []
      : /发生过/.test(prompt)
        ? ["刚才", "不是事件", "罗大佑"]
        : /哪一边/.test(prompt)
          ? ["不该", "具体", "直接问"]
          : ["从这几轮看", "测试", "答偏"]
  })
);

const files = {
  "question_like_not_ask_required.jsonl": questionLike,
  "entity_not_external_unknown.jsonl": entityNotUnknown,
  "no_bare_which_side.jsonl": noBareWhichSide,
  "fallback_repair.jsonl": fallbackRepair,
  "help_meta_capability.jsonl": helpMetaCapability,
  "reasoning_not_fallback.jsonl": reasoning,
  "culture_not_mood_fallback.jsonl": cultureNotMood,
  "session_16turn_repair.jsonl": session16,
  "safe_mode.jsonl": [
    row("safe_mode_controlled_gate_off", {
      prompt: "罗大佑是谁？",
      compact_state: { runtimeFeatureFlags: { controlledGateEnabled: false } },
      must_include_any: ["罗大佑", "台湾", "音乐人"]
    }),
    row("safe_mode_webgpu_off", {
      prompt: "A比B高，B比C高，谁最高？",
      compact_state: { runtimeFeatureFlags: { webGpuInferenceEnabled: false } },
      must_include_any: ["A"]
    }),
    row("safe_mode_external_cards_off", {
      prompt: "你读过日本文学吗？",
      compact_state: { runtimeFeatureFlags: { externalReviewCardsEnabled: false } },
      must_include_any: ["不是人", "日本文学", "知识"]
    })
  ]
};

async function main() {
  await mkdir(DIR, { recursive: true });
  let total = 0;
  for (const [file, rows] of Object.entries(files)) {
    total += rows.length;
    await writeFile(resolve(DIR, file), `${rows.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  }
  console.log(JSON.stringify({ ok: true, dir: DIR, total, files: Object.fromEntries(Object.entries(files).map(([file, rows]) => [file, rows.length])) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
