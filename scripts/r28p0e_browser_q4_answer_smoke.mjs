#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const WEB_ROOT = resolve(ROOT, "web");
const OUT = resolve(ROOT, "artifacts/r28p0e/reports/browser_q4_answer_smoke.json");
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

const SCENARIOS = [
  {
    id: "desktop_real_q4_answer",
    viewport: { width: 1365, height: 900, mobile: false, deviceScaleFactor: 1 },
    network: { latency: 20, downloadThroughput: 5_000_000, uploadThroughput: 1_000_000 },
    cpuRate: 1,
    readyTimeoutMs: 120_000
  },
  {
    id: "mobile_real_q4_answer",
    viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 },
    network: { latency: 40, downloadThroughput: 1_600_000, uploadThroughput: 750_000 },
    cpuRate: 4,
    readyTimeoutMs: 120_000
  },
  {
    id: "mobile_throttled_real_q4_answer",
    viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 },
    network: { latency: 180, downloadThroughput: 420_000, uploadThroughput: 120_000 },
    cpuRate: 4,
    readyTimeoutMs: 180_000
  }
];
const OPEN_Q4_PROMPT = "请比较本地资料里三条不同证据之间的关系，给出一个谨慎结论。";

function mime(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".bin")) return "application/octet-stream";
  return "text/plain; charset=utf-8";
}

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/index.html";
      if (pathname === "/another_brain_chat") pathname = "/another_brain_chat.html";
      if (pathname.endsWith("/")) pathname += "index.html";
      const path = resolve(WEB_ROOT, `.${pathname}`);
      if (!path.startsWith(WEB_ROOT)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const info = await stat(path);
      const headers = { "content-type": mime(path), "cache-control": "no-store", "content-length": String(info.size) };
      const range = req.headers.range;
      if (range && /^bytes=\d+-\d*$/.test(range)) {
        const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
        const start = Number(startRaw);
        const end = endRaw ? Number(endRaw) : start;
        const data = await readFile(path);
        res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${info.size}`, "content-length": String(end - start + 1) });
        res.end(data.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, headers);
      res.end(await readFile(path));
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function chromePath() {
  return CHROME_PATHS.find((path) => existsSync(path)) || "";
}

function waitForDevTools(proc) {
  return new Promise((resolveDevTools, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("devtools_endpoint_timeout")), 15_000);
    proc.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolveDevTools(match[1]);
    });
    proc.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`chrome_exited_before_devtools:${code}`));
    });
  });
}

async function connectCdp(wsUrl, events = []) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", () => reject(new Error("cdp_websocket_failed")), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (!msg.id) {
      if (["Runtime.consoleAPICalled", "Runtime.exceptionThrown", "Log.entryAdded", "Network.loadingFailed"].includes(msg.method)) events.push(msg);
      return;
    }
    if (!pending.has(msg.id)) return;
    const { resolve: ok, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || "cdp_error"));
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
  if (!page?.webSocketDebuggerUrl) throw new Error("no_page_target");
  return page.webSocketDebuggerUrl;
}

async function waitForValue(cdp, expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.result?.value) return result.result.value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  return null;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return result.result?.value;
}

async function runScenario(baseUrl, chrome, scenario) {
  const userDataDir = resolve(tmpdir(), `another-brain-r28p0e-${scenario.id}-${Date.now()}`);
  const proc = spawn(chrome, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-background-networking",
    "--disable-cache",
    `--window-size=${scenario.viewport.width},${scenario.viewport.height}`,
    "about:blank"
  ]);
  let cdp = null;
  const events = [];
  const started = Date.now();
  try {
    const browserWs = await waitForDevTools(proc);
    cdp = await connectCdp(await pageEndpoint(browserWs), events);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...scenario.network });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpuRate });
    await cdp.send("Emulation.setDeviceMetricsOverride", scenario.viewport);
    await cdp.send("Page.navigate", { url: `${baseUrl}/another_brain_chat/?q4_answer_smoke=${encodeURIComponent(scenario.id)}&mode=dashboard` });
    await waitForValue(cdp, `document.readyState === "complete"`, 12_000);
    await waitForValue(cdp, `window.__anotherBrainBootMetrics?.chat_interactive_ms !== null`, 5_000);
    const ready = await waitForValue(cdp, `window.__anotherBrainBootMetrics?.q4_status === "ready"`, scenario.readyTimeoutMs);
    const before = await evaluate(cdp, `({
      metrics: window.__anotherBrainBootMetrics || {},
      selfCheckQ4: document.querySelector("#self-check-q4")?.textContent || "",
      tokens: document.querySelector("#self-check-tokens")?.textContent || "",
      blocker: document.querySelector("#self-check-blockers")?.textContent || ""
    })`);
    const assistantCountBefore = await evaluate(cdp, `document.querySelectorAll(".message-assistant").length`);
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector("#chat-input");
        input.value = ${JSON.stringify(OPEN_Q4_PROMPT)};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("#chat-form").requestSubmit();
        return true;
      })();`,
      awaitPromise: true,
      returnByValue: true
    });
    await waitForValue(cdp, `document.querySelectorAll(".message-assistant").length > ${Number(assistantCountBefore || 0)}`, 90_000);
    const after = await evaluate(cdp, `(() => {
      const tokenText = document.querySelector("#token-count-status")?.textContent || "0";
      const tokens = Number((tokenText.match(/\\d+/) || ["0"])[0]);
      const source = document.querySelector("#answer-source-status")?.textContent || "";
      const q4Badge = document.querySelector("#q4-status-badge")?.textContent || "";
      const finalTrace = document.querySelector("#trace-final-summary")?.textContent || "";
      const draftTrace = document.querySelector("#trace-draft-summary")?.textContent || "";
      const lastAssistant = Array.from(document.querySelectorAll(".message-assistant p")).at(-1)?.textContent || "";
      const lastUser = Array.from(document.querySelectorAll(".message-user p")).at(-1)?.textContent || "";
      return { tokens, source, q4Badge, finalTrace, draftTrace, lastAssistant, lastUser };
    })();`);
    const failures = [];
    if (!ready) failures.push(`q4_not_ready:${before?.metrics?.q4_status || "missing"}`);
    if (Number(before?.metrics?.q4_ready_ms || 0) <= 0) failures.push("q4_ready_ms_missing");
    if (!String(before?.selfCheckQ4 || "").includes("q4_forward_ran=true")) failures.push(`self_check_forward_not_true:${before?.selfCheckQ4 || ""}`);
    if (Number(before?.tokens || 0) <= 0) failures.push(`self_check_tokens_missing:${before?.tokens || ""}`);
    if (Number(after?.tokens || 0) <= 0) failures.push("answer_tokens_missing");
    if (after?.lastUser !== OPEN_Q4_PROMPT) failures.push(`prompt_not_submitted:${after?.lastUser || ""}`);
    if (after?.source === "no_model_fallback" || after?.source === "fallback") failures.push(`answer_source_fallback:${after?.source}`);
    if (!String(after?.draftTrace || "").includes("q4_forward_ran=true")) failures.push(`draft_trace_no_q4:${after?.draftTrace || ""}`);
    if (!String(after?.finalTrace || "").includes("truth=pass")) failures.push(`truth_table_not_pass:${after?.finalTrace || ""}`);
    return {
      id: scenario.id,
      ok: failures.length === 0,
      failures,
      elapsed_ms: Date.now() - started,
      before,
      after,
      browser_events: events.slice(-12).map((event) => ({
        method: event.method,
        text: event.params?.entry?.text || event.params?.exceptionDetails?.text || event.params?.errorText || "",
        url: event.params?.entry?.url || event.params?.requestId || ""
      }))
    };
  } catch (error) {
    return { id: scenario.id, ok: false, failures: [error.message || "scenario_failed"], elapsed_ms: Date.now() - started };
  } finally {
    if (cdp) cdp.close();
    proc.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 1500);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }).catch(() => {});
  }
}

async function main() {
  const chrome = chromePath();
  const { server, baseUrl } = await startServer();
  let scenarios = [];
  let unavailable = "";
  try {
    if (!chrome) unavailable = "chrome_or_edge_not_found";
    else {
      for (const scenario of SCENARIOS) scenarios.push(await runScenario(baseUrl, chrome, scenario));
    }
  } finally {
    server.close();
  }
  const failures = scenarios.flatMap((row) => (row.failures || []).map((failure) => ({ scenario: row.id, failure })));
  const report = {
    generated_at: new Date().toISOString(),
    ok: !unavailable && failures.length === 0,
    unavailable,
    local_static_url: baseUrl,
    scenarios,
    failures,
    non_claims: {
      browser_admission: false,
      product_admission: false,
      no_training: true,
      no_new_model_assets: true,
      no_backend_inference: true,
      no_external_llm_api: true
    }
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, unavailable, scenario_count: scenarios.length, failures: failures.length, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
