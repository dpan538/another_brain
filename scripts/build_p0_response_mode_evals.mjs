#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "evals/p0_response_mode");

function row(data) {
  return JSON.stringify(data);
}

async function writeJsonl(name, rows) {
  await writeFile(resolve(DIR, name), `${rows.map(row).join("\n")}\n`, "utf8");
}

function variants(base, prompts) {
  return prompts.map((prompt, index) => ({ ...base(index), prompt }));
}

async function main() {
  await mkdir(DIR, { recursive: true });

  const luoSequences = [];
  const sequencePrompts = [
    ["你知道罗大佑吗？", "他的歌曲有什么代表性？", "是否能简单一点？"],
    ["罗大佑是谁？", "他的歌有什么特点？", "换个说法。"],
    ["罗大佑有什么代表作？", "这些歌代表在哪里？", "简单点。"],
    ["你知道罗大佑吗？", "说具体点。", "再短一点。"],
    ["罗大佑你知道吗？", "他的歌曲为什么重要？", "说人话。"]
  ];
  for (let i = 0; i < 30; i += 1) {
    const seq = sequencePrompts[i % sequencePrompts.length];
    const variant = i % sequencePrompts.length;
    const expectedModes =
      variant === 1
        ? ["culture_answer", "followup_answer", "rewrite_last_answer"]
        : variant === 3
          ? ["culture_answer", "expand_last_answer", "simplify_last_answer"]
          : ["culture_answer", "followup_answer", "simplify_last_answer"];
    const turnIncludes =
      variant === 2
        ? [["《之乎者也》", "《童年》", "代表作"], ["青春", "社会观察", "城市", "乡土"], ["简单", "青春", "社会"]]
        : variant === 3
          ? [["罗大佑", "台湾", "音乐人"], ["展开", "童年", "鹿港", "社会观察"], ["简单", "青春", "社会"]]
          : [["罗大佑", "台湾", "音乐人"], ["青春", "社会观察", "城市", "乡土", "《童年》"], ["简单", "换句话", "青春", "社会", "城市"]];
    luoSequences.push({
      id: `luo_rep_sequence_${String(i + 1).padStart(3, "0")}`,
      turns: seq.map((user) => ({ user })),
      expected_modes: expectedModes,
      must_include_any_by_turn: turnIncludes,
      must_not_include_any_turn: [
        "我刚才没有接住问题",
        "你可以直接说对象和方向",
        "你需要提问",
        "你要问哪一边",
        "也许发生过",
        "改变观看、阅读或判断关系",
        "观看关系",
        "阅读关系"
      ],
      notes: "Luo Dayou follow-up must remain normal follow-up/simplify, not repair."
    });
  }

  const simplifyRows = [];
  const simplifyPrompts = ["是否能简单一点？", "简单点。", "短一点。", "说人话。", "别那么玄。", "再短一点。", "能不能简单一点？", "换个说法。", "重新说。", "更具体一点。"];
  for (let i = 0; i < 50; i += 1) {
    const prompt = simplifyPrompts[i % simplifyPrompts.length];
    simplifyRows.push({
      id: `simplify_last_answer_${String(i + 1).padStart(3, "0")}`,
      turns: [
        { user: "罗大佑的歌曲有什么代表性？" },
        { user: prompt }
      ],
      expected_modes: ["culture_answer", /换个|重新|更具体/.test(prompt) ? "rewrite_last_answer" : "simplify_last_answer"],
      must_include_any_by_turn: [[], /换个|重新|更具体/.test(prompt) ? ["换句话", "具体", "青春"] : ["简单", "青春", "社会"]],
      must_not_include_any_turn: ["我刚才没有接住问题", "你可以直接说对象和方向", "你需要提问", "你要问哪一边", "也许发生过"]
    });
  }

  const repairRows = [];
  for (let i = 0; i < 20; i += 1) {
    repairRows.push({
      id: `repair_after_bad_previous_${String(i + 1).padStart(3, "0")}`,
      turns: [
        { user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" },
        { user: i % 2 ? "什么发生过？" : "你刚才答偏了。" }
      ],
      expected_modes: ["fallback_repair"],
      must_include_any_by_turn: [["刚才", "答偏", "罗大佑", "不是事件"]],
      forbidden_final_answers: ["也许发生过，不在我眼前。", "你要问哪一边？", "你需要提问。"]
    });
  }
  for (let i = 0; i < 15; i += 1) {
    repairRows.push({
      id: `repair_not_overtrigger_followup_${String(i + 1).padStart(3, "0")}`,
      turns: [{ user: "你知道罗大佑吗？" }, { user: i % 2 ? "他的歌曲有什么代表性？" : "这些歌代表在哪里？" }],
      expected_modes: ["culture_answer", "followup_answer"],
      must_include_any_by_turn: [[], ["青春", "社会观察", "城市", "乡土"]],
      must_not_include_any_turn: ["我刚才没有接住问题", "你可以直接说对象和方向"]
    });
  }
  for (let i = 0; i < 15; i += 1) {
    repairRows.push({
      id: `repair_not_overtrigger_simplify_${String(i + 1).padStart(3, "0")}`,
      turns: [{ user: "罗大佑的歌曲有什么代表性？" }, { user: i % 2 ? "是否能简单一点？" : "说人话。" }],
      expected_modes: ["culture_answer", "simplify_last_answer"],
      must_include_any_by_turn: [[], ["简单", "青春", "社会"]],
      must_not_include_any_turn: ["我刚才没有接住问题", "你可以直接说对象和方向"]
    });
  }

  const methodRows = [];
  const methodPrompts = [
    "罗大佑的歌有什么代表性？",
    "他的歌曲有什么特点？",
    "《童年》为什么重要？",
    "《鹿港小镇》代表在哪里？",
    "华语流行音乐的代表性是什么？",
    "罗大佑这些歌为什么重要？",
    "他的歌有什么特点？",
    "罗大佑歌曲代表在哪里？"
  ];
  for (let i = 0; i < 40; i += 1) {
    const prompt = methodPrompts[i % methodPrompts.length];
    methodRows.push({
      id: `method_leak_music_${String(i + 1).padStart(3, "0")}`,
      turns: prompt.includes("他的") ? [{ user: "你知道罗大佑吗？" }, { user: prompt }] : [{ user: prompt }],
      expected_modes: prompt.includes("他的") ? ["culture_answer", "followup_answer"] : ["culture_answer"],
      must_not_include_any_turn: ["改变观看、阅读或判断关系", "观看关系", "阅读关系", "图像关系", "我刚才没有接住问题"]
    });
  }

  const matrixPrompts = [
    ["罗大佑是谁？", "culture_answer"],
    ["罗大佑的歌曲有什么代表性？", "culture_answer"],
    ["日本文学是什么？", "culture_answer"],
    ["我需要怎么提问？", "help_how_to_ask"],
    ["A比B高，B比C高，谁最高？", "solver_answer"],
    ["嗯。", "quiet_affordance"],
    ["这样啊。", "quiet_affordance"],
    ["你知道我要干什么吗？", "direct_answer"],
    ["你读过日本文学吗？", "culture_answer"],
    ["完整歌词贴出来。", "boundary_answer"]
  ];
  const matrixRows = [];
  for (let i = 0; i < 100; i += 1) {
    const [prompt, mode] = matrixPrompts[i % matrixPrompts.length];
    matrixRows.push({
      id: `response_mode_matrix_${String(i + 1).padStart(3, "0")}`,
      prompt,
      expected_response_mode: mode,
      must_not_include: ["你需要提问", "你要问哪一边", "也许发生过，不在我眼前"]
    });
  }

  const stateRows = [];
  for (let i = 0; i < 40; i += 1) {
    stateRows.push({
      id: `session_state_quality_${String(i + 1).padStart(3, "0")}`,
      turns: [
        { user: "你知道罗大佑吗？" },
        { user: i % 2 ? "他的歌曲有什么代表性？" : "是否能简单一点？" }
      ],
      require_state_fields: ["lastAnswerQuality", "lastResponseMode", "activeEntityIds", "lastQuestionType", "lastOperation", "lastAnswerSummary"],
      expected_active_entity: "person.luo_dayou",
      must_not_include_any_turn: ["我刚才没有接住问题", "你可以直接说对象和方向"]
    });
  }

  await writeJsonl("luo_followup_sequence.jsonl", luoSequences);
  await writeJsonl("simplify_last_answer.jsonl", simplifyRows);
  await writeJsonl("repair_not_overtrigger.jsonl", repairRows);
  await writeJsonl("method_leak_music.jsonl", methodRows);
  await writeJsonl("response_mode_matrix.jsonl", matrixRows);
  await writeJsonl("session_state_quality.jsonl", stateRows);

  console.log(JSON.stringify({
    out: DIR,
    counts: {
      luo_followup_sequence: luoSequences.length,
      simplify_last_answer: simplifyRows.length,
      repair_not_overtrigger: repairRows.length,
      method_leak_music: methodRows.length,
      response_mode_matrix: matrixRows.length,
      session_state_quality: stateRows.length,
      total: luoSequences.length + simplifyRows.length + repairRows.length + methodRows.length + matrixRows.length + stateRows.length
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
