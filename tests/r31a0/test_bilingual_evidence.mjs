// R31A0 — bilingual retrieval, Chinese output.
// English material must reach the answer as knowledge and never as speech.

import assert from "node:assert/strict";
import test from "node:test";

const CHAT = new URL("../../web/another_brain_chat/", import.meta.url);
const mod = (n) => import(new URL(n, CHAT).href);

const { buildEvidencePacket, detectQuestionLanguage } = await mod("evidence_packet.js");
const { PRODUCT_SYSTEM_PROMPT } = await mod("deepseek_system_prompt.js");
const { createDeepSeekAnswerPath } = await mod("deepseek_answer_path.js");

const CARDS = [
  { card_id: "zh1", kind: "judgment", language: "zh", register: "essay",
    text: "虚化不是必要的，但更像是一种心理需求，我选择性地遗忘。" },
  { card_id: "en1", kind: "poem", language: "en", register: "creative",
    text: "We stand in the sunlight, not in the shadows. We are neighbors, teachers, passersby." },
  { card_id: "en2", kind: "prose", language: "en", register: "essay",
    text: "Born in Jiangsu, raised in Shanghai, writing from a final year in New York." },
  { card_id: "zh2", kind: "qa", language: "zh", register: "conversational",
    text: "问：你需要另一个大脑吗？答：我需要一个大脑进行推理，不然我每次的回答都不太一样。" }
];

test("a Chinese question yields a Chinese output rule even with English evidence", () => {
  const p = buildEvidencePacket(CARDS, { question: "你拍照时在想什么？" });
  assert.equal(p.answer_language, "zh");
  assert.match(p.instruction, /用中文回答/);
  assert.deepEqual(p.languages_used.sort(), ["en", "zh"]);
});

test("an English question switches the output rule", () => {
  const p = buildEvidencePacket(CARDS, { question: "What do you think about photography?" });
  assert.equal(p.answer_language, "en");
  assert.match(p.instruction, /answer in English/i);
});

test("English cards are admitted as knowledge", () => {
  const p = buildEvidencePacket(CARDS, { question: "你在哪长大的？" });
  assert.ok(p.instruction.includes("Born in Jiangsu"), "English evidence must reach the model");
  assert.equal(p.knowledge_count, 4);
});

test("English material is barred from becoming speech", () => {
  const p = buildEvidencePacket(CARDS, { question: "你怎么看摄影？" });
  assert.match(p.instruction, /不要直译/);
  assert.match(p.instruction, /不要引用其中的句子/);
  assert.match(p.instruction, /不要模仿它的句式或文学腔/);
});

test("voice reference is drawn only from Chinese conversational material", () => {
  const p = buildEvidencePacket(CARDS, { question: "你好" });
  assert.equal(p.voice_count, 1, "only the Chinese conversational card qualifies");
  const voiceBlock = p.instruction.split("【他中文说话的样子")[1] || "";
  assert.ok(!voiceBlock.includes("We stand in the sunlight"), "an English poem is never a voice example");
  assert.ok(!voiceBlock.includes("Born in Jiangsu"), "an English essay is never a voice example");
});

test("with no Chinese conversational card there is no voice block at all", () => {
  const p = buildEvidencePacket(CARDS.filter((c) => c.language === "en"), { question: "你好" });
  assert.equal(p.voice_count, 0);
  assert.ok(!p.instruction.includes("语气参照"));
  assert.ok(p.knowledge_count > 0, "knowledge still flows through");
});

test("the packet forbids inventing beyond the evidence and naming the mechanism", () => {
  const p = buildEvidencePacket(CARDS, { question: "你多大了？" });
  assert.match(p.instruction, /说不知道|不确定/);
  assert.match(p.instruction, /不要提到这些材料|内部机制/);
});

test("the frozen prompt separates evidence language from answer language", () => {
  assert.match(PRODUCT_SYSTEM_PROMPT, /默认用中文回答/);
  assert.match(PRODUCT_SYSTEM_PROMPT, /材料是什么语言，跟你用什么语言回答无关/);
});

test("language detection treats mixed text as Chinese", () => {
  assert.equal(detectQuestionLanguage("你用 GFX100s 拍的吗"), "zh");
  assert.equal(detectQuestionLanguage("Which lens did you use"), "en");
  assert.equal(detectQuestionLanguage("你好"), "zh");
});

test("the answer path sends the evidence and reports what it used", async () => {
  const seen = {};
  const enc = new TextEncoder();
  const fetchImpl = async (_u, init) => {
    seen.body = JSON.parse(init.body);
    return {
      ok: true, status: 200,
      body: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "在上海长大。" }, index: 0 }] })}\n\n`));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        }
      })
    };
  };
  const p = createDeepSeekAnswerPath({ getKey: () => "sk-testtesttesttesttest1234", keyPresent: () => true, fetchImpl });
  const r = await p.answer({ userText: "你在哪长大的？", cards: CARDS });

  assert.equal(r.ok, true);
  assert.equal(r.evidence.cards, 4);
  assert.equal(r.evidence.answer_language, "zh");
  assert.deepEqual(r.evidence.languages.sort(), ["en", "zh"]);

  const systems = seen.body.messages.filter((m) => m.role === "system");
  const joined = systems.map((m) => m.content).join("\n");
  assert.ok(joined.includes("Born in Jiangsu"), "English evidence reached the request");
  assert.match(joined, /用中文回答/);
});

test("a turn with no cards behaves exactly as before", async () => {
  const seen = {};
  const enc = new TextEncoder();
  const fetchImpl = async (_u, init) => {
    seen.body = JSON.parse(init.body);
    return {
      ok: true, status: 200,
      body: new ReadableStream({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "在" }, index: 0 }] })}\n\n`));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        }
      })
    };
  };
  const p = createDeepSeekAnswerPath({ getKey: () => "sk-testtesttesttesttest1234", keyPresent: () => true, fetchImpl });
  const r = await p.answer({ userText: "在吗" });
  assert.equal(r.ok, true);
  assert.equal(r.evidence, null);
  assert.equal(seen.body.messages.filter((m) => m.role === "system").length, 1);
});
