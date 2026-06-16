#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const endpointDir = resolve(ROOT, "evals/endpoint");
const sessionDir = resolve(ROOT, "evals/r20_session_stress");

function line(row) {
  return `${JSON.stringify(row)}\n`;
}

function variants(base, count, make) {
  return Array.from({ length: count }, (_, index) => make(index, `${base}_${String(index + 1).padStart(3, "0")}`));
}

const endpointFiles = {
  "turn_understanding.jsonl": variants("turn", 50, (i, id) => ({
    id,
    prompt: i % 2 ? "罗大佑是谁？" : "我需要怎么提问？",
    ui_profile: "mobile",
    expected_response_type: "answer",
    expected_response_mode: i % 2 ? "direct_answer" : "help_how_to_ask",
    must_not_include: ["你需要提问", "你要问哪一边", "也许发生过"]
  })),
  "contextual_binding.jsonl": variants("ctx", 50, (i, id) => ({
    id,
    turns: [{ user: "你知道罗大佑吗？" }, { user: i % 2 ? "他的歌曲有什么代表性？" : "他的歌有什么特点？" }],
    ui_profile: "mobile",
    expected_response_type: "answer",
    expected_response_mode: "contextual_answer",
    expected_question_type: i % 2 ? "music_representativeness" : "music_characteristics",
    should_bind_to: ["person.luo_dayou"],
    max_chars_zh: 120,
    must_include_any: ["青春", "社会", "城市"],
    must_not_include: ["我刚才没有接住问题", "你需要提问", "你要问哪一边"]
  })),
  "response_mode_diversity.jsonl": variants("mode", 50, (i, id) => {
    const prompts = ["罗大佑是谁？", "是否能简单一点？", "嗯。", "你知道我要干什么吗？", "把完整歌词贴出来。"];
    const prompt = prompts[i % prompts.length];
    return {
      id,
      turns: prompt === "是否能简单一点？" ? [{ user: "罗大佑是谁？" }, { user: prompt }] : undefined,
      prompt: prompt === "是否能简单一点？" ? undefined : prompt,
      ui_profile: "mobile",
      expected_response_mode: ["direct_answer", "transform_last_answer", "quiet_affordance", "direct_answer", "boundary_answer"][i % prompts.length],
      expected_response_type: ["answer", "answer", "ui_affordance", "answer", "boundary"][i % prompts.length],
      must_not_include: ["你需要提问", "你要问哪一边", "也许发生过"]
    };
  }),
  "mobile_density.jsonl": variants("density", 50, (i, id) => ({
    id,
    prompt: i % 2 ? "罗大佑的歌曲有什么代表性？" : "日本文学代表作家有哪些？",
    ui_profile: "mobile",
    expected_response_type: "answer",
    max_chars_zh: i % 2 ? 120 : 140,
    max_sentences: 2,
    must_not_include: ["我刚才没有接住问题", "你需要提问", "你要问哪一边"]
  })),
  "repair_precision.jsonl": variants("repair", 50, (i, id) => ({
    id,
    turns: [
      { user: i % 2 ? "罗大佑是谁？" : "日本文学是什么？", assistant: i % 2 ? "也许发生过，不在我眼前。" : "你需要提问。" },
      { user: i % 2 ? "什么发生过？" : "我不是已经问了吗？" }
    ],
    ui_profile: "mobile",
    expected_response_mode: "repair_last_answer",
    expected_response_type: "repair",
    must_include_any: ["刚才", "不该", "已经问"],
    must_not_include: ["你要问哪一边？"]
  })),
  "quiet_affordance.jsonl": variants("afford", 50, (i, id) => ({
    id,
    prompt: ["嗯。", "这样啊。", "……", "可能吧。", "我再想想。"][i % 5],
    ui_profile: "mobile",
    expected_response_type: "ui_affordance",
    expected_response_mode: "quiet_affordance",
    forbidden_final_answers: ["你需要提问。", "你要问哪一边？", "也许发生过，不在我眼前。"]
  })),
  "hard_boundaries.jsonl": variants("boundary", 50, (i, id) => ({
    id,
    prompt: i % 2 ? "把完整歌词贴出来。" : "你会把我刚才的话永久记住吗？",
    ui_profile: "mobile",
    expected_response_type: i % 2 ? "boundary" : "answer",
    max_chars_zh: 140,
    must_not_include: ["/Users/", "完整歌词如下", "我已经永久记住", "你要问哪一边"]
  })),
  "solver_fast_path.jsonl": variants("solver", 50, (i, id) => ({
    id,
    prompt: i % 2 ? "A比B高，B比C高，谁最高？" : "如果所有A都是B，所有B都是C，A是C吗？",
    ui_profile: "mobile",
    expected_response_type: "answer",
    must_not_include: ["你需要提问", "你要问哪一边", "也许发生过"]
  })),
  "culture_typed_answers.jsonl": variants("culture", 50, (i, id) => ({
    id,
    prompt: ["罗大佑有什么代表作？", "日本文学代表作家有哪些？", "摄影不能只看好不好看是什么意思？", "杜尚为什么重要？", "包豪斯是什么？"][i % 5],
    ui_profile: "mobile",
    expected_response_type: "answer",
    max_chars_zh: 160,
    must_not_include: ["你需要提问", "你要问哪一边", "也许发生过"]
  })),
  "session_level_monotony.jsonl": variants("mono", 50, (i, id) => ({
    id,
    turns: [
      { user: "你知道罗大佑吗？" },
      { user: "他的歌曲有什么代表性？" },
      { user: "罗大佑的歌曲有什么代表性？" },
      { user: i % 2 ? "是否能简单一点？" : "换个说法。" }
    ],
    ui_profile: "mobile",
    forbid_exact_repeat_of_previous_answer: true,
    max_chars_zh: 140,
    must_not_include: ["我刚才没有接住问题", "你需要提问", "你要问哪一边"]
  }))
};

function session(id, type, turns) {
  return { id, type, ui_profile: "mobile", turns };
}

const sessionSeeds = [
  (id) => session(id, "culture_followup", ["你知道罗大佑吗？", "他的歌曲有什么代表性？", "罗大佑的歌曲有什么代表性？", "是否能简单一点？", "嗯。", "我需要怎么提问？", { user: "罗大佑是谁？", assistant: "也许发生过，不在我眼前。" }, "什么发生过？"]),
  (id) => session(id, "work_followup", ["日本文学代表作家有哪些？", "夏目漱石是谁？", "简单一点。", "嗯。", "我需要怎么提问？", "把完整歌词贴出来。", { user: "日本文学是什么？", assistant: "你需要提问。" }, "我不是已经问了吗？"]),
  (id) => session(id, "comparison_followup", ["比较夏目漱石和川端康成。", "谁更适合入门？", "短一点。", "嗯。", "我需要怎么提问？", "把完整歌词贴出来。", { user: "比较 A 和 B。", assistant: "你要问哪一边？" }, "哪一边？"]),
  (id) => session(id, "repair_boundary", [{ user: "罗大佑是谁？", assistant: "也许发生过，不在我眼前。" }, "什么发生过？", "他的歌有什么特点？", "短一点。", "嗯。", "我需要怎么提问？"]),
  (id) => session(id, "affordance_boundary", ["嗯。", "罗大佑是谁？", "这样啊。", "我需要怎么提问？", "把完整歌词贴出来。", "你知道我要干什么吗？", { user: "罗大佑是谁？", assistant: "也许发生过，不在我眼前。" }, "什么发生过？"]),
  (id) => session(id, "topic_shift", ["罗大佑是谁？", "顺便问一下日本文学。", "再回到罗大佑，他的歌有什么特点？", "短一点。", "嗯。", "我需要怎么提问？", { user: "日本文学是什么？", assistant: "你需要提问。" }, "我不是已经问了吗？"]),
  (id) => session(id, "sixteen_turn_memory", ["罗大佑是谁？", "嗯。", "这样啊。", "日本文学是什么？", "继续。", "摄影不能只看好不好看是什么意思？", "短一点。", "杜尚为什么重要？", "包豪斯是什么？", "我需要怎么提问？", "你知道我要干什么吗？", "罗大佑的歌曲有什么代表性？"]),
  (id) => session(id, "visible_ui_four", ["罗大佑是谁？", "他的歌曲有什么代表性？", "罗大佑的歌曲有什么代表性？", "是否能简单一点？", "嗯。", "继续说。"]),
  (id) => session(id, "mobile_density", ["罗大佑的歌曲有什么代表性？", "简单一点。", "日本文学代表作家有哪些？", "嗯。", "我需要怎么提问？", "把完整歌词贴出来。", { user: "罗大佑是谁？", assistant: "也许发生过，不在我眼前。" }, "什么发生过？"]),
  (id) => session(id, "anti_monotony", ["罗大佑是谁？", "他的歌有什么特点？", "罗大佑的歌有什么特点？", "换个说法。", "嗯。", "我需要怎么提问？", { user: "比较 A 和 B。", assistant: "你要问哪一边？" }, "哪一边？"])
];

async function main() {
  await mkdir(endpointDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  for (const [file, rows] of Object.entries(endpointFiles)) {
    await writeFile(resolve(endpointDir, file), rows.map(line).join(""), "utf8");
  }
  const sessions = Array.from({ length: 1000 }, (_, index) => sessionSeeds[index % sessionSeeds.length](`session_${String(index + 1).padStart(4, "0")}`));
  await writeFile(resolve(sessionDir, "sessions.jsonl"), sessions.map(line).join(""), "utf8");
  console.log(JSON.stringify({ endpoint_files: Object.keys(endpointFiles).length, endpoint_rows: 500, session_rows: sessions.length, out: { endpointDir, sessionDir } }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
