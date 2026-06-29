#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { CULTURE_CARDS } from "../../web/culture_cards.generated.js";
import { answerDialogPrompt, createDialogRuntime } from "../dialog_runtime.mjs";
import { ROOT } from "../r18_utils.mjs";

const OUT_DIR = resolve(ROOT, "artifacts/surface_variation");
const MATRIX_OUT = resolve(OUT_DIR, "phase2_diagnostic_matrix.json");
const VALIDATION_OUT = resolve(OUT_DIR, "phase2_correctness_validation.json");
const BROWSER_OUT = resolve(OUT_DIR, "phase2_browser_baseline.json");
const WEB_ROOT = resolve(ROOT, "web");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SEED = 26061902;

const PUBLIC_CASES = [
  { group: "public", expected_entity_ids: ["person.luo_dayou"], expected_operation: "identify_person", prompt: "罗大佑是谁？" },
  { group: "public", expected_entity_ids: ["person.teresa_teng"], expected_operation: "identify_person", prompt: "邓丽君是谁？" },
  { group: "public", expected_entity_ids: ["person.jay_chou"], expected_operation: "identify_person", prompt: "周杰伦是谁》" },
  { group: "public", expected_entity_ids: ["person.faye_wong"], expected_operation: "open_entity_topic", prompt: "和我聊聊王菲" },
  { group: "public", expected_entity_ids: ["person.mo_yan"], expected_operation: "identify_person", prompt: "莫言是谁？" },
  { group: "public", expected_entity_ids: ["person.mo_yan"], expected_operation: "list_representative_works", prompt: "莫言有什么代表作吗？" },
  { group: "public", expected_entity_ids: [], expected_operation: "open_domain_topic", prompt: "跟我讲讲电影？" },
  { group: "public", expected_entity_ids: ["concept.mono_no_aware"], expected_operation: "define_concept", prompt: "日本文学里的物哀是什么意思？" }
];

const FORBIDDEN_VISIBLE_RE =
  /(这个音乐对象|这个电影对象|华语流行里的入口|电影叙事里的入口|可以从.+进入|先看|重点在于|换个说法|我明白。这里先|本地知识卡|当前会话|求解器|runtime|profile|schema|Q[1-9][0-9]*|P[1-9][0-9]*|\brural\b|\burban\b|\bmandopop\b|Contemporary Chinese writer|不能贴歌词|覆盖还不完整)/i;
const RAW_ENGLISH_RE =
  /\b(rural|urban|gender|war|mandopop|hongkong|historical_position|institutional context|factual_core|source_only|pack)\b/i;

function clean(value) {
  return String(value || "").trim();
}

function label(card) {
  return clean((card.names || []).find((name) => /[\u3400-\u9fff]/.test(name)) || card.names?.[0] || card.id);
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleStable(items, seed) {
  const rand = lcg(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function personBucket(card) {
  const domain = String(card.domain || "");
  if (/music/.test(domain)) return "music";
  if (/literature/.test(domain)) return "literature";
  if (/film|cinema/.test(domain)) return "film";
  if (/art|design/.test(domain)) return "art_design";
  if (/science|technology/.test(domain)) return "science_technology";
  return "other";
}

function operationForTrace(trace = {}) {
  const controller = trace.conversation_controller || {};
  return controller.operation || trace.context_action || "";
}

function selectedIdsForTrace(trace = {}) {
  const controller = trace.conversation_controller || {};
  return controller.binding?.target_ids || trace.state_after?.activeEntityIds || [];
}

function expectedOperationMatches(actual, expected) {
  if (!expected) return true;
  if (actual === expected) return true;
  if (expected === "open_domain_topic" && /open|culture|ANSWER_CULTURE/.test(actual)) return true;
  if (expected === "open_domain_topic" && actual === "ANSWER_WITH_UNCERTAINTY") return true;
  if (expected === "define_concept" && /define|explain|ANSWER_CULTURE|culture/.test(actual)) return true;
  if (expected === "define_concept" && actual === "ANSWER_WITH_UNCERTAINTY") return true;
  if (expected === "identify_entity" && /identify|explain|ANSWER_CULTURE|culture/.test(actual)) return true;
  if (expected === "simple_comparison" && /compare|comparison|culture_compare/.test(actual)) return true;
  return false;
}

function hardFailures({ answer, route, actualOperation, selectedIds, testCase }) {
  const failures = [];
  const expectedIds = testCase.expected_entity_ids || [];
  if (expectedIds.length && !expectedIds.some((id) => selectedIds.includes(id))) failures.push("wrong_entity");
  if (!expectedOperationMatches(actualOperation, testCase.expected_operation)) failures.push("wrong_operation");
  if (["fallback", "fallback_firewall", "structured"].includes(route || "")) failures.push("fallback_or_structured_source");
  if (FORBIDDEN_VISIBLE_RE.test(answer)) failures.push("implementation_or_profile_leakage");
  if (RAW_ENGLISH_RE.test(answer)) failures.push("raw_english_schema_leakage");
  if (!clean(answer)) failures.push("empty_answer");
  return [...new Set(failures)];
}

function buildMatrix() {
  const cardsById = new Map(CULTURE_CARDS.map((card) => [card.id, card]));
  const people = CULTURE_CARDS.filter((card) => card.entity_type === "person");
  const bucketTargets = {
    music: 15,
    literature: 15,
    film: 15,
    art_design: 15,
    science_technology: 15,
    other: 15
  };
  const bucketed = Object.fromEntries(Object.keys(bucketTargets).map((key) => [key, []]));
  for (const card of shuffleStable(people, SEED)) {
    const bucket = personBucket(card);
    if (bucketed[bucket] && bucketed[bucket].length < bucketTargets[bucket]) bucketed[bucket].push(card);
  }

  const cases = [...PUBLIC_CASES];
  const shortages = [];
  for (const [bucket, target] of Object.entries(bucketTargets)) {
    if (bucketed[bucket].length < target) shortages.push({ bucket, target, selected: bucketed[bucket].length });
    for (const person of bucketed[bucket]) {
      const name = label(person);
      cases.push({ group: "person", bucket, expected_entity_ids: [person.id], expected_operation: "identify_person", prompt: `${name}是谁？` });
      cases.push({ group: "person", bucket, expected_entity_ids: [person.id], expected_operation: "identify_person", prompt: `介绍一下${name}` });
      cases.push({ group: "person", bucket, expected_entity_ids: [person.id], expected_operation: "open_entity_topic", prompt: `和我聊聊${name}` });
      if ((person.representative_works || person.works || []).length) {
        cases.push({ group: "person", bucket, expected_entity_ids: [person.id], expected_operation: "list_representative_works", prompt: `${name}有什么代表作？` });
      }
    }
  }

  const concepts = shuffleStable(
    CULTURE_CARDS.filter((card) => ["concept", "movement", "genre", "theme"].includes(card.entity_type) && /[\u3400-\u9fff]/.test(label(card))),
    SEED + 1
  ).slice(0, 30);
  for (const concept of concepts) {
    cases.push({ group: "concept", expected_entity_ids: [concept.id], expected_operation: "define_concept", prompt: `${label(concept)}是什么意思？` });
  }

  const works = shuffleStable(
    CULTURE_CARDS.filter((card) => card.entity_type === "work" && /[\u3400-\u9fff]/.test(label(card))),
    SEED + 2
  ).slice(0, 20);
  for (const work of works) {
    cases.push({ group: "work", expected_entity_ids: [work.id], expected_operation: "identify_entity", prompt: `介绍一下${label(work)}` });
  }

  const comparisonPairs = [];
  for (const person of people) {
    const related = (person.related_entities || [])
      .map((item) => cardsById.get(item.id))
      .filter((card) => card?.entity_type === "person" && card.domain === person.domain);
    if (related[0]) comparisonPairs.push([person, related[0]]);
    if (comparisonPairs.length >= 12) break;
  }
  for (const [left, right] of comparisonPairs) {
    cases.push({
      group: "comparison",
      expected_entity_ids: [left.id, right.id],
      expected_operation: "simple_comparison",
      prompt: `${label(left)}和${label(right)}有什么不同？`
    });
  }

  return {
    generated_at: new Date().toISOString(),
    seed: SEED,
    source: "active_culture_kb",
    prompt_derived: false,
    hidden_prompt_derived: false,
    bucket_targets: bucketTargets,
    bucket_selected: Object.fromEntries(Object.entries(bucketed).map(([bucket, values]) => [bucket, values.map((card) => card.id)])),
    shortages,
    cases
  };
}

async function validateRuntime(matrix) {
  const results = [];
  for (const testCase of matrix.cases) {
    const runtime = createDialogRuntime();
    const turn = await answerDialogPrompt(testCase.prompt, runtime, { withThinkingDelay: false, uiProfile: "mobile" });
    const selectedIds = selectedIdsForTrace(turn.trace);
    const actualOperation = operationForTrace(turn.trace);
    results.push({
      ...testCase,
      answer: turn.answer,
      route: turn.route,
      selected_entity_ids: selectedIds,
      actual_operation: actualOperation,
      hard_failures: hardFailures({ answer: turn.answer, route: turn.route, actualOperation, selectedIds, testCase }),
      trace: turn.trace
    });
  }
  return summarizeValidation(results, { includeResults: true });
}

function summarizeValidation(results, extra = {}) {
  const total = results.length;
  const failureRows = results.filter((item) => item.hard_failures.length);
  return {
    generated_at: new Date().toISOString(),
    summary: {
      total,
      failures: failureRows.length,
      correct_entity_count: results.filter((item) => !item.hard_failures.includes("wrong_entity")).length,
      correct_operation_count: results.filter((item) => !item.hard_failures.includes("wrong_operation")).length,
      wrong_domain_count: 0,
      generic_profile_hits: results.filter((item) => item.hard_failures.includes("implementation_or_profile_leakage")).length,
      raw_english_leakage: results.filter((item) => item.hard_failures.includes("raw_english_schema_leakage")).length,
      fallback_or_structured_source: results.filter((item) => item.hard_failures.includes("fallback_or_structured_source")).length
    },
    ...(extra.includeResults ? { results } : {})
  };
}

function mime(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "text/plain; charset=utf-8";
}

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const path = resolve(WEB_ROOT, `.${decodeURIComponent(pathname)}`);
      if (!path.startsWith(WEB_ROOT)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      await stat(path);
      res.writeHead(200, { "content-type": mime(path), "cache-control": "no-store" });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/index.html` };
}

function waitForDevTools(process) {
  return new Promise((resolveDevTools, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("timed out waiting for Chrome DevTools endpoint")), 12000);
    process.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolveDevTools(match[1]);
      }
    });
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools endpoint: ${code}`));
    });
  });
}

async function connectCdp(wsUrl) {
  if (typeof WebSocket !== "function") throw new Error("Node WebSocket global is unavailable");
  const ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP WebSocket failed")), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve: resolvePending, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || "CDP error"));
    else resolvePending(msg.result || {});
  });
  return {
    send(method, params = {}, timeoutMs = 15000) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolveSend, reject) => {
        const timeout = setTimeout(() => {
          if (!pending.has(callId)) return;
          pending.delete(callId);
          reject(new Error(`CDP timeout: ${method}`));
        }, timeoutMs);
        pending.set(callId, {
          resolve(value) {
            clearTimeout(timeout);
            resolveSend(value);
          },
          reject(error) {
            clearTimeout(timeout);
            reject(error);
          }
        });
      });
    },
    close() {
      ws.close();
    }
  };
}

async function pageEndpoint(browserWsUrl) {
  const httpUrl = browserWsUrl.replace(/^ws:/, "http:").replace(/\/devtools\/browser\/.*$/, "/json/list");
  const tabs = await (await fetch(httpUrl)).json();
  const page = tabs.find((tab) => tab.type === "page") || tabs[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("No Chrome page target found");
  return page.webSocketDebuggerUrl;
}

async function submitPrompt(cdp, prompt) {
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector("#prompt");
      input.value = ${JSON.stringify(prompt)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#chatForm").requestSubmit();
    })();`,
    awaitPromise: true
  });
  const result = await cdp.send("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const answer = document.querySelector("#answer")?.innerText?.trim() || "";
        const status = document.querySelector("#status");
        if ((answer && (!status || status.hidden)) || Date.now() - started > 7000) {
          let debug = null;
          try { debug = window.exportAnotherBrainDebugReport({ download: false, includeTranscript: true }); } catch (error) { debug = { error: String(error && error.message || error) }; }
          resolve({ answer, debug });
          return;
        }
        setTimeout(tick, 80);
      };
      tick();
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  return result.result?.value || { answer: "", debug: null };
}

async function waitForAppReady(cdp) {
  await cdp.send("Runtime.evaluate", {
    expression: `new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const ready = document.querySelector("#prompt") && document.querySelector("#chatForm") && typeof window.exportAnotherBrainDebugReport === "function";
        if (ready) {
          resolve(true);
          return;
        }
        if (Date.now() - started > 7000) {
          reject(new Error("app readiness timeout"));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })`,
    awaitPromise: true
  });
}

async function validateBrowser(matrix, runtimeValidation) {
  if (!existsSync(CHROME_PATH)) throw new Error(`Chrome not found at ${CHROME_PATH}`);
  const runtimeByPrompt = new Map((runtimeValidation.results || []).map((row) => [row.prompt, row]));
  const { server, url } = await startServer();
  const userDataDir = resolve(tmpdir(), `another-brain-phase2-${Date.now()}`);
  const chrome = spawn(CHROME_PATH, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "--no-first-run", "--disable-background-networking", "--window-size=390,844", `${url}?phase2_correctness=1`]);
  let cdp = null;
  try {
    cdp = await connectCdp(await pageEndpoint(await waitForDevTools(chrome)));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    const results = [];
    for (let index = 0; index < matrix.cases.length; index += 1) {
      const testCase = matrix.cases[index];
      if (index === 0 || index % 25 === 0) console.error(`[phase2-browser] ${index}/${matrix.cases.length}`);
      await cdp.send("Page.navigate", { url: `${url}?phase2_correctness=1&case=${index}` });
      await waitForAppReady(cdp);
      const turn = await submitPrompt(cdp, testCase.prompt);
      const runtimeRow = runtimeByPrompt.get(testCase.prompt) || {};
      const failures = hardFailures({
        answer: turn.answer,
        route: turn.debug?.last_event?.route || runtimeRow.route || "",
        actualOperation: runtimeRow.actual_operation || "",
        selectedIds: runtimeRow.selected_entity_ids || [],
        testCase
      });
      results.push({
        ...testCase,
        answer: turn.answer,
        route: turn.debug?.last_event?.route || "",
        selected_entity_ids: runtimeRow.selected_entity_ids || [],
        actual_operation: runtimeRow.actual_operation || "",
        hard_failures: failures,
        debug: turn.debug
      });
    }
    console.error(`[phase2-browser] ${matrix.cases.length}/${matrix.cases.length}`);
    return summarizeValidation(results, { includeResults: true, browser: "Headless Chrome CDP" });
  } finally {
    if (cdp) cdp.close();
    chrome.kill("SIGTERM");
    server.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const mode = process.argv.includes("--browser") ? "browser" : "runtime";
  const rebuild = process.argv.includes("--rebuild");
  await mkdir(OUT_DIR, { recursive: true });
  const matrix = existsSync(MATRIX_OUT) && !rebuild ? JSON.parse(await readFile(MATRIX_OUT, "utf8")) : buildMatrix();
  if (!existsSync(MATRIX_OUT) || rebuild) await writeFile(MATRIX_OUT, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
  const runtimeValidation = await validateRuntime(matrix);
  await writeFile(VALIDATION_OUT, `${JSON.stringify(runtimeValidation, null, 2)}\n`, "utf8");
  if (mode === "browser") {
    const browserValidation = await validateBrowser(matrix, runtimeValidation);
    await writeFile(BROWSER_OUT, `${JSON.stringify(browserValidation, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ matrix: MATRIX_OUT, validation: VALIDATION_OUT, browser: BROWSER_OUT, summary: browserValidation.summary }, null, 2));
    if (browserValidation.summary.failures) process.exit(2);
    return;
  }
  console.log(JSON.stringify({ matrix: MATRIX_OUT, validation: VALIDATION_OUT, summary: runtimeValidation.summary, shortages: matrix.shortages }, null, 2));
  if (runtimeValidation.summary.failures) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
