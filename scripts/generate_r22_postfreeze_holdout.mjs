#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { gitHead, jsonlRows, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_postfreeze_holdout.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/r22_postfreeze_holdout_generation_report.json");
const SEED = 220624;

const SESSIONS = [
  {
    id: "holdout_music_poetry_negative_confirmation",
    domain: "music",
    turns: [
      { user: "你知道王菲吗？" },
      { user: "是那个台湾歌手吗？", expected: "negative_or_uncertain_confirmation" },
      { user: "她的声音为什么会被说成有诗性？", expected_turn_function: "evaluation_request" },
      { user: "这更像一种留白，不是大段解释。", expected_turn_function: "analogy_statement" },
      { user: "那回到王菲，简单一点。", expected_turn_function: "topic_reentry" }
    ]
  },
  {
    id: "holdout_film_food_bridge",
    domain: "film",
    turns: [
      { user: "小津安二郎是谁？" },
      { user: "他的电影节奏像做菜吗？", expected_turn_function: "analogy_statement" },
      { user: "我不是说菜谱，是说火候。", expected_turn_function: "declaration_with_signal" },
      { user: "这句话听起来挺像诗。", expected_turn_function: "analogy_statement" },
      { user: "有没有一个更深的问题？", expected_turn_function: "deepening_invitation" }
    ]
  },
  {
    id: "holdout_law_boundary_surface",
    domain: "law",
    turns: [
      { user: "判例和小说解释有像的地方吗？", expected_turn_function: "abstract_comparison" },
      { user: "这个法律结论能直接套用吗？", expected: "boundary_preserved" },
      { user: "如果换个国家呢？", expected: "jurisdiction_uncertainty" },
      { user: "这不是让你给法律意见。", expected_turn_function: "declaration_with_signal" }
    ]
  },
  {
    id: "holdout_psychology_affective_boundary",
    domain: "psychology",
    turns: [
      { user: "我读到童年记忆的时候会羡慕那种写法。", expected_turn_function: "affective_disclosure" },
      { user: "这不等于你要诊断我。", expected_turn_function: "declaration_with_signal" },
      { user: "那它和文学有什么关系？", expected_turn_function: "contextual_followup" },
      { user: "嗯。", expected_turn_function: "quiet_declaration" }
    ]
  },
  {
    id: "holdout_urban_topic_return",
    domain: "urban",
    turns: [
      { user: "简雅各布斯怎么理解城市？" },
      { user: "街道和小说场景有点像。", expected_turn_function: "analogy_statement" },
      { user: "先跳到技术，界面也会组织人的动作。", expected_turn_function: "topic_shift" },
      { user: "回到街道，那个相似点是什么？", expected_turn_function: "topic_reentry" },
      { user: "说得短一点。", expected_turn_function: "transform_last_answer" }
    ]
  }
];

function stringifyRows(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

async function main() {
  await updateR22State({ current_phase: "phase8_generate_postfreeze_holdout" });
  const rows = SESSIONS.map((session, index) => ({
    ...session,
    seed: SEED,
    holdout_index: index + 1,
    generated_after_runtime_freeze: true,
    exact_prompt_branch_forbidden: true
  }));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, stringifyRows(rows), "utf8");
  const report = {
    execution_ok: true,
    behavior_ok: true,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    seed: SEED,
    rows: rows.length,
    turns: rows.reduce((sum, row) => sum + row.turns.length, 0),
    out: OUT,
    generated_ids: rows.map((row) => row.id)
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({ current_phase: "phase8_generate_postfreeze_holdout_done" });
  console.log(JSON.stringify({ seed: SEED, rows: report.rows, turns: report.turns, out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
