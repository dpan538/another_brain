#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREVIOUS_HEAD = "0691d284f64770f7f35baeac1e7110eda9dfa05c";
const OUT = join(ROOT, "reports/r3_request_config_audit.json");

function committed(path) {
  return execFileSync("git", ["show", `${PREVIOUS_HEAD}:${path}`], { cwd: ROOT, encoding: "utf8" });
}

const adapter = committed("src/hybrid_runtime/deepseek_adapter.ts");
const r1 = committed("scripts/r29b2m_r4h_r1_live_experiment.mjs");
const r2 = committed("scripts/r29b2m_r4h_r2_live_experiment.mjs");
const r2Terminal = JSON.parse(await readFile(join(ROOT, "artifacts/r29b2m_r4h_r2/reports/final_terminal.json"), "utf8"));

const temperatureExplicit = /\btemperature\s*:/u.test(adapter) || /\btemperature\s*:/u.test(r1) || /\btemperature\s*:/u.test(r2);
const topPExplicit = /\btop_p\s*:/u.test(adapter) || /\btop_p\s*:/u.test(r1) || /\btop_p\s*:/u.test(r2);
const adapterPushesSignalSystem = /if\s*\(compiledLocalSignal\)\s*messages\.push\(\{\s*role:\s*["']system["']/u.test(adapter);
const previousControlUsesNull = /compiledSignal:\s*arm\s*===\s*["']hybrid(?:_v2)?["']\s*\?[^\n]*:\s*null/u.test(r1) ||
  /compiledSignal:\s*arm\s*===\s*["']hybrid(?:_v2)?["']\s*\?[^\n]*:\s*null/u.test(r2);

const report = {
  campaign_id: "r29b2m_r4h_r3_controlled_critic_hybrid_v1",
  audited_commit: PREVIOUS_HEAD,
  source_files: [
    "src/hybrid_runtime/deepseek_adapter.ts",
    "scripts/r29b2m_r4h_r1_live_experiment.mjs",
    "scripts/r29b2m_r4h_r2_live_experiment.mjs",
  ],
  previous_temperature_explicit: temperatureExplicit,
  previous_effective_temperature: temperatureExplicit ? null : 1,
  previous_top_p_explicit: topPExplicit,
  official_api_evidence: {
    source: "https://api-docs.deepseek.com/api/create-chat-completion/",
    checked_at: "2026-08-22",
    documented_temperature_default: 1,
    documented_parameter_guidance: "change temperature or top_p, not both",
  },
  previous_request_structure: {
    base_system_message_count: 1,
    control_additional_local_system_message: false,
    treatment_additional_local_system_message: adapterPushesSignalSystem,
    control_compiled_signal_null_confirmed: previousControlUsesNull,
    message_structure_confounded: adapterPushesSignalSystem && previousControlUsesNull,
  },
  r3_control_contract: {
    temperature: 0,
    top_p_sent: false,
    system_message_count: 1,
    message_role_sequence_equal_between_arms: true,
    local_guidance_slot_present_in_all_arms: true,
    control_slot_value: "NONE",
  },
  previous_r4h_r2_terminal: r2Terminal.terminal,
  previous_r4h_r2_terminal_modified: false,
  pass: !temperatureExplicit && !topPExplicit && adapterPushesSignalSystem && previousControlUsesNull && r2Terminal.terminal === "BLOCKED_HYBRID_V2_FACTUAL",
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ pass: report.pass, previous_temperature_explicit: report.previous_temperature_explicit, previous_effective_temperature: report.previous_effective_temperature, message_structure_confounded: report.previous_request_structure.message_structure_confounded }));
if (!report.pass) process.exit(2);
