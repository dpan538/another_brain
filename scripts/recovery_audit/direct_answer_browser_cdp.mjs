#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { ROOT } from "../r18_utils.mjs";

const WEB_ROOT = resolve(ROOT, "web");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SAMPLE_PATH = resolve(ROOT, "artifacts/recovery/direct_answer_sibling_sample.json");
const VALIDATION_PATH = resolve(ROOT, "artifacts/recovery/direct_answer_validation.json");
const TRANSCRIPTS_OUT = resolve(ROOT, "artifacts/recovery/direct_answer_browser_transcripts.json");
const BEFORE_AFTER_OUT = resolve(ROOT, "artifacts/recovery/direct_answer_before_after.json");

const PUBLIC_CASES = [
  { group: "public", entity_id: "person.luo_dayou", operation: "identify_person", prompt: "罗大佑是谁？" },
  { group: "public", entity_id: "person.teresa_teng", operation: "identify_person", prompt: "邓丽君是谁？" },
  { group: "public", entity_id: "person.jay_chou", operation: "identify_person", prompt: "周杰伦是谁》" },
  { group: "public", entity_id: "person.faye_wong", operation: "open_entity_topic", prompt: "和我聊聊王菲" },
  { group: "public", entity_id: "person.mo_yan", operation: "identify_person", prompt: "莫言是谁？" },
  { group: "public", entity_id: "person.mo_yan", operation: "list_representative_works", prompt: "莫言有什么代表作吗？" }
];

const IMPLEMENTATION_RE = /(卡片|图谱|检索|runtime|schema|pack|覆盖还不完整|不能贴歌词|我会按|机械反问|入口|先看|这个音乐对象|这个文学对象)/i;
const RAW_ENGLISH_RE =
  /\b(rural|urban|gender|war|mandopop|hongkong|Contemporary Chinese writer|Singer whose|Singer-songwriter|producer whose|film director; period|mathematician|computer scientist|historical_position|institutional context)\b/i;

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
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
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
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolveSend, reject) => pending.set(callId, { resolve: resolveSend, reject }));
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

function promptFor(item, operation) {
  if (operation === "identify_person") return `${item.name}是谁？`;
  if (operation === "list_representative_works") return `${item.name}有什么代表作？`;
  return `和我聊聊${item.name}`;
}

function caseKey(item) {
  return [item.group || "", item.prompt || "", item.operation || item.expected_operation || ""].join("\u0000");
}

function validationMap(validation) {
  return new Map((validation.results || []).map((item) => [caseKey(item), item]));
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

function hardFailures(turn, expected, validationResult = {}) {
  const answer = String(turn.answer || "");
  const event = turn.debug?.last_event || {};
  const selected = validationResult.selected_entity_ids || [];
  const failures = [];
  if (!selected.includes(expected.entity_id)) failures.push("wrong_entity");
  if ((validationResult.operation || "") !== expected.operation) failures.push("wrong_operation");
  if (["fallback", "fallback_firewall", "structured"].includes(event.route || "")) failures.push("fallback_or_structured_source");
  if (IMPLEMENTATION_RE.test(answer)) failures.push("implementation_vocabulary");
  if (RAW_ENGLISH_RE.test(answer)) failures.push("raw_english_schema_value");
  for (const failure of validationResult.hard_invariant_failures || []) {
    if (!failures.includes(failure)) failures.push(failure);
  }
  return failures;
}

async function casesFromSample() {
  const sample = JSON.parse(await readFile(SAMPLE_PATH, "utf8"));
  return [
    ...PUBLIC_CASES,
    ...sample.selected.flatMap((item) => [
      { group: "sibling", family: item.family, entity_id: item.id, operation: "identify_person", prompt: promptFor(item, "identify_person") },
      { group: "sibling", family: item.family, entity_id: item.id, operation: "list_representative_works", prompt: promptFor(item, "list_representative_works") },
      { group: "sibling", family: item.family, entity_id: item.id, operation: "open_entity_topic", prompt: promptFor(item, "open_entity_topic") }
    ])
  ];
}

async function main() {
  if (!existsSync(CHROME_PATH)) throw new Error(`Chrome not found at ${CHROME_PATH}`);
  const validation = JSON.parse(await readFile(VALIDATION_PATH, "utf8"));
  const validated = validationMap(validation);
  const cases = await casesFromSample();
  const { server, url } = await startServer();
  const userDataDir = resolve(tmpdir(), `another-brain-direct-answer-${Date.now()}`);
  const chrome = spawn(CHROME_PATH, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "--no-first-run", "--disable-background-networking", "--window-size=390,844", `${url}?direct_answer_browser=1`]);
  let cdp = null;
  try {
    cdp = await connectCdp(await pageEndpoint(await waitForDevTools(chrome)));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    const after = [];
    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index];
      await cdp.send("Page.navigate", { url: `${url}?direct_answer_browser=1&case=${index}` });
      await new Promise((resolveLoad) => setTimeout(resolveLoad, 250));
      const turn = await submitPrompt(cdp, testCase.prompt);
      const event = turn.debug?.last_event || {};
      const validationResult = validated.get(caseKey(testCase)) || {};
      const selectedIds = validationResult.selected_entity_ids || [];
      const operation = validationResult.operation || "";
      const responseAct = validationResult.response_act || operation;
      after.push({
        phase: "after",
        group: testCase.group,
        family: testCase.family || "",
        prompt: testCase.prompt,
        answer: turn.answer,
        trace_id: `direct-answer-browser-${index}`,
        entity_id: selectedIds[0] || "",
        operation,
        response_act: responseAct,
        final_answer_source: event.route || validationResult.final_answer_source || "",
        hard_invariant_failures: hardFailures(turn, testCase, validationResult),
        debug: turn.debug
      });
    }
    const previousTranscripts = JSON.parse(await readFile(TRANSCRIPTS_OUT, "utf8").catch(() => "{}"));
    const previousBeforeAfter = JSON.parse(await readFile(BEFORE_AFTER_OUT, "utf8").catch(() => "{}"));
    const publicAfter = after.filter((item) => item.group === "public").map(({ debug, ...item }) => item);
    const transcriptReport = {
      ...(previousTranscripts || {}),
      generated_at: new Date().toISOString(),
      browser: "Headless Chrome CDP",
      validation_summary: validation.summary,
      after
    };
    const beforeAfterReport = {
      ...(previousBeforeAfter || {}),
      generated_at: new Date().toISOString(),
      after: publicAfter
    };
    await mkdir(dirname(TRANSCRIPTS_OUT), { recursive: true });
    await writeFile(TRANSCRIPTS_OUT, `${JSON.stringify(transcriptReport, null, 2)}\n`, "utf8");
    await writeFile(BEFORE_AFTER_OUT, `${JSON.stringify(beforeAfterReport, null, 2)}\n`, "utf8");
    const summary = {
      total: after.length,
      public_count: publicAfter.length,
      sibling_count: after.length - publicAfter.length,
      failures: after.filter((item) => item.hard_invariant_failures.length).length,
      out: TRANSCRIPTS_OUT
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failures) process.exit(2);
  } finally {
    if (cdp) cdp.close();
    chrome.kill("SIGTERM");
    server.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
