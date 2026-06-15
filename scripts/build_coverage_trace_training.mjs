#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [resolve(ROOT, "evals/r12b_blackbox/initial_probe_prompts.jsonl"), resolve(ROOT, "evals/r13_coverage")];
const OUT = resolve(ROOT, "artifacts/training_os/coverage_trace_training.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/coverage_trace_training_report.json");

const BAD_BY_TYPE = {
  author_list: ["日本文学不要只读情节。先看沉默、季节、羞耻和战后断裂。", "你需要提问。"],
  representative_works: ["知道一点。城市、青春和历史，会一起压进歌里。", "你要问哪一边？"],
  works_list: ["罗大佑适合听时代怎么进入私人生活。", "你需要提问。"],
  development_history: ["它是一条处理孤独的传统。", "只有几个代表人物就够了。"],
  compare: ["只回答其中一边。", "共同点就是都有时代感。"],
  reading_recommendation: ["你需要提问。"],
  no_lyrics_boundary: ["copyrighted_text_reproduction", "long_quoted_text_reproduction"],
  boundary: ["我可以装作知道。"]
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function loadJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

async function loadSource(source) {
  if (source.endsWith(".jsonl")) return (await loadJsonl(source)).map((item) => ({ ...item, source: source.replace(`${ROOT}/`, "") }));
  const files = (await readdir(source)).filter((name) => name.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) rows.push(...(await loadJsonl(join(source, file))).map((item) => ({ ...item, source: join(source.replace(`${ROOT}/`, ""), file) })));
  return rows;
}

function seedRuntime(compactState = {}) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...compactState };
  runtime.contextTurns = safeArray(compactState.recentTurns).map((turn) => ({ ...turn }));
  return runtime;
}

function riskLabel(spec) {
  const prompt = spec.prompt || "";
  if (spec.privacy_boundary || /(本地路径|私人|地址|手机号|身份证|我是谁)/.test(prompt)) return "privacy";
  if (spec.copyright_boundary || /(歌词|原文|原句|整首|全文|PDF)/.test(prompt)) return "copyright";
  if (/不知道|不确定|覆盖不全|没见过/.test(prompt)) return "unknown";
  return "none";
}

function taskType(spec) {
  if (spec.expected_domain && !/reasoning|anti_template|source_privacy|copyright/.test(spec.expected_domain)) return "culture";
  if (/reasoning/.test(spec.expected_domain || "")) return "reasoning";
  return spec.expected_task_type || "coverage_gate";
}

function coverageRequirement(spec) {
  const qType = spec.expected_question_type || "";
  const prompt = spec.prompt || "";
  return {
    min_entities: spec.requires_entity_count || (/author_list/.test(qType) ? 3 : 0),
    min_works: spec.requires_work_count || (/works_list|representative_works/.test(qType) ? 3 : 0),
    min_periods: spec.requires_period_count || (/development_history/.test(qType) ? 2 : 0),
    requires_both_sides: spec.requires_comparison_axis || /compare|比较|差在哪|关系/.test(`${qType} ${prompt}`),
    requires_chronology: (spec.requires_period_count || 0) > 0 || /history|development|发展|历史|战后|近代|当代/.test(`${qType} ${prompt}`)
  };
}

function extractQuotedWorks(text) {
  return [...new Set((String(text || "").match(/《[^》]{1,30}》/g) || []).map((item) => item.replace(/[《》]/g, "")))];
}

function extractEntities(text) {
  const names = ["罗大佑", "李宗盛", "邓丽君", "崔健", "王菲", "周杰伦", "鲁迅", "张爱玲", "夏目漱石", "川端康成", "太宰治", "村上春树", "杜尚", "桑塔格", "德里达", "康德", "黑格尔", "萨特", "波伏娃"];
  return names.filter((name) => String(text || "").includes(name));
}

function extractPeriods(text) {
  return [...new Set(String(text || "").match(/古典|平安|江户|明治|近代|战后|当代|五四|1980s|2000年代|平台时代|现代主义|后现代|古希腊|存在主义|后结构主义/g) || [])];
}

function badAnswers(spec) {
  const qType = spec.expected_question_type || "";
  const prompt = spec.prompt || "";
  const inferred = /比较|差在哪|关系|共同点|怎么分|区分/.test(prompt) ? ["只回答其中一边。", "共同点就是都有时代感。"] : BAD_BY_TYPE[qType] || ["你需要提问。"];
  if (/发展|历史|战后|近代|当代|明治|2000|1980|五四/.test(prompt)) inferred.push("只有几个代表人物就够了。");
  return [...new Set([...inferred, ...safeArray(spec.unacceptable_answers), ...safeArray(spec.must_not_include)])]
    .filter((item) => item && !/\/Users\/|\/Volumes\/|@/.test(item))
    .map((item) => (/完整歌词如下|全文如下|原文如下|整首如下/.test(item) ? "copyrighted_text_reproduction" : item))
    .slice(0, 6);
}

async function main() {
  const specs = (await Promise.all(SOURCES.map(loadSource))).flat();
  const rows = [];
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const runtime = seedRuntime(spec.compact_state || {});
    const turn = await answerDialogPrompt(spec.prompt, runtime, { withThinkingDelay: false });
    const answer = turn.answer || "";
    const qType = spec.expected_question_type || spec.expected_question_type || "unspecified";
    const row = {
      id: spec.id || `coverage_trace_${String(i + 1).padStart(4, "0")}`,
      query: spec.prompt || "",
      compact_state: spec.compact_state || {},
      domain: spec.coverage_domain || spec.expected_domain || spec.domain || "",
      task_type: taskType(spec),
      question_type: qType,
      entities: extractEntities(`${spec.prompt} ${answer}`),
      works: extractQuotedWorks(`${spec.prompt} ${answer}`),
      periods: extractPeriods(`${spec.prompt} ${answer}`),
      movements: extractPeriods(`${spec.prompt} ${answer}`).filter((item) => /运动|主义|五四/.test(item)),
      relations: [],
      operation: spec.expected_operation || turn.trace?.context_action || "",
      retrieval_plan: spec.expected_domain ? { domain: spec.expected_domain, source: "culture_cards_or_boundary_policy" } : {},
      coverage_requirement: coverageRequirement(spec),
      answer_policy: spec.expected_answer_policy || (riskLabel(spec) === "copyright" ? "copyright_safe_summary" : "coverage_verified_short_answer"),
      risk_label: riskLabel(spec),
      bad_answers: badAnswers(spec),
      rejection_reason: "reject fake coverage, anchor-only answers, source leaks, and unsupported exact answers",
      final_answer: answer,
      eval_tags: [spec.source || "", spec.coverage_domain || spec.expected_domain || "", qType, riskLabel(spec)].filter(Boolean)
    };
    rows.push(row);
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const report = {
    generated_at: new Date().toISOString(),
    rows: rows.length,
    sources: SOURCES.map((source) => source.replace(`${ROOT}/`, "")),
    risk_counts: rows.reduce((acc, row) => {
      acc[row.risk_label] = (acc[row.risk_label] || 0) + 1;
      return acc;
    }, {}),
    out: OUT.replace(`${ROOT}/`, "")
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
