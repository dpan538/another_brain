#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { ROOT } from "../r18_utils.mjs";
import { normalizeSurfaceSkeleton } from "../../web/controlled_surface_variation.js";

const MATRIX_PATH = resolve(ROOT, "artifacts/surface_variation/phase2_diagnostic_matrix.json");
const OUT = resolve(ROOT, "artifacts/surface_variation/browser_variation_transcripts.json");
const WEB_ROOT = resolve(ROOT, "web");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SEPARATE_SESSION_COUNT = 5;
const SAME_SESSION_REPETITIONS = 3;
const FORBIDDEN_RE =
  /(这个音乐对象|这个电影对象|华语流行里的入口|电影叙事里的入口|先看|重点在于|换个说法|我明白。这里先|本地知识卡|当前会话|runtime|schema|pack|\brural\b|\burban\b|\bmandopop\b)/i;

function clean(value) {
  return String(value || "").trim();
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

async function waitForReady(cdp) {
  await cdp.send("Runtime.evaluate", {
    expression: `new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const ready = document.querySelector("#prompt") && document.querySelector("#chatForm") && typeof window.exportAnotherBrainDebugReport === "function";
        if (ready) { resolve(true); return; }
        if (Date.now() - started > 7000) { reject(new Error("app readiness timeout")); return; }
        setTimeout(tick, 50);
      };
      tick();
    })`,
    awaitPromise: true
  });
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
        if ((answer && (!status || status.hidden)) || Date.now() - started > 9000) {
          let debug = null;
          try { debug = window.exportAnotherBrainDebugReport({ download: false, includeTranscript: true }); } catch (error) { debug = { error: String(error && error.message || error) }; }
          resolve({ answer, debug, skeleton: ${JSON.stringify("__SKELETON_PLACEHOLDER__")} });
          return;
        }
        setTimeout(tick, 80);
      };
      tick();
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  const value = result.result?.value || { answer: "", debug: null };
  return { ...value, skeleton: normalizeSurfaceSkeleton(value.answer || "") };
}

function duplicateStats(answers = []) {
  const exact = new Set(answers.map(clean));
  const skeletons = new Set(answers.map(normalizeSurfaceSkeleton));
  return {
    answer_count: answers.length,
    unique_exact: exact.size,
    unique_skeletons: skeletons.size,
    exact_duplicate: exact.size < answers.length,
    skeleton_duplicate: skeletons.size < answers.length
  };
}

function failuresFor(turn = {}) {
  const failures = [];
  if (!clean(turn.answer)) failures.push("empty_answer");
  if (FORBIDDEN_RE.test(turn.answer || "")) failures.push("implementation_or_profile_leakage");
  return failures;
}

async function run() {
  if (!existsSync(CHROME_PATH)) throw new Error(`Chrome not found at ${CHROME_PATH}`);
  const matrix = JSON.parse(await readFile(MATRIX_PATH, "utf8"));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : matrix.cases.length;
  const cases = matrix.cases.slice(0, Number.isFinite(limit) && limit > 0 ? limit : matrix.cases.length);
  const { server, url } = await startServer();
  const userDataDir = resolve(tmpdir(), `another-brain-variation-${Date.now()}`);
  const chrome = spawn(CHROME_PATH, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "--no-first-run", "--disable-background-networking", "--window-size=390,844", `${url}?variation_browser=1`]);
  let cdp = null;
  try {
    cdp = await connectCdp(await pageEndpoint(await waitForDevTools(chrome)));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    const results = [];
    for (let index = 0; index < cases.length; index += 1) {
      if (index === 0 || index % 25 === 0) console.error(`[variation-browser] ${index}/${cases.length}`);
      const testCase = cases[index];
      const separate = [];
      for (let sessionIndex = 0; sessionIndex < SEPARATE_SESSION_COUNT; sessionIndex += 1) {
        await cdp.send("Page.navigate", { url: `${url}?variation_browser=1&case=${index}&session=${sessionIndex}` });
        await waitForReady(cdp);
        separate.push(await submitPrompt(cdp, testCase.prompt));
      }
      await cdp.send("Page.navigate", { url: `${url}?variation_browser=1&case=${index}&repeat=1` });
      await waitForReady(cdp);
      const same = [];
      for (let repeat = 0; repeat < SAME_SESSION_REPETITIONS; repeat += 1) same.push(await submitPrompt(cdp, testCase.prompt));
      const all = [...separate, ...same];
      results.push({
        prompt: testCase.prompt,
        group: testCase.group,
        bucket: testCase.bucket || "",
        separate_sessions: separate,
        same_session_repetitions: same,
        stats: {
          separate: duplicateStats(separate.map((item) => item.answer)),
          same_session: duplicateStats(same.map((item) => item.answer))
        },
        hard_failures: all.flatMap((turn, turnIndex) => failuresFor(turn).map((failure) => ({ turnIndex, failure })))
      });
    }
    console.error(`[variation-browser] ${cases.length}/${cases.length}`);
    const summary = {
      total_prompts: results.length,
      total_turns: results.length * (SEPARATE_SESSION_COUNT + SAME_SESSION_REPETITIONS),
      hard_failure_count: results.reduce((sum, row) => sum + row.hard_failures.length, 0),
      prompts_with_exact_repeat_same_session: results.filter((row) => row.stats.same_session.exact_duplicate).length,
      prompts_with_skeleton_repeat_same_session: results.filter((row) => row.stats.same_session.skeleton_duplicate).length,
      prompts_with_multiple_exact_variants: results.filter((row) => row.stats.same_session.unique_exact > 1 || row.stats.separate.unique_exact > 1).length,
      prompts_with_multiple_skeleton_variants: results.filter((row) => row.stats.same_session.unique_skeletons > 1 || row.stats.separate.unique_skeletons > 1).length
    };
    const report = {
      generated_at: new Date().toISOString(),
      matrix_seed: matrix.seed,
      limit: results.length,
      separate_session_count: SEPARATE_SESSION_COUNT,
      same_session_repetitions: SAME_SESSION_REPETITIONS,
      summary,
      results
    };
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ out: OUT, summary }, null, 2));
    if (summary.hard_failure_count) process.exit(2);
  } finally {
    if (cdp) cdp.close();
    chrome.kill("SIGTERM");
    server.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(2);
});
