#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/production_smoke_canary_report.json");
const URL = "https://efishother.com/?anti_lobotomy_smoke=1";
const PROMPTS = ["罗大佑是谁？", "罗大佑你知道吗？", "你读过日本文学吗？", "我需要怎么提问？", "你知道我要干什么吗？"];
const BAD_GENERIC_FALLBACK_RE = /(你需要提问。?|你要问哪一边？?|也许发生过，不在我眼前。?)/;

function validateLocalOutput(row) {
  const answer = String(row.answer || "");
  const failures = [];
  if (BAD_GENERIC_FALLBACK_RE.test(answer)) failures.push("generic_fallback_leaked");
  if (row.prompt === "你知道我要干什么吗？") {
    if (!/(不知道|从这几轮看|测试|目标)/.test(answer)) failures.push("user_intent_boundary_not_answered");
    if (/(华语流行|音乐对象|里的入口|先看声音)/.test(answer)) failures.push("user_intent_routed_to_culture");
  }
  return failures;
}

async function localOutputs() {
  const runtime = createDialogRuntime();
  const rows = [];
  for (const prompt of PROMPTS) rows.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false }));
  return rows.map((row) => ({ prompt: row.prompt, answer: row.answer, route: row.route, fallback_firewall: row.trace?.fallback_firewall || null }));
}

async function deployedProbe() {
  try {
    const response = await fetch(URL, { cache: "no-store" });
    const text = await response.text();
    return {
      attempted: true,
      available: response.ok,
      status: response.status,
      url: URL,
      asset_refs: [...text.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((match) => match[1]).slice(0, 20),
      body_sample: text.slice(0, 500)
    };
  } catch (error) {
    return { attempted: true, available: false, status: 0, url: URL, reason: `network_unavailable: ${error.message}` };
  }
}

async function main() {
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    deployed: await deployedProbe(),
    local_outputs: await localOutputs(),
    notes: "Network unavailability does not fail local release; run this after production deployment."
  };
  report.local_failures = report.local_outputs
    .map((row) => ({ prompt: row.prompt, answer: row.answer, failures: validateLocalOutput(row) }))
    .filter((row) => row.failures.length > 0);
  report.ok = report.local_failures.length === 0;
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, deployed_available: report.deployed.available, local_failures: report.local_failures.length, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
