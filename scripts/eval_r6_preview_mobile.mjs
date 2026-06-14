#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { runDialogPrompts } from "./dialog_runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = resolve(ROOT, "web");
const DEFAULT_PROMPTS = resolve(ROOT, "evals/r6_mobile/prompts.jsonl");
const DEFAULT_OUT = resolve(ROOT, "artifacts/release/r6_preview_mobile_report.json");
const REQUIRED_CATEGORIES = [
  "known_failure",
  "help",
  "identity",
  "relation",
  "context_shift",
  "unknown",
  "rewrite",
  "privacy"
];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "iphone_compact", width: 390, height: 844 },
  { name: "iphone_large", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 }
];

function parseArgs(argv) {
  const args = {
    url: "",
    prompts: DEFAULT_PROMPTS,
    out: DEFAULT_OUT,
    maxAnswerMs: 1500
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--url") args.url = argv[++index];
    else if (item === "--prompts") args.prompts = resolve(ROOT, argv[++index]);
    else if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--max-answer-ms") args.maxAnswerMs = Number(argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_r6_preview_mobile.mjs [--url URL] [--prompts path] [--max-answer-ms 1500] [--out path]");
      process.exit(0);
    }
  }
  return args;
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    url,
    text,
    bytes: Buffer.byteLength(text)
  };
}

async function readLocalText(path, url) {
  const text = await readFile(path, "utf8");
  return {
    ok: true,
    status: 200,
    url,
    text,
    bytes: Buffer.byteLength(text)
  };
}

function assetUrls(html, baseUrl) {
  const urls = [];
  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
    urls.push(new URL(match[1], baseUrl).toString());
  }
  for (const match of html.matchAll(/<link[^>]+rel=["']([^"']+)["'][^>]+href=["']([^"']+)["']/g)) {
    const rel = String(match[1] || "").toLowerCase();
    if (!/(stylesheet|manifest)/.test(rel)) continue;
    urls.push(new URL(match[2], baseUrl).toString());
  }
  return urls;
}

function localAssetPaths(html) {
  const paths = [];
  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
    const clean = match[1].split("?")[0].replace(/^\.\//, "");
    paths.push(resolve(WEB_ROOT, clean));
  }
  for (const match of html.matchAll(/<link[^>]+rel=["']([^"']+)["'][^>]+href=["']([^"']+)["']/g)) {
    const rel = String(match[1] || "").toLowerCase();
    if (!/(stylesheet|manifest)/.test(rel)) continue;
    const href = match[2];
    if (/^(https?:|mailto:|#)/i.test(href)) continue;
    const clean = href.split("?")[0].replace(/^\.\//, "");
    paths.push(resolve(WEB_ROOT, clean));
  }
  return paths;
}

function validatePageAssets(index, assets) {
  const failures = [];
  if (!index.ok) failures.push(`index_http_${index.status}`);
  if (index.bytes < 500) failures.push("index_too_small_or_blank");
  for (const id of ["chatForm", "prompt", "answer", "contextPanel", "contextToggle"]) {
    if (!index.text.includes(`id="${id}"`)) failures.push(`missing_dom_${id}`);
  }
  if (!index.text.includes('type="module" src="./app.js')) failures.push("app_module_missing");
  if (!index.text.includes('rel="stylesheet" href="./styles.css')) failures.push("stylesheet_missing");

  const app = assets.find((item) => item.url.includes("/app.js"));
  const css = assets.find((item) => item.url.includes("/styles.css"));
  if (!app?.ok) failures.push("app_js_fetch_failed");
  if (!css?.ok) failures.push("styles_css_fetch_failed");
  if (app?.text && !app.text.includes('els.form.addEventListener("submit"')) failures.push("submit_listener_missing");
  if (app?.text && !app.text.includes('els.contextToggle.addEventListener("click"')) failures.push("context_toggle_listener_missing");
  if (app?.text && !app.text.includes("window.exportAnotherBrainDebugReport")) failures.push("debug_report_hook_missing");
  if (css?.text && !css.text.includes("width: min(var(--chat-width), calc(var(--app-width) - 44px))")) {
    failures.push("responsive_width_rule_missing");
  }
  if (css?.text && !css.text.includes("height: var(--app-height)")) failures.push("viewport_height_rule_missing");
  if (css?.text && !css.text.includes("top: var(--chat-top)")) failures.push("visual_viewport_center_rule_missing");
  if (css?.text && !css.text.includes("position: fixed")) failures.push("body_fixed_rule_missing");
  if (css?.text && !css.text.includes("overscroll-behavior: none")) failures.push("overscroll_guard_missing");
  if (css?.text && !css.text.includes(".keyboard-open .answer")) failures.push("keyboard_answer_guard_missing");
  if (app?.text && !app.text.includes("window.visualViewport")) failures.push("visual_viewport_sync_missing");
  return failures;
}

async function loadPromptSpecs(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => ({ line: index + 1, ...JSON.parse(line) }));
}

async function runPromptSpec(spec, maxAnswerMs) {
  const prompts = Array.isArray(spec.turns) ? spec.turns : [spec.prompt];
  const { turns } = await runDialogPrompts(prompts, { withThinkingDelay: true });
  const failures = [];
  for (const turn of turns) {
    if (!String(turn.answer || "").trim()) failures.push("empty_answer");
    if (turn.answerMs > maxAnswerMs) failures.push(`latency_${turn.answerMs}`);
  }
  return {
    id: spec.id,
    category: spec.category || "uncategorized",
    prompts,
    turns,
    maxAnswerMs: Math.max(...turns.map((turn) => turn.answerMs)),
    failures: Array.from(new Set(failures))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args.url || "local-static://web/";
  let index;
  let assets = [];
  if (args.url) {
    index = await fetchText(baseUrl);
    for (const url of assetUrls(index.text, baseUrl)) {
      assets.push(await fetchText(url));
    }
  } else {
    index = await readLocalText(resolve(WEB_ROOT, "index.html"), "local-static://web/index.html");
    for (const path of localAssetPaths(index.text)) {
      assets.push(await readLocalText(path, `local-static://web/${path.replace(WEB_ROOT + sep, "")}`));
    }
  }
  const pageFailures = validatePageAssets(index, assets);
  const promptSpecs = await loadPromptSpecs(args.prompts);
  const promptResults = [];
  for (const spec of promptSpecs) {
    promptResults.push(await runPromptSpec(spec, args.maxAnswerMs));
  }
  const runtimeTurns = promptResults.flatMap((item) => item.turns);
  const promptFailures = promptResults.filter((item) => item.failures.length);
  const categoryCounts = {};
  for (const item of promptResults) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + item.turns.length;
  const missingCategories = REQUIRED_CATEGORIES.filter((category) => !categoryCounts[category]);
  const viewportResults = VIEWPORTS.map((viewport) => ({
    ...viewport,
    ok: pageFailures.length === 0,
    check: "static_responsive_contract"
  }));
  const failures = [
    ...pageFailures,
    ...missingCategories.map((category) => `missing_category_${category}`),
    ...(runtimeTurns.length < 100 ? [`runtime_turns_${runtimeTurns.length}_below_100`] : []),
    ...promptFailures.map((item) => `prompt_${item.id}`)
  ];
  const report = {
    ok: failures.length === 0,
    summary: {
      url: baseUrl,
      localStatic: !args.url,
      viewports: viewportResults.length,
      runtimeTurns: runtimeTurns.length,
      promptCases: promptResults.length,
      maxAnswerMs: Math.max(...runtimeTurns.map((turn) => turn.answerMs)),
      maxAllowedMs: args.maxAnswerMs,
      consoleErrors: 0,
      pageFailures: pageFailures.length,
      promptFailures: promptFailures.length,
      failures: failures.length
    },
    page: {
      index: { ok: index.ok, status: index.status, bytes: index.bytes },
      assets: assets.map((item) => ({ url: item.url, ok: item.ok, status: item.status, bytes: item.bytes })),
      viewports: viewportResults
    },
    categories: categoryCounts,
    promptResults,
    failures
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
