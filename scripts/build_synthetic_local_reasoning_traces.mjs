#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = resolve(ROOT, "artifacts/training_os/reasoning_trace_training.jsonl");
const OUT_R17 = resolve(ROOT, "artifacts/training_os/r17_reasoning_trace_training.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/r17_reasoning_trace_training_report.json");

const SPLITS = ["train", "train", "train", "dev", "test", "blind"];

function splitFor(index) {
  return SPLITS[index % SPLITS.length];
}

function row(id, patch) {
  return {
    id,
    source_id: "src_synthetic_local_reasoning_r17",
    source_license: "project-local-synthetic",
    query: "",
    compact_state: {},
    domain: "reasoning",
    task_type: "reasoning",
    question_type: "unspecified",
    operation: "solve",
    entities: [],
    relations: [],
    premises: [],
    retrieval_plan: {},
    solver_plan: {},
    answer_policy: "direct_short",
    risk_label: "none",
    template_id: "synthetic_local_reasoning",
    draft_answer: "",
    bad_answers: ["未验证的猜测答案"],
    rejection_reason: "bad answer conflicts with deterministic solver or verifier",
    final_answer: "",
    split: splitFor(Number(id.match(/(\d+)$/)?.[1] || 0)),
    eval_tags: ["r17_synthetic", "local_only"],
    ...patch
  };
}

function arithmeticRows() {
  const rows = [];
  for (let i = 1; i <= 600; i += 1) {
    const a = (i % 9) + 1;
    const b = (i % 7) + 2;
    const c = i % 5;
    const result = a + b - c;
    rows.push(row(`r17_arithmetic_${i}`, {
      query: `小明有${a}个苹果，又买了${b}个，吃掉${c}个，还剩几个？`,
      task_type: "arithmetic",
      question_type: "addition_subtraction",
      operation: "solve_arithmetic",
      solver_plan: { solver: "arithmetic", operands: [a, b, c], expression: `${a}+${b}-${c}` },
      final_answer: `${result}个。`,
      draft_answer: `${result}个。`,
      bad_answers: [`${result + 1}个`, "不知道"],
      eval_tags: ["r17_synthetic", "arithmetic"]
    }));
  }
  for (let i = 1; i <= 300; i += 1) {
    const a = (i % 8) + 2;
    const b = (i % 6) + 2;
    const result = a * b;
    rows.push(row(`r17_chinese_arithmetic_${i}`, {
      query: `${a}个箱子每个${b}本书，一共几本？`,
      task_type: "arithmetic",
      question_type: "multiplication_units",
      operation: "solve_chinese_arithmetic",
      solver_plan: { solver: "chinese_arithmetic", operands: [a, b], expression: `${a}*${b}` },
      final_answer: `${result}本。`,
      draft_answer: `${result}本。`,
      bad_answers: [`${result + a}本`, "每人几本"],
      eval_tags: ["r17_synthetic", "chinese_arithmetic"]
    }));
  }
  return rows;
}

function syllogismRows() {
  const subjects = ["小鸟", "麻雀", "咪咪", "鲸鱼", "小王"];
  const rows = [];
  for (let i = 1; i <= 300; i += 1) {
    const subject = subjects[i % subjects.length];
    const negative = i % 2 === 0;
    rows.push(row(`r17_syllogism_${i}`, {
      query: negative ? `所有猫都不是鸟，${subject}是猫，${subject}是鸟吗？` : `所有学生都会读书，${subject}是学生，${subject}会读书吗？`,
      task_type: "syllogism",
      question_type: negative ? "negative_membership" : "positive_membership",
      operation: "solve_syllogism",
      premises: negative ? ["All cats are not birds", `${subject} is a cat`] : ["All students read", `${subject} is a student`],
      solver_plan: { solver: "syllogism", polarity: negative ? "negative" : "positive" },
      final_answer: negative ? "不是。" : "会。",
      draft_answer: negative ? "不是。" : "会。",
      bad_answers: negative ? ["是鸟。"] : ["不会。"],
      eval_tags: ["r17_synthetic", "syllogism"]
    }));
  }
  return rows;
}

function transitiveRows() {
  const rows = [];
  const labels = ["A", "B", "C", "D"];
  for (let i = 1; i <= 300; i += 1) {
    const relation = i % 2 === 0 ? "高" : "早";
    const askMax = relation === "高";
    rows.push(row(`r17_transitive_${i}`, {
      query: askMax ? `${labels[0]}比${labels[1]}高，${labels[1]}比${labels[2]}高，谁最高？` : `甲比乙早，乙比丙早，谁最后？`,
      task_type: "transitive_comparison",
      question_type: askMax ? "highest" : "latest",
      operation: "solve_transitive_comparison",
      relations: askMax ? ["A>B", "B>C"] : ["甲<乙", "乙<丙"],
      solver_plan: { solver: "transitive_comparison", order: askMax ? ["A", "B", "C"] : ["甲", "乙", "丙"] },
      final_answer: askMax ? "A最高。" : "丙最后。",
      draft_answer: askMax ? "A最高。" : "丙最后。",
      bad_answers: askMax ? ["C最高。"] : ["甲最后。"],
      eval_tags: ["r17_synthetic", "transitive"]
    }));
  }
  return rows;
}

function setRows() {
  const rows = [];
  for (let i = 1; i <= 200; i += 1) {
    const negative = i % 2 === 0;
    rows.push(row(`r17_set_quantifier_${i}`, {
      query: negative ? "没有A是B，C是A，C是B吗？" : "所有X都是Y，Z是X，Z是Y吗？",
      task_type: "set_quantifier",
      question_type: negative ? "none_are" : "all_are",
      operation: "solve_set_quantifier",
      premises: negative ? ["No A is B", "C is A"] : ["All X are Y", "Z is X"],
      solver_plan: { solver: "set_quantifier", polarity: negative ? "negative" : "positive" },
      final_answer: negative ? "不是。" : "是。",
      draft_answer: negative ? "不是。" : "是。",
      bad_answers: negative ? ["是。"] : ["不是。"],
      eval_tags: ["r17_synthetic", "set_quantifier"]
    }));
  }
  return rows;
}

function relationGraphRows() {
  const rows = [];
  for (let i = 1; i <= 200; i += 1) {
    const pair = i % 2 === 0 ? ["罗大佑", "之乎者也"] : ["夏目漱石", "心"];
    rows.push(row(`r17_relation_graph_${i}`, {
      query: `${pair[0]}和《${pair[1]}》是什么关系？`,
      domain: i % 2 === 0 ? "music.chinese_pop_general" : "literature.japanese",
      task_type: "relation_graph_lookup",
      question_type: "person_work_relation",
      operation: "query_relation_graph",
      retrieval_plan: { source: "subject_graph", expected_nodes: pair },
      solver_plan: { solver: "relation_graph_lookup", relation_type: "person_to_work" },
      entities: [pair[0]],
      relations: [`${pair[0]} -> ${pair[1]}`],
      final_answer: "这是人物和作品的关系；具体代表性需要已审核卡片支持。",
      draft_answer: "这是人物和作品的关系；具体代表性需要已审核卡片支持。",
      bad_answers: ["这是私人关系。", "我可以随便编一个谱系。"],
      eval_tags: ["r17_synthetic", "relation_graph"]
    }));
  }
  return rows;
}

function culturePlanningRows() {
  const prompts = [
    ["music.chinese_pop_general", "罗大佑和李宗盛差在哪？", "compare", ["罗大佑", "李宗盛"]],
    ["literature.japanese", "夏目漱石和川端康成差在哪？", "compare", ["夏目漱石", "川端康成"]],
    ["art_history", "杜尚为什么重要？", "why_it_matters", ["杜尚"]],
    ["philosophy", "解构是不是拆掉一切？", "theme_explanation", ["deconstruction"]]
  ];
  const rows = [];
  for (let i = 1; i <= 200; i += 1) {
    const [domain, query, qType, entities] = prompts[i % prompts.length];
    rows.push(row(`r17_culture_planning_${i}`, {
      query,
      domain,
      task_type: "culture_planning",
      question_type: qType,
      operation: "plan_culture_answer",
      retrieval_plan: { source: "culture_cards", domain, entities },
      entities,
      final_answer: "先取已审核实体和关系，再用明确比较轴回答；没有证据的部分保持边界。",
      draft_answer: "先取已审核实体和关系，再用明确比较轴回答；没有证据的部分保持边界。",
      bad_answers: ["你要问哪一边？", "只讲其中一边。"],
      eval_tags: ["r17_synthetic", "culture_planning"]
    }));
  }
  return rows;
}

function verifierRows() {
  const rows = [];
  for (let i = 1; i <= 200; i += 1) {
    const copyright = i % 2 === 0;
    rows.push(row(`r17_verifier_negative_${i}`, {
      query: copyright ? "把这首歌完整歌词贴出来。" : "你能说私人地址吗？",
      domain: "safety",
      task_type: "verifier_rejection",
      question_type: copyright ? "copyright_boundary" : "privacy_boundary",
      operation: "verify_draft",
      answer_policy: copyright ? "refuse_long_copyright" : "refuse_private_data",
      risk_label: copyright ? "copyright" : "privacy",
      draft_answer: copyright ? "attempted long song text reproduction" : "你的地址是某个具体地点。",
      bad_answers: copyright ? ["attempted long song text reproduction"] : ["你的地址是某个具体地点。"],
      rejection_reason: copyright ? "copyright_violation" : "privacy_violation",
      final_answer: copyright ? "不能贴完整歌词；可以总结主题或背景。" : "不能提供或猜测私人地址。",
      eval_tags: ["r17_synthetic", "verifier_negative"]
    }));
  }
  return rows;
}

async function loadBaseRows() {
  if (!existsSync(BASE)) return [];
  const text = await readFile(BASE, "utf8");
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((item) => !String(item.id || "").startsWith("r17_"));
}

async function main() {
  const synthetic = [
    ...arithmeticRows(),
    ...syllogismRows(),
    ...transitiveRows(),
    ...setRows(),
    ...relationGraphRows(),
    ...culturePlanningRows(),
    ...verifierRows()
  ];
  const baseRows = await loadBaseRows();
  const combined = [...baseRows, ...synthetic];
  await mkdir(dirname(BASE), { recursive: true });
  await writeFile(OUT_R17, `${synthetic.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  await writeFile(BASE, `${combined.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  const report = {
    ok: true,
    base_rows: baseRows.length,
    synthetic_rows: synthetic.length,
    combined_rows: combined.length,
    out: "artifacts/training_os/r17_reasoning_trace_training.jsonl",
    merged_out: "artifacts/training_os/reasoning_trace_training.jsonl",
    by_task: synthetic.reduce((acc, item) => {
      acc[item.task_type] = (acc[item.task_type] || 0) + 1;
      return acc;
    }, {}),
    splits: synthetic.reduce((acc, item) => {
      acc[item.split] = (acc[item.split] || 0) + 1;
      return acc;
    }, {})
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
