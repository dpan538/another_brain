#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const WEB_ROOT = resolve(ROOT, "web");
const OUT = resolve(ROOT, "artifacts/r28p0d/reports/browser_compat_matrix.json");
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

const UAS = {
  chromeDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  edgeDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  safariMobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  bingMobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 BingSapphire/1.0",
  wechatMobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49 NetType/WIFI Language/zh_CN",
  qqMobile: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 MQQBrowser/14.9 Mobile Safari/537.36"
};

const SCENARIOS = [
  { id: "chrome_desktop_fast", family: "chrome", ua: UAS.chromeDesktop, viewport: { width: 1365, height: 900, mobile: false, deviceScaleFactor: 1 }, network: { latency: 20, downloadThroughput: 5_000_000, uploadThroughput: 1_000_000 }, cpuRate: 1, maxInteractiveMs: 1800 },
  { id: "edge_desktop_fast", family: "microsoft_edge", ua: UAS.edgeDesktop, viewport: { width: 1365, height: 900, mobile: false, deviceScaleFactor: 1 }, network: { latency: 25, downloadThroughput: 4_000_000, uploadThroughput: 1_000_000 }, cpuRate: 1, maxInteractiveMs: 1800 },
  { id: "safari_ios_3g", family: "safari", ua: UAS.safariMobile, viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 }, network: { latency: 300, downloadThroughput: 96_000, uploadThroughput: 48_000 }, cpuRate: 4, maxInteractiveMs: 4500 },
  { id: "bing_ios_3g", family: "bing_microsoft", ua: UAS.bingMobile, viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 }, network: { latency: 300, downloadThroughput: 96_000, uploadThroughput: 48_000 }, cpuRate: 4, maxInteractiveMs: 4500 },
  { id: "wechat_ios_worker_blocked", family: "wechat_in_app", ua: UAS.wechatMobile, viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 }, network: { latency: 180, downloadThroughput: 420_000, uploadThroughput: 120_000 }, cpuRate: 4, blockWorkers: true, blockStorage: true, maxInteractiveMs: 4500 },
  { id: "qq_android_cache_blocked", family: "qq_in_app", ua: UAS.qqMobile, viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 }, network: { latency: 180, downloadThroughput: 420_000, uploadThroughput: 120_000 }, cpuRate: 4, blockCaches: true, maxInteractiveMs: 4500 }
];

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
      if (["Runtime.consoleAPICalled", "Runtime.exceptionThrown", "Log.entryAdded", "Network.loadingFailed"].includes(msg.method)) {
        events.push(msg);
      }
      return;
    }
    if (!msg.id || !pending.has(msg.id)) return;
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  return null;
}

function blockedApiScript(scenario) {
  const lines = [];
  if (scenario.blockWorkers) lines.push("Object.defineProperty(window, 'Worker', { configurable: true, value: undefined });");
  if (scenario.blockCaches) lines.push("Object.defineProperty(window, 'caches', { configurable: true, value: undefined });");
  if (scenario.blockStorage) {
    lines.push("Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked_by_in_app_profile'); } });");
  }
  return lines.join("\n");
}

async function readSnapshot(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const metrics = window.__anotherBrainBootMetrics || {};
      const visibleButtons = Array.from(document.querySelectorAll(".composer-actions button"))
        .filter((button) => getComputedStyle(button).display !== "none")
        .map((button) => button.id || button.textContent.trim());
      const text = document.body.innerText || "";
      return {
        metrics,
        chatInputVisible: Boolean(document.querySelector("#chat-input")),
        sendVisible: getComputedStyle(document.querySelector("#send-button")).display !== "none",
        visibleButtons,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        browserCompatStatus: document.querySelector("#browser-compat-status")?.textContent || "",
        browserEmbedStatus: document.querySelector("#browser-embed-status")?.textContent || "",
        visibleText: text.slice(0, 1400),
        hasFallbackChoice: /进入轻量模式|fast chat|lightweight/i.test(text),
        hasEngineeringBrand: /another_brain/.test(text)
      };
    })();`,
    awaitPromise: true,
    returnByValue: true
  });
  return result.result?.value || {};
}

async function runScenario(baseUrl, chrome, scenario) {
  const userDataDir = resolve(tmpdir(), `another-brain-r28p0d-${scenario.id}-${Date.now()}`);
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
  const started = Date.now();
  try {
    const browserWs = await waitForDevTools(proc);
    const events = [];
    cdp = await connectCdp(await pageEndpoint(browserWs), events);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setUserAgentOverride", { userAgent: scenario.ua });
    const blocked = blockedApiScript(scenario);
    if (blocked) await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: blocked });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...scenario.network });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpuRate });
    await cdp.send("Emulation.setDeviceMetricsOverride", scenario.viewport);
    await cdp.send("Page.navigate", { url: `${baseUrl}/another_brain_chat/?compat_matrix=${encodeURIComponent(scenario.id)}` });
    await waitForValue(cdp, `document.readyState === "complete"`, 12_000);
    const interactive = await waitForValue(cdp, `Boolean(window.__anotherBrainBootMetrics?.chat_interactive_ms !== null && document.querySelector("#chat-input") && document.querySelector("#send-button"))`, scenario.maxInteractiveMs + 5000);
    await waitForValue(cdp, `Boolean(document.querySelector("#browser-compat-status")?.textContent)`, 6000);
    const snapshot = await readSnapshot(cdp);
    const failures = [];
    if (!interactive || !snapshot.chatInputVisible || !snapshot.sendVisible) failures.push("chat_not_interactive");
    if (Number(snapshot.metrics?.chat_interactive_ms || Date.now() - started) > scenario.maxInteractiveMs) failures.push("chat_interactive_too_slow");
    if (Number(snapshot.overflowX || 0) > 1) failures.push(`horizontal_overflow:${snapshot.overflowX}`);
    if (scenario.viewport.mobile && snapshot.visibleButtons.length !== 1) failures.push(`mobile_expected_send_only:${snapshot.visibleButtons.join(",")}`);
    if (snapshot.hasFallbackChoice) failures.push("fallback_choice_visible");
    if (!snapshot.browserCompatStatus.includes(scenario.family)) failures.push(`browser_family_mismatch:${snapshot.browserCompatStatus}`);
    if (scenario.blockWorkers && !/worker=false|worker_unavailable/.test(`${snapshot.browserCompatStatus} ${snapshot.browserEmbedStatus}`)) failures.push("worker_blocker_not_visible");
    return {
      id: scenario.id,
      ok: failures.length === 0,
      failures,
      elapsed_ms: Date.now() - started,
      snapshot,
      network: scenario.network,
      viewport: scenario.viewport,
      browser_events: events.slice(-12).map((event) => ({
        method: event.method,
        text: event.params?.entry?.text || event.params?.exceptionDetails?.text || event.params?.errorText || "",
        url: event.params?.entry?.url || event.params?.requestId || ""
      }))
    };
  } catch (error) {
    return { id: scenario.id, ok: false, failures: [error.message || "scenario_failed"] };
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
    chrome_path: chrome || null,
    local_static_url: baseUrl,
    scenarios,
    failures,
    non_claims: {
      browser_admission: false,
      product_admission: false,
      no_training: true,
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
