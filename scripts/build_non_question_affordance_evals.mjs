#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const OUT_DIR = resolve(ROOT, "evals/p0_lobotomy");

function row(data) {
  return `${JSON.stringify(data)}\n`;
}

async function writeJsonl(name, rows) {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, name), rows.map(row).join(""), "utf8");
}

function forbidden() {
  return {
    forbidden_final_answers: ["你需要提问。", "你要问哪一边？", "也许发生过，不在我眼前。"],
    forbidden_bare_fallback_ids: ["ask_required", "which_side", "external_event_unknown"],
    must_not_include: ["你需要提问。", "你要问哪一边？", "也许发生过，不在我眼前。"]
  };
}

function repeatTo(rows, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const base = rows[i % rows.length];
    out.push({ ...base, id: `${base.id}_${String(i + 1).padStart(3, "0")}` });
  }
  return out;
}

const quietSeeds = [
  "嗯。",
  "这样啊。",
  "可能吧。",
  "有点怪。",
  "……",
  "算了。",
  "这很难说。",
  "我再想想。",
  "不知道。",
  "好像不是这样。"
].map((prompt, index) => ({
  id: `quiet_affordance_${index + 1}`,
  turns: [],
  prompt,
  expected_response_type: "ui_affordance",
  expected_user_turn_kind: "quiet_declaration",
  must_include_any: [],
  notes: "Pure vague declaration should hold space without a textual assistant answer.",
  ...forbidden()
}));

const declarationSeeds = [
  "这个更严重了。",
  "这不是我要的。",
  "你又绕回 fallback 了。",
  "不是罗大佑，是日本文学。",
  "我在测试你是不是又机械反问。",
  "这个回答太像模板了。",
  "别再问哪一边。",
  "别说你需要提问。",
  "我其实已经问了。",
  "这不是外部事件。"
].map((prompt, index) => ({
  id: `declaration_signal_${index + 1}`,
  turns: [{ user: "罗大佑你知道吗？", assistant: "也许发生过，不在我眼前。" }],
  prompt,
  expected_response_type: "answer",
  expected_user_turn_kind: "",
  must_include_any: ["我明白", "刚才", "不该", "已经", "日本文学"],
  notes: "Signal-bearing declarations with active context should be answered or repaired, not turned into affordance.",
  ...forbidden()
}));

const uiSeeds = [
  "嗯。",
  "这样啊。",
  "可能吧。",
  "算了。",
  "……"
].map((prompt, index) => ({
  id: `affordance_ui_${index + 1}`,
  turns: [{ user: "罗大佑是谁？", assistant: "罗大佑是台湾音乐人。" }],
  prompt,
  expected_response_type: "ui_affordance",
  expected_user_turn_kind: "quiet_declaration",
  must_include_any: [],
  notes: "Affordance should not persist as assistant message or count as exchange turn.",
  ...forbidden()
}));

await writeJsonl("non_question_affordance.jsonl", repeatTo(quietSeeds, 80));
await writeJsonl("declaration_handling.jsonl", repeatTo(declarationSeeds, 80));
await writeJsonl("affordance_ui.jsonl", repeatTo(uiSeeds, 40));
console.log(JSON.stringify({ ok: true, files: 3, rows: 200 }, null, 2));
