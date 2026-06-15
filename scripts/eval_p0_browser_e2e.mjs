#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const CASES = resolve(ROOT, "evals/p0_lobotomy/browser_e2e.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/p0_browser_e2e_report.json");
const WEB_ROOT = resolve(ROOT, "web");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function loadCases() {
  const text = await readFile(CASES, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function hasAny(answer, terms) {
  return !terms?.length || terms.some((term) => answer.includes(term));
}

async function runRuntimeEquivalent(spec) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...(spec.compact_state || {}) };
  runtime.contextTurns = Array.isArray(spec.compact_state?.recentTurns) ? spec.compact_state.recentTurns.map((turn) => ({ ...turn })) : [];
  const turn = await answerDialogPrompt(spec.prompt, runtime, { withThinkingDelay: false });
  const failures = [];
  if (!hasAny(turn.answer, spec.must_include_any || [])) failures.push("must_include_any");
  for (const term of spec.must_not_include || []) {
    if (turn.answer.includes(term)) failures.push(`must_not_include:${term}`);
  }
  return { id: spec.id, prompt: spec.prompt, answer: turn.answer, route: turn.route, ok: failures.length === 0, failures };
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
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = server.address().port;
  return { server, url: `http://127.0.0.1:${port}/index.html?p0_browser=1` };
}

function waitForDevTools(process) {
  return new Promise((resolveDevTools, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("timed out waiting for Chrome DevTools endpoint")), 10000);
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
    const { resolve: ok, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || "CDP error"));
    else ok(msg.result || {});
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

async function submitPrompt(cdp, prompt) {
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const prompt = ${JSON.stringify(prompt)};
      const input = document.querySelector("#prompt");
      input.value = prompt;
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
        const affordanceEl = document.querySelector("#quietAffordance");
        const affordance = affordanceEl && !affordanceEl.hidden ? affordanceEl.innerText.trim() : "";
        const status = document.querySelector("#status");
        const done = (answer || affordance) && (!status || status.hidden);
        if (done || Date.now() - started > 5000) {
          let debug = null;
          try { debug = window.exportAnotherBrainDebugReport({ download: false, includeTranscript: true }); } catch {}
          resolve({
            type: affordance && !answer ? "ui_affordance" : "answer",
            answer,
            affordance,
            done,
            visibleTurns: document.querySelectorAll(".turn").length,
            debug
          });
          return;
        }
        setTimeout(tick, 80);
      };
      tick();
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  return result.result?.value || { answer: "", done: false, debug: null };
}

async function runRealChromeSequences() {
  if (!existsSync(CHROME_PATH)) {
    return { attempted: true, available: false, ran: false, reason: "Google Chrome not installed at expected path", sequences: [] };
  }
  const { server, url } = await startServer();
  const userDataDir = resolve(tmpdir(), `another-brain-p0-chrome-${Date.now()}`);
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-background-networking",
    "--window-size=390,844",
    url
  ]);
  let cdp = null;
  try {
    const browserWs = await waitForDevTools(chrome);
    cdp = await connectCdp(await pageEndpoint(browserWs));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    const sequences = [
      ["罗大佑是谁？", "罗大佑你知道吗？", "什么发生过？", "哪一边？"],
      ["你读过日本文学吗？", "我需要怎么提问？", "你知道我要干什么吗？"],
      ["罗大佑是谁？", "有点怪。", "罗大佑你知道吗？", "什么发生过？", "这样啊。", "我需要怎么提问？", "嗯。"]
    ];
    const sequenceReports = [];
    for (const sequence of sequences) {
      await cdp.send("Page.navigate", { url: `${url}&seq=${sequenceReports.length}` });
      await new Promise((resolveLoad) => setTimeout(resolveLoad, 500));
      const turns = [];
      for (const prompt of sequence) turns.push({ prompt, ...(await submitPrompt(cdp, prompt)) });
      sequenceReports.push({ prompts: sequence, turns });
    }
    return { attempted: true, available: true, ran: true, reason: "", sequences: sequenceReports };
  } finally {
    if (cdp) cdp.close();
    chrome.kill("SIGTERM");
    server.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const cases = await loadCases();
  let playwright = null;
  try {
    playwright = await import("playwright");
  } catch {
    playwright = null;
  }
  const runtimeResults = [];
  for (const spec of cases) runtimeResults.push(await runRuntimeEquivalent(spec));
  const runtimeFailures = runtimeResults.filter((row) => !row.ok);
  let realBrowser = { attempted: true, available: false, ran: false, reason: "not run", sequences: [] };
  try {
    realBrowser = await runRealChromeSequences();
  } catch (error) {
    realBrowser = { attempted: true, available: false, ran: false, reason: error.message, sequences: [] };
  }
  const browserFailures = [];
  for (const seq of realBrowser.sequences || []) {
    for (const turn of seq.turns || []) {
      const answer = String(turn.answer || "");
      if (["这样啊。", "嗯。"].includes(turn.prompt) && turn.type !== "ui_affordance") {
        browserFailures.push({ prompt: turn.prompt, answer, term: "expected_ui_affordance" });
      }
      if (turn.type === "ui_affordance" && answer) {
        browserFailures.push({ prompt: turn.prompt, answer, term: "affordance_rendered_as_answer" });
      }
      if (Number(turn.visibleTurns || 0) > 4) {
        browserFailures.push({ prompt: turn.prompt, answer, term: "visible_turn_window_exceeded" });
      }
      for (const term of ["你需要提问", "你要问哪一边？", "也许发生过，不在我眼前"]) {
        if (answer.trim() === term || answer.includes("也许发生过，不在我眼前")) browserFailures.push({ prompt: turn.prompt, answer, term });
      }
    }
  }
  const report = {
    generated_at: new Date().toISOString(),
    attempted: true,
    browser_available: Boolean(playwright),
    browser_ran: Boolean(realBrowser.ran),
    mobile_viewport: { width: 390, height: 844 },
    reason: realBrowser.ran ? "Headless Chrome CDP mobile smoke ran; Playwright not required." : realBrowser.reason || "runtime-equivalent P0 checks ran instead.",
    real_browser: realBrowser,
    total: cases.length,
    passed: cases.length - runtimeFailures.length,
    failed: runtimeFailures.length,
    runtime_equivalent_results: runtimeResults,
    browser_failures: browserFailures,
    failures: [...runtimeFailures, ...browserFailures].slice(0, 50)
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: runtimeFailures.length === 0 && browserFailures.length === 0, browser_available: report.browser_available, browser_ran: report.browser_ran, total: report.total, failed: report.failed, browser_failures: browserFailures.length, out: OUT }, null, 2));
  if (runtimeFailures.length || browserFailures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
