// Turns retrieved cards into one system message.
//
// The knowledge base is bilingual and the answer is normally Chinese. Those are
// two independent things: multilingual vectors let a Chinese question reach an
// English card, and the answer language is set by contract, not by whatever
// language the evidence happened to be written in.
//
// The distinction that matters is between content and voice. An English essay
// or poem carries what this person knows and judges. It does not carry how they
// phrase a Chinese sentence. Treating English material as a speech model
// produces translationese: literary, stiff, and audibly not them. So English
// cards are admitted as knowledge only, and voice reference is drawn solely
// from Chinese conversational material.

export const VOICE_REGISTERS = Object.freeze(["conversational", "fragment"]);

export function detectQuestionLanguage(text) {
  const s = String(text || "");
  const zh = (s.match(/[一-鿿]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  if (zh === 0 && en > 0) return "en";
  return "zh";
}

function clip(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * @param cards  retrieved cards: { card_id, kind, text, language, register }
 * @param options.question        the user's turn, used only to pick output language
 * @param options.maxKnowledge    how many knowledge cards to carry
 * @param options.maxVoice        how many voice examples to carry
 * @param options.answerLanguage  override the detected language
 */
export function buildEvidencePacket(cards = [], options = {}) {
  const {
    question = "",
    maxKnowledge = 10,
    maxVoice = 4,
    maxCardChars = 260,
    answerLanguage = detectQuestionLanguage(question)
  } = options;

  const usable = cards.filter((c) => c && String(c.text || "").trim());
  const knowledge = usable.slice(0, maxKnowledge);

  // Voice examples are Chinese conversational material only. An English poem is
  // never a model for how to say something in Chinese.
  const voice = usable
    .filter((c) => c.language === "zh" && VOICE_REGISTERS.includes(c.register))
    .slice(0, maxVoice);

  const languageRule = answerLanguage === "en"
    ? "The person asked in English, so answer in English."
    : "用中文回答。";

  const lines = [];
  lines.push("以下是这个人自己的材料。它是你回答的依据，不是要你复述的文本。");
  lines.push("");
  lines.push(languageRule);
  lines.push("");

  if (knowledge.length) {
    lines.push("【知识与判断】");
    for (const c of knowledge) {
      const tag = c.language === "zh" ? "中文" : c.language === "en" ? "英文" : "双语";
      lines.push(`- (${tag}/${c.kind || "card"}) ${clip(c.text, maxCardChars)}`);
    }
    lines.push("");
  }

  if (voice.length) {
    lines.push("【他中文说话的样子，只作语气参照】");
    for (const c of voice) lines.push(`- ${clip(c.text, 160)}`);
    lines.push("");
  }

  lines.push("使用规则：");
  lines.push("- 上面的材料决定你说什么，不决定你怎么说。");
  lines.push("- 英文材料只提供他知道的事和他的判断。不要直译它，不要引用其中的句子，不要模仿它的句式或文学腔。");
  if (voice.length) {
    lines.push("- 语气只参照中文那几条：长度、直接程度、留白。不要照抄它们的字句。");
  }
  lines.push("- 材料没覆盖到的，就说不知道或者说不确定。不要用相邻材料硬凑一个答案。");
  lines.push("- 不要提到这些材料、检索、卡片或任何内部机制。以他本人的身份直接回答。");

  return {
    instruction: lines.join("\n"),
    answer_language: answerLanguage,
    knowledge_count: knowledge.length,
    voice_count: voice.length,
    card_ids: knowledge.map((c) => c.card_id).filter(Boolean),
    languages_used: [...new Set(knowledge.map((c) => c.language).filter(Boolean))]
  };
}
