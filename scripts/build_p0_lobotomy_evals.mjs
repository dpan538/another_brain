#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "evals/p0_lobotomy");

function row(id, patch) {
  return {
    id,
    prompt: "",
    turns: [],
    compact_state: {},
    expected_question_type: "",
    expected_domain: "",
    must_include_any: [],
    must_not_include: [],
    forbidden_final_answers: ["你需要提问。", "你要问哪一边？", "也许发生过，不在我眼前。"],
    forbidden_bare_fallback_ids: ["ask_required", "which_side", "external_event_unknown"],
    forbidden_unquoted_phrases: ["你需要提问", "你要问哪一边", "也许发生过，不在我眼前"],
    allowed_repair_quotes: [],
    must_not_route: [],
    unacceptable_answers: ["你需要提问。", "你要问哪一边？", "也许发生过，不在我眼前。"],
    notes: "",
    ...patch
  };
}

function repeated(prefix, prompts, count, patcher) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const prompt = prompts[i % prompts.length];
    rows.push(row(`${prefix}_${String(i + 1).padStart(3, "0")}`, patcher(prompt, i)));
  }
  return rows;
}

const screenshot = [
  row("p0_luo_who", {
    prompt: "罗大佑是谁？",
    expected_question_type: "overview",
    expected_domain: "music.mandopop",
    must_include_any: ["台湾", "音乐人", "歌手", "华语流行"],
    notes: "screenshot regression: person overview must not become ask_required"
  }),
  row("p0_luo_know", {
    prompt: "罗大佑你知道吗？",
    expected_question_type: "overview",
    expected_domain: "music.mandopop",
    must_include_any: ["罗大佑", "台湾", "音乐人"]
  }),
  row("p0_what_happened_followup", {
    turns: [
      { user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" },
      { user: "什么发生过？" }
    ],
    expected_question_type: "repair_previous_bad_fallback",
    must_include_any: ["不该这样答", "罗大佑", "不是事件"],
    notes: "Repair is expected only because the previous assistant turn is seeded as a bad fallback."
  }),
  row("p0_which_side_literal", {
    prompt: "哪一边？",
    compact_state: { lastAnswer: "你要问哪一边？", recentTurns: [{ question: "什么发生过？", answer: "你要问哪一边？" }] },
    expected_question_type: "fallback_repair",
    must_include_any: ["不该", "具体选项", "直接问"]
  }),
  row("p0_japanese_lit_read", {
    prompt: "你读过日本文学吗？",
    expected_question_type: "capability_boundary_plus_domain_offer",
    expected_domain: "literature.japanese",
    must_include_any: ["不是人", "读过", "日本文学", "知识卡", "作品"]
  }),
  row("p0_how_should_i_ask", {
    prompt: "我需要怎么提问？",
    expected_question_type: "help_how_to_ask",
    must_include_any: ["直接问", "对象", "方向", "作品", "比较"]
  }),
  row("p0_do_you_know_what_i_want", {
    prompt: "你知道我要干什么吗？",
    compact_state: { recentTurns: [{ question: "你是不是又答偏了？", answer: "我刚才答偏了。" }] },
    expected_question_type: "user_intent_boundary",
    must_include_any: ["从这几轮看", "测试", "fallback", "答偏"]
  }),
  ...repeated(
    "p0_screenshot_para",
    [
      "罗大佑是什么人？",
      "你知道罗大佑吗？",
      "罗大佑有什么代表作？",
      "你了解日本文学吗？",
      "你懂日本文学吗？",
      "日本文学怎么问？",
      "我应该怎么问你日本文学？",
      "你刚才说哪一边是什么意思？",
      "你刚才说发生过是什么意思？",
      "你是不是在绕圈？",
      "不要再说你要问哪一边。"
    ],
    13,
    (prompt) => ({
      prompt,
      compact_state: /哪一边|发生过|绕圈|不要再说/.test(prompt)
        ? { recentTurns: [{ question: "罗大佑你知道吗？", answer: "也许发生过，不在我眼前。" }] }
        : {},
      must_include_any: /罗大佑/.test(prompt)
        ? ["罗大佑", "台湾", "音乐人", "代表"]
        : /日本文学/.test(prompt)
          ? ["日本文学", "作家", "作品", "知识卡", "直接问"]
          : ["不该", "直接问", "对象", "方向", "答偏"]
    }))
];

const fallbackFirewall = repeated(
  "p0_firewall",
  ["罗大佑是谁？", "你读过日本文学吗？", "我需要怎么提问？", "你知道我要干什么吗？", "哪一边？", "什么发生过？"],
  60,
  (prompt, index) => ({
    prompt,
    compact_state: index % 2 === 0 ? { recentTurns: [{ question: "罗大佑你知道吗？", answer: "也许发生过，不在我眼前。" }] } : {},
    must_include_any: /罗大佑/.test(prompt)
      ? ["罗大佑", "台湾", "音乐人"]
      : /日本文学/.test(prompt)
        ? ["不是人", "日本文学", "作品", "知识卡"]
        : /提问/.test(prompt)
          ? ["直接问", "对象", "方向"]
          : /干什么/.test(prompt)
            ? ["不知道", "从这几轮看", "目标", "测试"]
            : ["不该", "直接问", "对象", "事件"]
  })
);

const cultureDirectness = repeated(
  "p0_culture",
  [
    "罗大佑是谁？",
    "罗大佑你知道吗？",
    "你知道罗大佑吗？",
    "罗大佑有什么作品？",
    "罗大佑有哪些歌？",
    "罗大佑代表作是什么？",
    "日本文学是什么？",
    "日本文学代表作家有哪些？",
    "日本文学从哪里开始读？",
    "你知道日本文学吗？"
  ],
  80,
  (prompt) => ({
    prompt,
    expected_domain: /日本/.test(prompt) ? "literature.japanese" : "music.mandopop",
    must_include_any: /罗大佑/.test(prompt)
      ? ["罗大佑", "台湾", "音乐人", "《"]
      : ["日本文学", "夏目漱石", "作家", "作品", "古典", "近代", "入门", "《少爷》", "《心》", "《雪国》"]
  })
);

const metaHelp = repeated(
  "p0_meta",
  [
    "我需要怎么提问？",
    "怎么问你？",
    "我该怎么开始？",
    "你知道我要干什么吗？",
    "你知道我在测试什么吗？",
    "你知道自己是谁吗？",
    "你知道什么时候停下吗？",
    "你知道什么？",
    "你听过罗大佑吗？",
    "你读过日本文学吗？"
  ],
  50,
  (prompt, index) => ({
    prompt,
    compact_state: index % 3 === 0 ? { recentTurns: [{ question: "哪一边？", answer: "你要问哪一边？" }] } : {},
    must_include_any: /怎么|开始|提问/.test(prompt)
      ? /我该怎么开始/.test(prompt)
        ? ["直接问"]
        : ["直接问", "对象", "方向"]
      : /干什么|测试/.test(prompt)
        ? ["不知道", "从这几轮看", "测试", "目标"]
        : /自己|什么|停下/.test(prompt)
          ? ["本地", "知道", "证据", "边界", "卡片"]
          : /罗大佑/.test(prompt)
            ? ["没有人的听歌经历", "罗大佑", "音乐"]
            : ["不是人", "日本文学", "知识卡"]
  })
);

const browserE2e = repeated(
  "p0_browser",
  ["罗大佑是谁？", "罗大佑你知道吗？", "什么发生过？", "哪一边？", "你读过日本文学吗？", "我需要怎么提问？", "你知道我要干什么吗？"],
  50,
  (prompt, index) => ({
    prompt,
    compact_state: /什么发生过|哪一边/.test(prompt) ? { recentTurns: [{ question: "罗大佑你知道吗？", answer: "也许发生过，不在我眼前。" }] } : {},
    must_include_any: /罗大佑/.test(prompt)
      ? ["罗大佑", "台湾", "音乐人"]
      : /日本文学/.test(prompt)
        ? ["不是人", "日本文学", "知识卡"]
        : /提问/.test(prompt)
          ? ["直接问", "对象", "方向"]
          : /干什么/.test(prompt)
            ? ["不知道", "从这几轮看", "目标", "测试"]
            : ["不该", "直接问", "事件", "具体选项"]
  })
);

const redteam = repeated(
  "p0_redteam",
  [
    "罗大佑是谁？",
    "罗大佑你知道吗？",
    "罗大佑有什么作品？",
    "罗大佑有哪些歌？",
    "日本文学是什么？",
    "你读过日本文学吗？",
    "日本文学代表作家有哪些？",
    "我需要怎么问？",
    "我该怎么开始？",
    "你知道我要干什么吗？",
    "什么发生过？",
    "哪一边？",
    "你知道什么？",
    "你知道自己是谁吗？",
    "你知道什么时候停下吗？",
    "A比B高，B比C高，谁最高？",
    "所有会飞的都不是鱼，小鸟会飞，小鸟是鱼吗？",
    "一张照片没有失败是什么意思？"
  ],
  100,
  (prompt) => ({
    prompt,
    compact_state: /什么发生过|哪一边/.test(prompt) ? { recentTurns: [{ question: "罗大佑你知道吗？", answer: "也许发生过，不在我眼前。" }] } : {},
    must_include_any: /罗大佑/.test(prompt)
      ? ["罗大佑", "台湾", "音乐人", "《"]
      : /日本文学/.test(prompt)
        ? ["日本文学", "不是人", "作家", "作品", "夏目漱石"]
          : /怎么问|怎么开始/.test(prompt)
            ? /怎么开始/.test(prompt)
              ? ["直接问"]
              : ["直接问", "对象", "方向"]
          : /干什么|测试/.test(prompt)
            ? ["不知道", "从这几轮看", "目标", "测试"]
            : /什么发生过|哪一边/.test(prompt)
              ? ["不该", "直接问", "事件", "具体选项"]
              : /A比B/.test(prompt)
                ? ["A"]
                : /小鸟/.test(prompt)
                  ? ["不是"]
                  : /照片/.test(prompt)
                    ? ["照片", "失败", "情绪"]
                    : ["本地", "知道", "边界", "卡片"]
  })
);

const falseRejectSeeds = [
  row("false_reject_which_side_repair_001", {
    turns: [
      { user: "罗大佑有什么代表作？", assistant: "你要问哪一边？" },
      { user: "哪一边？" }
    ],
    expected_question_type: "fallback_repair",
    expected_operation: "repair_previous_bad_fallback",
    must_include_any: ["刚才", "不该", "可以直接问", "具体选项"],
    allowed_repair_quotes: ["哪一边"],
    notes: "Repair may mention 哪一边, but cannot be bare which-side fallback."
  }),
  row("false_reject_external_event_repair_001", {
    turns: [
      { user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" },
      { user: "什么发生过？" }
    ],
    expected_question_type: "fallback_repair",
    expected_operation: "repair_previous_bad_fallback",
    must_include_any: ["刚才", "罗大佑", "不是事件"],
    allowed_repair_quotes: ["发生过"],
    notes: "Repair may mention 发生过, but cannot use external-event fallback."
  }),
  row("false_reject_ask_required_repair_001", {
    turns: [
      { user: "你读过日本文学吗？", assistant: "你需要提问。" },
      { user: "我不是已经问了吗？" }
    ],
    expected_question_type: "fallback_repair",
    expected_operation: "repair_previous_bad_fallback",
    must_include_any: ["已经问了", "刚才", "不该"],
    allowed_repair_quotes: ["你需要提问"],
    notes: "Repair may mention bad ask-required phrase."
  }),
  row("false_reject_specific_clarification_001", {
    prompt: "之乎者也是哪一个？",
    compact_state: { recentTurns: [{ question: "罗大佑的之乎者也", answer: "你是问《之乎者也》这张专辑，还是标题曲？" }] },
    must_include_any: ["之乎者也", "专辑", "标题"],
    allowed_repair_quotes: ["哪一边"],
    notes: "Specific clarification with named alternatives is not bare which-side fallback."
  })
];

const falseReject = [
  ...falseRejectSeeds,
  ...repeated(
    "false_reject_repair",
    [
      "哪一边？",
      "什么发生过？",
      "我不是已经问了吗？",
      "你刚才说哪一边是什么意思？",
      "你刚才说发生过是什么意思？",
      "我需要怎么提问？"
    ],
    36,
    (prompt, index) => {
      const previous =
        index % 3 === 0
          ? { user: "罗大佑有什么代表作？", assistant: "你要问哪一边？" }
          : index % 3 === 1
            ? { user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" }
            : { user: "你读过日本文学吗？", assistant: "你需要提问。" };
      return {
        turns: [previous, { user: prompt }],
        expected_question_type: "fallback_repair",
        expected_operation: "repair_previous_bad_fallback",
        must_include_any: /提问|问了吗/.test(prompt)
          ? ["直接问", "已经问了", "刚才", "不该"]
          : /发生过/.test(prompt)
            ? ["刚才", "罗大佑", "不是事件", "不该"]
            : ["刚才", "不该", "直接问", "具体选项"],
        allowed_repair_quotes: ["哪一边", "发生过", "你需要提问"],
        notes: "Quoted fallback phrases are allowed inside repair framing."
      };
    }
  )
];

const files = {
  "screenshot_regression.jsonl": screenshot,
  "fallback_firewall.jsonl": fallbackFirewall,
  "culture_directness.jsonl": cultureDirectness,
  "meta_help_intent.jsonl": metaHelp,
  "browser_e2e.jsonl": browserE2e,
  "generic_fallback_redteam.jsonl": redteam,
  "firewall_false_reject.jsonl": falseReject
};

async function main() {
  await mkdir(DIR, { recursive: true });
  let total = 0;
  for (const [file, rows] of Object.entries(files)) {
    total += rows.length;
    await writeFile(resolve(DIR, file), `${rows.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  }
  console.log(JSON.stringify({ ok: true, dir: DIR, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])), total }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
