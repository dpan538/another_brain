#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r20_real_browser_e2e_report.json");
const CASES = resolve(ROOT, "evals/r20_browser_parity/mobile_core_sequences.jsonl");
const WEB_ROOT = resolve(ROOT, "web");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function mime(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "text/plain; charset=utf-8";
}

async function readSequences() {
  const text = await readFile(CASES, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
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
  return { server, url: `http://127.0.0.1:${server.address().port}/index.html?r20_browser=1` };
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
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || "CDP error"));
    else resolve(msg.result || {});
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
        const affordanceEl = document.querySelector("#quietAffordance");
        const affordance = affordanceEl && !affordanceEl.hidden ? affordanceEl.innerText.trim() : "";
        const status = document.querySelector("#status");
        if ((answer || affordance) && (!status || status.hidden) || Date.now() - started > 6000) {
          let debug = null;
          try { debug = window.exportAnotherBrainDebugReport({ download: false, includeTranscript: true }); } catch {}
          resolve({
            type: affordance && !answer ? "ui_affordance" : "answer",
            answer,
            affordance,
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
  return result.result?.value || { type: "unknown", answer: "", affordance: "", visibleTurns: 0 };
}

async function runRuntimeFallback(sequences) {
  const results = [];
  for (const sequence of sequences) {
    const runtime = createDialogRuntime();
    const turns = [];
    for (const prompt of sequence.turns || []) turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false, uiProfile: "mobile" }));
    results.push({ id: sequence.id, turns: turns.map((turn) => ({ prompt: turn.prompt, answer: turn.answer, type: turn.type || (turn.answer ? "answer" : "ui_affordance") })) });
  }
  return results;
}

async function runChrome(sequences) {
  if (!existsSync(CHROME_PATH)) return { attempted: true, available: false, reason: "Google Chrome not installed at expected path", browser: "", sequences: [] };
  const { server, url } = await startServer();
  const userDataDir = resolve(tmpdir(), `another-brain-r20-chrome-${Date.now()}`);
  const chrome = spawn(CHROME_PATH, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "--no-first-run", "--disable-background-networking", "--window-size=390,844", url]);
  let cdp = null;
  try {
    const browserWs = await waitForDevTools(chrome);
    cdp = await connectCdp(await pageEndpoint(browserWs));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    const reports = [];
    for (const sequence of sequences) {
      await cdp.send("Page.navigate", { url: `${url}&seq=${sequence.id}` });
      await new Promise((resolveLoad) => setTimeout(resolveLoad, 500));
      const turns = [];
      for (const prompt of sequence.turns || []) turns.push({ prompt, ...(await submitPrompt(cdp, prompt)) });
      reports.push({ id: sequence.id, turns });
    }
    return { attempted: true, available: true, browser: "Headless Chrome CDP", mobile_viewport: true, sequences: reports };
  } finally {
    if (cdp) cdp.close();
    chrome.kill("SIGTERM");
    server.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

function validateSequences(sequenceReports = []) {
  const failures = [];
  for (const sequence of sequenceReports) {
    sequence.turns.forEach((turn, index) => {
      const answer = String(turn.answer || "");
      if (Number(turn.visibleTurns || 0) > 4) failures.push({ id: sequence.id, index, prompt: turn.prompt, reason: "visible_turn_window_exceeded" });
      if (["嗯。", "这样啊。"].includes(turn.prompt) && turn.type !== "ui_affordance") failures.push({ id: sequence.id, index, prompt: turn.prompt, reason: "expected_ui_affordance" });
      for (const term of ["你需要提问", "你要问哪一边", "也许发生过，不在我眼前"]) {
        if (answer.includes(term)) failures.push({ id: sequence.id, index, prompt: turn.prompt, reason: `forbidden:${term}`, answer });
      }
      if (turn.prompt === "是否能简单一点？" && answer.length > 60) failures.push({ id: sequence.id, index, prompt: turn.prompt, reason: "simplify_too_long", answer });
    });
    const second = sequence.turns[1]?.answer || "";
    const third = sequence.turns[2]?.answer || "";
    if (second && third && second === third) failures.push({ id: sequence.id, reason: "turn2_turn3_exact_repeat" });
  }
  return failures;
}

async function main() {
  const sequences = await readSequences();
  const runtimeFallback = await runRuntimeFallback(sequences);
  let realBrowser;
  try {
    realBrowser = await runChrome(sequences);
  } catch (error) {
    realBrowser = { attempted: true, available: false, browser: "", mobile_viewport: true, reason: error.message, sequences: [] };
  }
  const browserFailures = realBrowser.available ? validateSequences(realBrowser.sequences) : [];
  const runtimeFailures = validateSequences(runtimeFallback);
  const report = {
    generated_at: new Date().toISOString(),
    attempted: true,
    available: Boolean(realBrowser.available),
    browser: realBrowser.browser || "",
    mobile_viewport: true,
    passed: Boolean(realBrowser.available) && browserFailures.length === 0,
    reason_if_unavailable: realBrowser.available ? "" : realBrowser.reason || "real browser unavailable",
    fallback_harness_used: true,
    real_browser_pass: Boolean(realBrowser.available) && browserFailures.length === 0,
    real_browser: realBrowser,
    runtime_fallback: runtimeFallback,
    browser_failures: browserFailures,
    runtime_failures: runtimeFailures
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ attempted: true, available: report.available, browser: report.browser, mobile_viewport: true, passed: report.passed, reason_if_unavailable: report.reason_if_unavailable, out: OUT }, null, 2));
  if (runtimeFailures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

