#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const WEB_ROOT = resolve(ROOT, "web");
const OUT = resolve(ROOT, "artifacts/r28p0c/reports/coldstart_matrix.json");
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
];

const SCENARIOS = [
  {
    id: "desktop_fast_cold",
    label: "Desktop / fast network",
    viewport: { width: 1365, height: 900, mobile: false, deviceScaleFactor: 1 },
    network: { latency: 20, downloadThroughput: 5_000_000, uploadThroughput: 1_000_000 },
    cpuRate: 1,
    q4CapMs: 120_000,
    maxInteractiveMs: 1800,
    expectQ4Ready: true
  },
  {
    id: "desktop_3g_cold",
    label: "Desktop / 3G throttle",
    viewport: { width: 1365, height: 900, mobile: false, deviceScaleFactor: 1 },
    network: { latency: 300, downloadThroughput: 96_000, uploadThroughput: 48_000 },
    cpuRate: 2,
    q4CapMs: 45_000,
    maxInteractiveMs: 3500,
    expectQ4Ready: false
  },
  {
    id: "mobile_fast_cold",
    label: "Mobile / fast network",
    viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 },
    network: { latency: 40, downloadThroughput: 1_600_000, uploadThroughput: 750_000 },
    cpuRate: 4,
    q4CapMs: 20_000,
    maxInteractiveMs: 2200,
    expectQ4Deferred: true
  },
  {
    id: "mobile_3g_cold",
    label: "Mobile / 3G throttle",
    viewport: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 },
    network: { latency: 300, downloadThroughput: 96_000, uploadThroughput: 48_000 },
    cpuRate: 4,
    q4CapMs: 20_000,
    maxInteractiveMs: 4200,
    expectQ4Deferred: true
  }
];

function mime(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".bin")) return "application/octet-stream";
  if (path.endsWith(".svg")) return "image/svg+xml";
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
      const headers = {
        "content-type": mime(path),
        "cache-control": "no-store",
        "content-length": String(info.size)
      };
      const range = req.headers.range;
      if (range && /^bytes=\d+-\d*$/.test(range)) {
        const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
        const start = Number(startRaw);
        const end = endRaw ? Number(endRaw) : start;
        const data = await readFile(path);
        res.writeHead(206, {
          ...headers,
          "content-range": `bytes ${start}-${end}/${info.size}`,
          "content-length": String(end - start + 1)
        });
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

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", () => reject(new Error("cdp_websocket_failed")), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
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
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.result?.value) return result.result.value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  return null;
}

async function readSnapshot(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const metrics = window.__anotherBrainBootMetrics || {};
      const shell = document.querySelector("#app-shell");
      const buttons = Array.from(document.querySelectorAll(".composer-actions button"))
        .filter((button) => getComputedStyle(button).display !== "none")
        .map((button) => button.id || button.textContent.trim());
      const text = document.body.innerText || "";
      return {
        metrics,
        uiMode: shell?.dataset?.uiMode || "",
        loading: shell?.dataset?.loading || "",
        chatInputVisible: Boolean(document.querySelector("#chat-input")),
        sendVisible: getComputedStyle(document.querySelector("#send-button")).display !== "none",
        visibleComposerButtons: buttons,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        visibleText: text.slice(0, 1200),
        hasEngineeringBrand: /another_brain/.test(text),
        hasChatModelParams: /q4 forward|static_q4_experimental|exact_runtime_tokenizer|local\\/static/.test(text)
      };
    })();`,
    awaitPromise: true,
    returnByValue: true
  });
  return result.result?.value || {};
}

async function runScenario(serverUrl, chrome, scenario) {
  const userDataDir = resolve(tmpdir(), `another-brain-r28p0c-${scenario.id}-${Date.now()}`);
  const url = `${serverUrl}/another_brain_chat/?coldstart_matrix=${encodeURIComponent(scenario.id)}`;
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
    cdp = await connectCdp(await pageEndpoint(browserWs));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: scenario.network.latency,
      downloadThroughput: scenario.network.downloadThroughput,
      uploadThroughput: scenario.network.uploadThroughput
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpuRate });
    await cdp.send("Emulation.setDeviceMetricsOverride", scenario.viewport);
    await cdp.send("Page.navigate", { url });
    const interactive = await waitForValue(
      cdp,
      `Boolean(window.__anotherBrainBootMetrics?.chat_interactive_ms !== null && document.querySelector("#chat-input") && document.querySelector("#send-button"))`,
      scenario.maxInteractiveMs + 5_000
    );
    await waitForValue(
      cdp,
      `["ready","deferred","fallback"].includes(window.__anotherBrainBootMetrics?.q4_status)`,
      scenario.q4CapMs
    );
    const snapshot = await readSnapshot(cdp);
    const elapsedMs = Date.now() - started;
    const metrics = snapshot.metrics || {};
    const failures = [];
    if (!interactive || !snapshot.chatInputVisible || !snapshot.sendVisible) failures.push("chat_not_interactive");
    if (Number(metrics.chat_interactive_ms || elapsedMs) > scenario.maxInteractiveMs) failures.push("chat_interactive_too_slow");
    if (Number(snapshot.overflowX || 0) > 1) failures.push(`horizontal_overflow:${snapshot.overflowX}`);
    if (scenario.viewport.mobile && snapshot.visibleComposerButtons.length !== 1) failures.push(`mobile_expected_send_only:${snapshot.visibleComposerButtons.join(",")}`);
    if (scenario.viewport.mobile && metrics.q4_status !== "deferred") failures.push(`mobile_expected_q4_deferred:${metrics.q4_status || "missing"}`);
    if (scenario.expectQ4Ready && metrics.q4_status !== "ready") failures.push(`q4_not_ready:${metrics.q4_status || "missing"}`);
    if (!scenario.viewport.mobile && snapshot.hasEngineeringBrand) failures.push("chat_visible_engineering_brand");
    if (snapshot.hasChatModelParams && snapshot.uiMode === "chat") failures.push("chat_visible_model_parameters");
    return {
      id: scenario.id,
      label: scenario.label,
      ok: failures.length === 0,
      failures,
      elapsed_ms: elapsedMs,
      chat_interactive_ms: metrics.chat_interactive_ms,
      quick_check_ms: metrics.quick_check_ms,
      q4_ready_ms: metrics.q4_ready_ms,
      fallback_ready_ms: metrics.fallback_ready_ms,
      q4_status: metrics.q4_status || "missing",
      q4_deferred: metrics.q4_deferred === true,
      overflow_x: snapshot.overflowX,
      visible_composer_buttons: snapshot.visibleComposerButtons,
      network: scenario.network,
      viewport: scenario.viewport
    };
  } catch (error) {
    return { id: scenario.id, label: scenario.label, ok: false, failures: [error.message || "scenario_failed"] };
  } finally {
    if (cdp) cdp.close();
    proc.kill("SIGTERM");
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const chrome = chromePath();
  const { server, baseUrl } = await startServer();
  let results = [];
  let unavailable = "";
  try {
    if (!chrome) {
      unavailable = "chrome_not_found";
    } else {
      for (const scenario of SCENARIOS) {
        results.push(await runScenario(baseUrl, chrome, scenario));
      }
    }
  } finally {
    server.close();
  }
  const failures = results.flatMap((result) => (result.failures || []).map((failure) => ({ scenario: result.id, failure })));
  const report = {
    generated_at: new Date().toISOString(),
    ok: !unavailable && failures.length === 0,
    unavailable,
    chrome_path: chrome || null,
    local_static_url: baseUrl,
    scenarios: results,
    failures,
    non_claims: {
      no_training: true,
      no_new_model_assets: true,
      no_backend_inference: true,
      no_external_llm_api: true,
      no_product_admission: true
    }
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: report.ok,
    unavailable,
    scenario_count: results.length,
    failures: failures.length,
    out: OUT,
    summary: results.map((row) => ({
      id: row.id,
      ok: row.ok,
      chat_interactive_ms: row.chat_interactive_ms,
      q4_status: row.q4_status,
      q4_ready_ms: row.q4_ready_ms,
      overflow_x: row.overflow_x
    }))
  }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
