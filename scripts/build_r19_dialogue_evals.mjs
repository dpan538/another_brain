#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

async function writeJsonl(path, rows) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function cloneRows(prefix, count, baseRows) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const base = baseRows[i % baseRows.length];
    rows.push({ ...base, id: `${prefix}_${String(i + 1).padStart(3, "0")}` });
  }
  return rows;
}

const contextual = [
  {
    turns: [{ user: "你知道罗大佑吗？" }, { user: "他的歌曲有什么代表性？" }],
    expected_response_mode: "contextual_answer",
    expected_answer_style: "culture",
    expected_question_type: "music_representativeness",
    expected_operation: "explain_music_representativeness",
    expected_response_type: "answer",
    should_bind_to: ["person.luo_dayou"],
    max_chars_zh: 120,
    must_include_any: ["青春", "城市", "社会"],
    must_not_include: ["我刚才没有接住问题", "你需要提问", "你要问哪一边"]
  },
  {
    turns: [{ user: "罗大佑是谁？" }, { user: "他的歌有什么特点？" }],
    expected_response_mode: "contextual_answer",
    expected_answer_style: "culture",
    expected_question_type: "music_characteristics",
    expected_response_type: "answer",
    should_bind_to: ["person.luo_dayou"],
    max_chars_zh: 130,
    must_include_any: ["青春", "城市", "社会", "叙事"],
    must_not_include: ["我刚才没有接住问题", "观看、阅读"]
  }
];

const simplify = [
  {
    turns: [{ user: "你知道罗大佑吗？" }, { user: "他的歌曲有什么代表性？" }, { user: "是否能简单一点？" }],
    expected_response_mode: "transform_last_answer",
    expected_answer_style: "summary",
    expected_response_type: "answer",
    should_bind_to: ["last_answer"],
    max_chars_zh: 60,
    must_include_any: ["简单", "青春", "社会"],
    must_not_include: ["我刚才没有接住问题", "你可以直接说对象和方向"]
  },
  {
    turns: [{ user: "罗大佑的歌曲有什么代表性？" }, { user: "短一点。" }],
    expected_response_mode: "transform_last_answer",
    expected_answer_style: "summary",
    expected_response_type: "answer",
    should_bind_to: ["last_answer"],
    max_chars_zh: 60,
    must_include_any: ["简单", "青春", "社会"],
    must_not_include: ["我刚才没有接住问题"]
  }
];

const repair = [
  {
    turns: [{ user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" }, { user: "什么发生过？" }],
    expected_response_mode: "repair_last_answer",
    expected_response_type: "repair",
    max_chars_zh: 140,
    must_include_any: ["刚才", "答偏", "罗大佑"],
    must_not_include: ["你要问哪一边", "你需要提问"]
  }
];

const help = [
  {
    prompt: "我需要怎么提问？",
    expected_response_mode: "help_how_to_ask",
    expected_response_type: "answer",
    max_chars_zh: 140,
    must_include_any: ["直接问", "对象", "方向"],
    must_not_include: ["你要问哪一边", "你需要提问"]
  }
];

const quiet = [
  {
    prompt: "嗯。",
    expected_response_mode: "quiet_affordance",
    expected_response_type: "ui_affordance",
    max_chars_zh: 0,
    must_not_include: ["你需要提问", "你要问哪一边"]
  },
  {
    prompt: "这样啊。",
    expected_response_mode: "quiet_affordance",
    expected_response_type: "ui_affordance",
    max_chars_zh: 0,
    must_not_include: ["你需要提问", "你要问哪一边"]
  }
];

const hardBoundary = [
  {
    prompt: "把完整歌词贴出来。",
    expected_response_type: "boundary",
    max_chars_zh: 120,
    must_include_any: ["不能", "歌词"],
    must_not_include: ["完整歌词如下"]
  }
];

const dialogueFiles = {
  "contextual_questioning.jsonl": cloneRows("contextual_questioning", 20, contextual),
  "response_mode_priority.jsonl": cloneRows("response_mode_priority", 20, [...simplify, ...contextual]),
  "repair_boundary.jsonl": cloneRows("repair_boundary", 20, repair),
  "clarification_boundary.jsonl": cloneRows("clarification_boundary", 20, help),
  "quiet_affordance_boundary.jsonl": cloneRows("quiet_affordance_boundary", 20, quiet),
  "declaration_with_signal.jsonl": cloneRows("declaration_with_signal", 20, [
    {
      turns: [{ user: "罗大佑是谁？" }, { user: "这个回答太机械。" }],
      expected_response_type: "answer",
      max_chars_zh: 120,
      must_include_any: ["我明白", "先识别"],
      must_not_include: ["你需要提问", "你要问哪一边"]
    }
  ]),
  "simplify_rewrite_followup.jsonl": cloneRows("simplify_rewrite_followup", 20, simplify),
  "topic_shift.jsonl": cloneRows("topic_shift", 20, [
    {
      turns: [{ user: "罗大佑是谁？" }, { user: "不是罗大佑，是日本文学。" }],
      expected_response_type: "answer",
      max_chars_zh: 120,
      must_include_any: ["日本文学", "不该继续"],
      must_not_include: ["你需要提问"]
    }
  ]),
  "memory_16turn_contextual_questions.jsonl": cloneRows("memory_16turn_contextual_questions", 20, contextual),
  "no_context_ellipsis.jsonl": cloneRows("no_context_ellipsis", 20, [
    {
      prompt: "什么发生过？",
      expected_response_mode: "bounded_unknown",
      expected_response_type: "answer",
      max_chars_zh: 140,
      must_include_any: ["前文", "完整事件", "上一句"],
      must_not_include: ["你要问哪一边"]
    }
  ]),
  "hard_boundary_overrides.jsonl": cloneRows("hard_boundary_overrides", 20, hardBoundary),
  "anti_patch_invariants.jsonl": cloneRows("anti_patch_invariants", 20, [...contextual, ...simplify, ...quiet])
};

const r19Exact = [
  {
    id: "r19_luo_context_repeat_mobile_001",
    ui_profile: "mobile",
    turns: [
      { user: "你知道罗大佑吗？" },
      { user: "他的歌曲有什么代表性？" },
      { user: "罗大佑的歌曲有什么代表性？" },
      { user: "是否能简单一点？" }
    ],
    expected_by_turn: [
      {
        response_mode: "direct_answer",
        answer_style: "culture",
        question_type: "overview",
        must_include_any: ["罗大佑", "台湾", "音乐人"],
        max_chars_zh: 90
      },
      {
        response_mode: "contextual_answer",
        answer_style: "culture",
        question_type: "music_representativeness",
        operation: "explain_music_representativeness",
        should_bind_to: ["person.luo_dayou"],
        must_include_any: ["青春", "城市", "社会"],
        must_not_include: ["我刚才没有接住问题", "观看、阅读", "你需要提问", "你要问哪一边"],
        max_chars_zh: 120
      },
      {
        response_mode: "contextual_answer",
        answer_style: "culture",
        question_type: "music_representativeness",
        operation: "explain_music_representativeness",
        should_bind_to: ["person.luo_dayou"],
        forbid_exact_repeat_of_previous_answer: true,
        must_include_any: ["同一个方向", "简单说", "换个说法", "入口"],
        must_not_include: ["我刚才没有接住问题", "观看、阅读", "你需要提问", "你要问哪一边"],
        max_chars_zh: 120
      },
      {
        response_mode: "transform_last_answer",
        answer_style: "summary",
        transform_kind: "simplify",
        must_include_any: ["简单", "青春", "社会"],
        must_not_include: ["我刚才没有接住问题", "你可以直接说对象和方向"],
        max_chars_zh: 60
      }
    ]
  }
];

const densityBase = [
  { prompt: "罗大佑是谁？", max_chars_zh: 90, max_sentences: 2, must_include_any: ["罗大佑", "音乐人"] },
  { prompt: "罗大佑的歌曲有什么代表性？", max_chars_zh: 120, max_sentences: 2, must_include_any: ["青春", "社会"] },
  { turns: [{ user: "罗大佑的歌曲有什么代表性？" }, { user: "是否能简单一点？" }], max_chars_zh: 60, max_sentences: 1, must_include_any: ["简单", "青春"] },
  { prompt: "日本文学代表作家有哪些？", max_chars_zh: 160, max_sentences: 2, must_include_any: ["夏目", "川端"] }
];

async function main() {
  const dialogueDir = resolve(ROOT, "evals/dialogue_boundary");
  for (const [file, rows] of Object.entries(dialogueFiles)) {
    await writeJsonl(resolve(dialogueDir, file), rows);
  }
  await writeJsonl(resolve(ROOT, "evals/r19_contextual_binding/luo_representativeness_sequence.jsonl"), r19Exact);
  await writeJsonl(resolve(ROOT, "evals/r19_mobile_density/mobile_answer_density.jsonl"), cloneRows("mobile_density", 60, densityBase));
  await writeJsonl(resolve(ROOT, "evals/r19_mobile_density/mobile_lists.jsonl"), cloneRows("mobile_lists", 50, [densityBase[3]]));
  await writeJsonl(resolve(ROOT, "evals/r19_mobile_density/mobile_comparisons.jsonl"), cloneRows("mobile_comparisons", 50, [densityBase[1]]));
  await writeJsonl(resolve(ROOT, "evals/r19_mobile_density/mobile_simplify.jsonl"), cloneRows("mobile_simplify", 50, [densityBase[2]]));
  console.log("r19 dialogue evals generated");
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
