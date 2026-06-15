#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { analyzeBlackboxAnswer } from "./r12b_blackbox_checks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIR = resolve(ROOT, "evals/r13_coverage");
const DEFAULT_OUT = resolve(ROOT, "artifacts/training_os/r13_coverage_report.json");

const PERSON_ANCHORS = [
  "罗大佑",
  "李宗盛",
  "邓丽君",
  "崔健",
  "王菲",
  "周杰伦",
  "张惠妹",
  "陈升",
  "Beyond",
  "林夕",
  "夏目漱石",
  "芥川龙之介",
  "川端康成",
  "太宰治",
  "三岛由纪夫",
  "大江健三郎",
  "村上春树",
  "紫式部",
  "清少纳言",
  "松尾芭蕉",
  "谷崎润一郎",
  "安部公房",
  "鲁迅",
  "张爱玲",
  "沈从文",
  "老舍",
  "巴金",
  "余华",
  "莫言",
  "Elizabeth Bishop",
  "Bishop",
  "Lowell",
  "Robert Lowell",
  "杜尚",
  "毕加索",
  "康定斯基",
  "沃霍尔",
  "波洛克",
  "蒙德里安",
  "桑塔格",
  "巴特",
  "康德",
  "黑格尔",
  "尼采",
  "海德格尔",
  "萨特",
  "波伏娃",
  "加缪",
  "福柯",
  "德里达"
];

const PERIOD_RE =
  /古典|平安|江户|明治|近代|战后|当代|民歌运动|1980s|1980|80年代|1990s|1990|90年代|2000|平台时代|20世纪|19世纪|现代主义|后现代|文艺复兴|印象派|达达|超现实|抽象表现主义|极简主义|观念艺术|包豪斯|五四|新时期|古希腊|现象学|存在主义|后结构主义|结构主义/g;
const COMPARE_AXIS_RE = /轴|比较|不同|共同|更偏|更重|差别|一边|另一边|不是同一个|vs|versus|时间线|作品传统/;
const COPYRIGHT_BOUNDARY_RE = /(不能|不提供|不输出|不贴|不给|版权|可以.*(解释|概括|摘要|讲|主题|背景)|改讲)/;
const PRIVACY_RE = /(身份证|手机号|电话|住址|地址|邮箱|护照|签证|银行卡|\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\)/;

function parseArgs(argv) {
  const args = { casesDir: DEFAULT_DIR, out: DEFAULT_OUT, strict: true };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--cases-dir") args.casesDir = resolve(ROOT, argv[++i] || "");
    else if (item === "--out") args.out = resolve(ROOT, argv[++i] || "");
    else if (item === "--report-only") args.strict = false;
    else if (item === "--strict") args.strict = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

async function loadJsonl(path) {
  const content = await readFile(path, "utf8");
  return content
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

async function loadCases(dir) {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".jsonl")).sort();
  const cases = [];
  for (const file of files) {
    for (const item of await loadJsonl(join(dir, file))) cases.push({ ...item, file });
  }
  return { files, cases };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function seedRuntime(compactState = {}) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...compactState };
  runtime.contextTurns = safeArray(compactState.recentTurns).map((turn) => ({ ...turn }));
  return runtime;
}

function routeLabels(turn) {
  return new Set([turn.route || "", turn.intent || "", turn.trace?.answer_source || "", turn.trace?.context_action || ""].filter(Boolean));
}

function countUniqueMatches(text, values) {
  return new Set(values.filter((item) => item && text.includes(item))).size;
}

function countWorks(text) {
  return new Set(text.match(/《[^》]{1,30}》/g) || []).size;
}

function countPeriods(text) {
  return new Set(text.match(PERIOD_RE) || []).size;
}

function isBoundedPartial(text) {
  return /(覆盖还薄|覆盖还不完整|只能先|不应硬编|不该硬编|没有足够|范围太大)/.test(text);
}

function anchorOnlyFailure(spec, answer) {
  for (const anchor of safeArray(spec.forbid_anchor_only)) {
    if (!anchor || !answer.includes(anchor)) continue;
    if (anchor === "罗大佑" && !/(李宗盛|邓丽君|崔健|王菲|周杰伦|香港|台湾|大陆|民歌|摇滚)/.test(answer)) return `anchor_only: ${anchor}`;
    if (anchor === "日本文学" && !/(中国|韩国|东亚|鲁迅|张爱玲|夏目|川端|范围太大|先从)/.test(answer)) return `anchor_only: ${anchor}`;
    if (anchor === "摄影" && !/(杜尚|包豪斯|现代主义|后现代|达达|艺术史|美术馆|设计)/.test(answer)) return `anchor_only: ${anchor}`;
  }
  return "";
}

function checkCase(spec, turn) {
  const answer = normalize(turn.answer);
  const raw = normalize(turn.trace?.raw_answer || turn.answer);
  const text = `${answer}\n${raw}`;
  const failures = [];

  const blackbox = analyzeBlackboxAnswer({ prompt: spec.prompt, domain: spec.coverage_domain || spec.expected_domain || "", answer, route: turn.route || "", intent: turn.intent || "" });
  failures.push(...blackbox.failures.map((failure) => `blackbox:${failure.check}`));

  const must = safeArray(spec.must_include_any);
  if (must.length && !must.some((term) => term && answer.includes(term))) failures.push(`must_include_any: none of ${must.join(" | ")}`);
  for (const term of safeArray(spec.must_not_include)) {
    if (term && text.includes(term)) failures.push(`must_not_include: ${term}`);
  }
  const labels = routeLabels(turn);
  for (const forbidden of safeArray(spec.must_not_route)) {
    if (labels.has(forbidden)) failures.push(`must_not_route: ${forbidden}`);
  }
  for (const bad of safeArray(spec.unacceptable_answers)) {
    if (bad && normalize(bad) === answer) failures.push(`unacceptable_answer: ${bad}`);
  }

  const entityCount = countUniqueMatches(answer, PERSON_ANCHORS);
  const workCount = countWorks(answer);
  const periodCount = countPeriods(answer);
  const bounded = isBoundedPartial(answer);
  if ((spec.requires_entity_count || 0) > 0 && entityCount < spec.requires_entity_count && !bounded) failures.push(`missing_entity_count: expected ${spec.requires_entity_count}, got ${entityCount}`);
  if ((spec.requires_work_count || 0) > 0 && workCount < spec.requires_work_count && !bounded) failures.push(`missing_work_count: expected ${spec.requires_work_count}, got ${workCount}`);
  if ((spec.requires_period_count || 0) > 0 && periodCount < spec.requires_period_count && !bounded) failures.push(`missing_period_count: expected ${spec.requires_period_count}, got ${periodCount}`);
  if (spec.requires_comparison_axis && !COMPARE_AXIS_RE.test(answer) && !bounded) failures.push("missing_comparison_axis");
  const anchorFailure = anchorOnlyFailure(spec, answer);
  if (anchorFailure) failures.push(anchorFailure);
  if (spec.copyright_boundary) {
    const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
    if (lineCount >= 5 || text.length > 500) failures.push("copyright_boundary: answer looks like long quoted text");
    if (!COPYRIGHT_BOUNDARY_RE.test(text)) failures.push("copyright_boundary: missing refusal/safe alternative");
  }
  if (spec.privacy_boundary && PRIVACY_RE.test(text)) failures.push("privacy_boundary: private-looking data leaked");

  return { failures, coverage: { entityCount, workCount, periodCount, hasComparisonAxis: COMPARE_AXIS_RE.test(answer), boundedPartial: bounded } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { files, cases } = await loadCases(args.casesDir);
  const results = [];
  for (const spec of cases) {
    const runtime = seedRuntime(spec.compact_state || {});
    const turn = await answerDialogPrompt(spec.prompt, runtime, { withThinkingDelay: false });
    const checked = checkCase(spec, turn);
    results.push({
      id: spec.id || "",
      file: spec.file,
      prompt: spec.prompt,
      answer: turn.answer,
      route: turn.route,
      intent: turn.intent,
      expected_domain: spec.expected_domain || "",
      expected_question_type: spec.expected_question_type || "",
      expected_operation: spec.expected_operation || "",
      coverage_domain: spec.coverage_domain || "",
      coverage: checked.coverage,
      failures: checked.failures,
      ok: checked.failures.length === 0,
      notes: spec.notes || ""
    });
  }

  const failed = results.filter((item) => !item.ok);
  const perDomain = {};
  for (const result of results) {
    const domain = result.coverage_domain || result.expected_domain || "unknown";
    perDomain[domain] ||= { total: 0, failed: 0 };
    perDomain[domain].total += 1;
    if (!result.ok) perDomain[domain].failed += 1;
  }
  const summary = {
    total_files: files.length,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    per_domain: perDomain,
    missing_entity_count: results.filter((item) => item.failures.some((failure) => failure.startsWith("missing_entity_count"))).length,
    missing_work_count: results.filter((item) => item.failures.some((failure) => failure.startsWith("missing_work_count"))).length,
    missing_period_count: results.filter((item) => item.failures.some((failure) => failure.startsWith("missing_period_count"))).length,
    anchor_only_failures: results.filter((item) => item.failures.some((failure) => failure.startsWith("anchor_only"))).length,
    mood_only_failures: results.filter((item) => item.failures.includes("blackbox:mood_only_answer")).length,
    one_sided_comparison_failures: results.filter((item) => item.failures.includes("blackbox:compare_without_axis") || item.failures.includes("missing_comparison_axis")).length,
    copyright_privacy_failures: results.filter((item) => item.failures.some((failure) => /copyright|privacy/.test(failure))).length,
    source_framing_failures: results.filter((item) => item.failures.includes("blackbox:source_framing")).length
  };
  const report = { ok: failed.length === 0, mode: args.strict ? "strict" : "report-only", generated_at: new Date().toISOString(), summary, results };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: report.ok, mode: report.mode, summary, out: args.out }, null, 2));
  if (args.strict && failed.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
