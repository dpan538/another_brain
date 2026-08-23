#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).flatMap((value, index, all) =>
  value.startsWith("--") ? [[value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true]] : []));
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29p0_pairwise_oracle"));
const OWNER_ROOT = join(ARTIFACT_ROOT, "owner_review");
const REVIEWS_ROOT = join(ARTIFACT_ROOT, "reviews");
const PANEL_A_PATH = join(REVIEWS_ROOT, "panel_a_human_full_blind_packet.jsonl");
const PANEL_B_PATH = join(REVIEWS_ROOT, "panel_b_human_blind_packet.jsonl");

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}
async function optionalRead(path) { try { return await readFile(path, "utf8"); } catch { return null; } }
function parseJsonl(value) { return value.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line)); }
function safeScriptJson(value) { return JSON.stringify(value).replace(/<\//gu, "<\\/"); }

const panelAText = await readFile(PANEL_A_PATH, "utf8");
const panelA = parseJsonl(panelAText);
if (panelA.length !== 60 || panelA.some((row) => row.reviewer_class !== "human_owner_panel_a")) {
  throw new Error("r29p0_owner_panel_a_packet_invalid");
}
const panelBText = await optionalRead(PANEL_B_PATH);
const panelB = panelBText ? parseJsonl(panelBText) : null;
if (panelB && panelB.length !== 120) throw new Error("r29p0_owner_panel_b_packet_invalid");
await mkdir(OWNER_ROOT, { recursive: true, mode: 0o700 });

const exporter = `"use strict";
async function r29p0Sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}
async function r29p0Export(panel, packetSha, responses) {
  const payload = {
    schema_version: "r29p0.human_review_export.v1",
    campaign_id: "r29p0_equivalence_pairwise_oracle_v1",
    reviewer_class: panel === "A" ? "human_owner_panel_a" : "human_owner_panel_b",
    panel,
    packet_sha256: packetSha,
    response_count: responses.length,
    responses,
    exported_at: new Date().toISOString(),
    independent_human_panels: null
  };
  const canonical = JSON.stringify(payload);
  payload.review_sha256 = await r29p0Sha256(canonical);
  const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "r29p0_human_panel_" + panel.toLowerCase() + "_review_" + Date.now() + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
`;

function panelHtml(panel, packet, packetSha) {
  if (!packet) return `<!doctype html><meta charset="utf-8"><title>R29P0 Panel B locked</title><style>body{font:16px system-ui;max-width:760px;margin:4rem auto;line-height:1.6}</style><h1>Panel B 尚未开放</h1><p>先完成并导出 60/60 Human Panel A。验证 Panel A 后，用同一 campaign resume 命令生成 TRUE oracle 与新的 Panel B blind packet。不得用 provisional oracle 开始人工 Panel B。</p>`;
  const isA = panel === "A";
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>R29P0 Human Panel ${panel}</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:1040px;margin:24px auto;padding:0 20px;color:#202124}button,select,textarea{font:inherit}.card{border:1px solid #bbb;border-radius:10px;padding:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.answer{white-space:pre-wrap;background:#f6f7f8;padding:14px;border-radius:8px}.controls{display:grid;gap:10px;margin-top:16px}.progress{position:sticky;top:0;background:white;padding:8px 0}.tags{display:flex;flex-wrap:wrap;gap:8px}textarea{width:100%;min-height:70px}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style></head>
<body><div class="progress"><strong id="progress"></strong></div><div id="root"></div><script src="export_review_results.js"></script>
<script type="application/json" id="packet">${safeScriptJson(packet)}</script><script>
"use strict";
const PANEL=${JSON.stringify(panel)}, PACKET_SHA=${JSON.stringify(packetSha)};
const rows=JSON.parse(document.getElementById("packet").textContent);
const key="r29p0:"+PANEL+":"+PACKET_SHA;
let state=JSON.parse(localStorage.getItem(key)||"{}"); let index=0;
function save(){localStorage.setItem(key,JSON.stringify(state));renderProgress()}
function renderProgress(){document.getElementById("progress").textContent="Panel "+PANEL+" · "+Object.keys(state).length+" / "+rows.length}
function render(){const row=rows[index], root=document.getElementById("root"), prior=state[row.blind_id||row.comparison_id]||{};
const messages=(row.messages||[]).map(m=>"<p><b>"+(m.role==="user"?"用户":"回答")+"：</b>"+escapeHtml(m.content)+"</p>").join("");
const left=${isA ? "row.candidate_x" : "row.response_left"}, right=${isA ? "row.candidate_y" : "row.response_right"};
root.innerHTML='<div class="card"><p>案例 '+(index+1)+' / '+rows.length+'</p>'+messages+'<div class="pair"><section><h2>${isA ? "X" : "LEFT"}</h2><div class="answer">'+escapeHtml(left)+'</div></section><section><h2>${isA ? "Y" : "RIGHT"}</h2><div class="answer">'+escapeHtml(right)+'</div></section></div><div class="controls">'+
${isA ? "'<label>语义等价 <select id=equiv><option></option><option>EQUIVALENT</option><option>INEQUIVALENT</option><option>UNCERTAIN</option></select></label><label>仅等价时偏好 <select id=pref><option></option><option>X</option><option>Y</option><option>TIE</option></select></label><div class=tags>'+row.semantic_difference_tags.map(tag=>'<label><input type=checkbox name=tag value=\"'+tag+'\">'+tag+'</label>').join('')+'</div>'" : "'<label>偏好 <select id=pref><option></option><option>LEFT</option><option>RIGHT</option><option>TIE</option></select></label><p>按 relevance/factual restraint/natural voice/brand fit/brevity/logic clarity/non-customer-service 评分，并标记任何 factual/condition/conclusion regression。</p><label>总分 LEFT 0–16 <input id=leftscore type=number min=0 max=16></label><label>总分 RIGHT 0–16 <input id=rightscore type=number min=0 max=16></label>'"}+
'<label>可选短注释<textarea id=note></textarea></label><p><button id=prev>上一例</button> <button id=save>保存本例</button> <button id=next>下一例</button> <button id=export>导出全部</button></p></div></div>';
${isA ? "document.getElementById('equiv').value=prior.equivalence||''; document.getElementById('pref').value=prior.preference||''; document.querySelectorAll('[name=tag]').forEach(el=>el.checked=(prior.difference_tags||[]).includes(el.value));" : "document.getElementById('pref').value=prior.preference||''; document.getElementById('leftscore').value=prior.left_total??''; document.getElementById('rightscore').value=prior.right_total??'';"}
document.getElementById('note').value=prior.note||'';
document.getElementById('save').onclick=()=>{const response=${isA ? "{blind_id:row.blind_id,case_id:row.case_id,equivalence:document.getElementById('equiv').value,preference:document.getElementById('pref').value||null,difference_tags:Array.from(document.querySelectorAll('[name=tag]:checked')).map(el=>el.value),note:document.getElementById('note').value}" : "{comparison_id:row.comparison_id,case_id:row.case_id,preference:document.getElementById('pref').value,left_total:Number(document.getElementById('leftscore').value),right_total:Number(document.getElementById('rightscore').value),note:document.getElementById('note').value}"};
if(${isA ? "!response.equivalence || (response.equivalence==='EQUIVALENT' && !response.preference) || (response.equivalence!=='EQUIVALENT' && response.preference)" : "!response.preference || !Number.isFinite(response.left_total) || !Number.isFinite(response.right_total)"}){alert('请完成必填项，且只在 EQUIVALENT 时填写偏好。');return} state[row.blind_id||row.comparison_id]=response;save()};
document.getElementById('prev').onclick=()=>{index=Math.max(0,index-1);render()};document.getElementById('next').onclick=()=>{index=Math.min(rows.length-1,index+1);render()};
document.getElementById('export').onclick=()=>{if(Object.keys(state).length!==rows.length){alert('必须完成 '+rows.length+' / '+rows.length+' 才能导出。');return}r29p0Export(PANEL,PACKET_SHA,rows.map(r=>state[r.blind_id||r.comparison_id]))};renderProgress()}
function escapeHtml(value){return String(value).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}render();
</script></body></html>`;
}

const panelASha = sha256(panelAText);
const panelBSha = panelBText ? sha256(panelBText) : null;
const files = {
  "export_review_results.js": exporter,
  "panel_a_review.html": panelHtml("A", panelA, panelASha),
  "panel_b_review.html": panelHtml("B", panelB, panelBSha),
};
for (const [name, value] of Object.entries(files)) await atomicWrite(join(OWNER_ROOT, name), value);
const instructions = `# R29P0 owner review\n\n1. Open \`panel_a_review.html\` directly in a local browser. No server or network is required.\n2. Review all 60 blinded pairs. Decide semantic equivalence first; record preference only for equivalent pairs. Save progress locally and export the completed JSON.\n3. Validate the exported file with the campaign resume command. Do not rename it over any raw response or packet.\n4. Resume Panel A validation: \`node --experimental-strip-types scripts/r29p0_resume_human_review.mjs --panel-a <exported-json>\`.\n5. The resume step builds the TRUE oracle and a fresh Panel B packet, then regenerates this pack. Open \`panel_b_review.html\` in a separate session.\n6. Review all 120 blinded comparisons (oracle vs canonical and oracle vs deterministic), export, then resume with \`--panel-b <exported-json>\`.\n\nIf one person performs both panels, separate the sessions and report \`independent_human_panels=false\`. Codex provisional review never counts as human review.\n`;
await atomicWrite(join(OWNER_ROOT, "review_instructions.md"), instructions);
await atomicWrite(join(OWNER_ROOT, "review_state.json"), `${JSON.stringify({
  schema_version: "r29p0.owner_review_state.v1",
  campaign_id: "r29p0_equivalence_pairwise_oracle_v1",
  human_panel_a_completed: false,
  human_panel_b_completed: false,
  panel_a_case_count: panelA.length,
  panel_b_locked: !panelB,
  independent_human_panels: null,
  ranker_training_authorized: false,
}, null, 2)}\n`);
const manifestFiles = {};
for (const name of [...Object.keys(files), "review_instructions.md", "review_state.json"]) {
  const content = await readFile(join(OWNER_ROOT, name));
  manifestFiles[name] = { bytes: content.length, sha256: sha256(content) };
}
await atomicWrite(join(OWNER_ROOT, "manifest.json"), `${JSON.stringify({
  schema_version: "r29p0.owner_review_manifest.v1",
  campaign_id: "r29p0_equivalence_pairwise_oracle_v1",
  local_only: true,
  public_safe: true,
  raw_api_metadata_included: false,
  secret_included: false,
  original_outputs_mutable_from_ui: false,
  panel_a_packet_sha256: panelASha,
  panel_b_packet_sha256: panelBSha,
  files: manifestFiles,
}, null, 2)}\n`);
console.log(JSON.stringify({ owner_review_root: OWNER_ROOT, panel_a_cases: panelA.length, panel_b_locked: !panelB }));
