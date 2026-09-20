// efish other — engine tests. No network, no key.
import assert from "node:assert/strict";
import test from "node:test";

const E = (n) => import(new URL(`../src/engine/${n}`, import.meta.url).href);
const { limitSentences, sentenceEnds } = await E("sentence_limit.js");
const { findEgg, EGGS } = await E("easter_eggs.js");
const { pruneExpired, RETENTION_DAYS } = await E("memory_store.js");
const { candidatesFor, createComposer, prepareDict } = await E("pinyin_ime.js");
import fs from "node:fs";
const REAL = prepareDict(JSON.parse(fs.readFileSync(new URL("../public/ime/pinyin_dict.json", import.meta.url), "utf8")));
const { PERSONA_PROMPT } = await E("persona_prompt.js");
const { createAnswerPath, systemNote, MAX_TOKENS } = await E("answer_path.js");

// assembled at runtime so no key-shaped literal ever sits in the repository
const KEY = ["sk", "testtesttesttesttest1234"].join("-");
const enc = new TextEncoder();
const sse = (parts) => new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } });
const delta = (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t }, index: 0 }] })}\n\n`;
const DONE = "data: [DONE]\n\n";

test("never more than two sentences", () => {
  assert.equal(limitSentences("一。二。三。四。").text, "一。二。");
  assert.equal(limitSentences("只有一句。").complete, false);
  assert.equal(limitSentences("Version 2.5 is fine. How absurd. Third.").text, "Version 2.5 is fine. How absurd.");
  assert.equal(limitSentences("真的吗？！那好吧。多余。").text, "真的吗？！那好吧。");
  assert.equal(sentenceEnds("没有句号的半句").length, 0);
});

test("a closing quote stays with its sentence", () => {
  assert.equal(limitSentences("他说“不。”然后走了。再也没回来。").text, "他说“不。”然后走了。");
});

test("every easter egg replies within two sentences, in his own words", () => {
  for (const egg of EGGS) assert.ok(sentenceEnds(egg.reply).length <= 2, egg.id);
  assert.equal(findEgg("？").reply, "问题不需要有答案。");
  assert.equal(findEgg("   ").id, "silence");
  assert.equal(findEgg("鳄").id, "crocodile");
  assert.equal(findEgg("你肯定错了。你肯定错了。").id, "you_are_wrong");
  assert.equal(findEgg("今天吃什么"), null);
  assert.equal(findEgg(""), null);
});

test("memory older than thirty days is dropped", () => {
  const now = Date.UTC(2026, 8, 20); const day = 86_400_000;
  const kept = pruneExpired([{ at: now - 29 * day, text: "a" }, { at: now - 31 * day, text: "b" }, { at: now, text: "c" }, { text: "no timestamp" }], now);
  assert.deepEqual(kept.map((t) => t.text), ["a", "c"]);
  assert.equal(RETENTION_DAYS, 30);
});

test("pinyin: a whole sentence is composed, not just its first syllable", () => {
  const r = candidatesFor("nishishei", REAL);
  assert.equal(r.list[0].text, "你是谁");
  assert.equal(r.list[0].consumed, 9);
  assert.deepEqual(r.segments, ["ni", "shi", "shei"]);
  assert.equal(candidatesFor("jintianchishenme", REAL).list[0].text, "今天吃什么");
  assert.equal(candidatesFor("eyu", REAL).list[0].text, "鳄鱼");
});

test("pinyin: a slip onto a neighbouring key is repaired", () => {
  const r = candidatesFor("nisgishei", REAL);           // g sits next to h
  assert.equal(r.corrected, true);
  assert.equal(r.effective, "nishishei");
  assert.equal(r.list[0].text, "你是谁");
  assert.equal(candidatesFor("nkhao", REAL).list[0].text, "你好", "k sits next to i");
  // a trailing letter is left alone: it may be the start of the next syllable
  assert.equal(candidatesFor("nihap", REAL).corrected, false);
});

test("pinyin: someone still typing is not treated as mistaken", () => {
  const r = candidatesFor("nishish", REAL);             // "sh" can still become shei
  assert.equal(r.corrected, false);
  assert.equal(r.list[0].text, "你是");
});

test("pinyin: after a pick, what remains is the rest of the repaired buffer", () => {
  const c = createComposer(); for (const l of "nisgishei") c.type(l);
  const r = candidatesFor(c.buffer, REAL);
  const word = r.list.find((x) => x.text === "你");
  assert.equal(c.pick(word, r.effective), "你");
  assert.equal(c.buffer, "shishei");
  assert.deepEqual(candidatesFor("", REAL).list, []);
});

test("pinyin: composition stays fast enough to run on every keystroke", () => {
  const t0 = performance.now();
  for (let i = 0; i < 50; i += 1) candidatesFor("womenjintianwanshangquchifanba", REAL);
  assert.ok((performance.now() - t0) / 50 < 12, "must stay well under a frame");
});

test("the persona carries the four identities, leads with short / plain / never invented, and holds no imagery to lift", () => {
  for (const must of ["是人，是记忆，是鳄鱼，是对话框", "不超过两句", "能简单就简单", "不造比喻", "不编造任何经历", "不替他发明新的信条", "神是人造的，信仰是神造的"]) assert.ok(PERSONA_PROMPT.includes(must), must);
  // The first live answers lifted images straight out of the prompt. Vivid material stays out of it.
  for (const never of ["沪", "三个世界", "暗处", "底片", "三明治", "保温杯", "贝壳", "镜面", "甜筒", "拿铁"]) assert.ok(!PERSONA_PROMPT.includes(never), `imagery in the prompt: ${never}`);
  assert.ok(PERSONA_PROMPT.indexOf("最重要的四条") < 80, "the rules come first");
  // Checked by shape, not by value: naming the owner's private details here would publish them.
  const shapes = { street_address: /\b\d{1,4}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road)\b/, unit_number: /\b\d{1,3}[A-Z]\b/, coordinates: /\b\d{2,3}\.\d{2,}\b/, email: /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\./, phone: /\b\d{7,}\b/ };
  for (const [kind, re] of Object.entries(shapes)) assert.ok(!re.test(PERSONA_PROMPT), `private detail leaked: ${kind}`);
});

test("a model answer is cut at the second sentence and the stream is dropped", async () => {
  let cancelled = false; const seen = {};
  const fetchImpl = async (url, init) => {
    seen.url = url; seen.body = JSON.parse(init.body); seen.auth = init.headers.Authorization;
    init.signal.addEventListener("abort", () => { cancelled = true; });
    return { ok: true, status: 200, body: sse([delta("影子不是身体。"), delta("所以谈不上失败。"), delta("这是不该出现的第三句。"), DONE]) };
  };
  const path = createAnswerPath({ getKey: () => KEY, keyPresent: () => true, fetchImpl });
  const shown = [];
  const r = await path.answer({ userText: "影子是失败的身体吗", onText: (t) => shown.push(t) });
  assert.equal(r.ok, true); assert.equal(r.source, "model");
  assert.equal(r.text, "影子不是身体。所以谈不上失败。");
  assert.ok(shown.every((t) => !t.includes("第三句")), "a third sentence must never reach the screen");
  assert.equal(cancelled, true);
  assert.equal(seen.url, "https://api.deepseek.com/chat/completions");
  assert.equal(seen.auth, `Bearer ${KEY}`);
  assert.equal(seen.body.max_tokens, MAX_TOKENS);
  assert.equal(seen.body.messages[0].role, "system");
  assert.ok(!JSON.stringify(seen.body).includes(KEY));
});

test("eggs answer locally without any request", async () => {
  let called = false;
  const path = createAnswerPath({ getKey: () => KEY, keyPresent: () => true, fetchImpl: async () => { called = true; } });
  const r = await path.answer({ userText: "？" });
  assert.equal(r.source, "egg"); assert.equal(called, false);
});

test("through the proxy only the conversation travels: no key, no persona, no model", async () => {
  const seen = {};
  const fetchImpl = async (url, init) => { seen.url = url; seen.headers = init.headers; seen.body = JSON.parse(init.body); return { ok: true, status: 200, body: sse([delta("在。"), DONE]) }; };
  const path = createAnswerPath({ getKey: () => "", keyPresent: () => false, proxyUrl: "/api/chat", fetchImpl });
  assert.equal(path.available(), true);
  const r = await path.answer({ userText: "在吗", conversation: [{ role: "user", content: "之前" }, { role: "assistant", content: "嗯。" }] });
  assert.equal(r.text, "在。"); assert.equal(seen.url, "/api/chat"); assert.equal(seen.headers.Authorization, undefined);
  assert.deepEqual(Object.keys(seen.body), ["messages"]);
  assert.deepEqual(seen.body.messages.map((m) => m.role), ["user", "assistant", "user"]);
});

test("an endpoint with no key yet falls back to a key stored on the device", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return url === "/api/chat" ? { ok: false, status: 503, body: null } : { ok: true, status: 200, body: sse([delta("在。"), DONE]) }; };
  const path = createAnswerPath({ getKey: () => KEY, keyPresent: () => true, proxyUrl: "/api/chat", fetchImpl });
  const r = await path.answer({ userText: "在吗" });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ["/api/chat", "https://api.deepseek.com/chat/completions"]);
  await path.answer({ userText: "还在吗" });
  assert.equal(calls[2], "https://api.deepseek.com/chat/completions", "it does not keep asking a dead endpoint");
});

test("without a key or a proxy the app says so, as the app", async () => {
  const path = createAnswerPath({ getKey: () => "", keyPresent: () => false });
  const r = await path.answer({ userText: "你好" });
  assert.equal(r.ok, false); assert.equal(r.category, "no_language_layer");
  assert.match(systemNote(r.category), /not connected/);
  assert.ok(!systemNote(r.category).includes("/key"), "visitors are never pointed at the owner command");
});

test("failures never leak the key", async () => {
  const path = createAnswerPath({ getKey: () => KEY, keyPresent: () => true, fetchImpl: async () => { throw new Error(`boom ${KEY}`); } });
  const r = await path.answer({ userText: "你好" });
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify({ r, t: path.telemetry }).includes(KEY));
});
