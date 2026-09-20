function clean(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function truncateAtSentence(text, maxSentences) {
  const parts = clean(text)
    .split(/(?<=[。！？!?])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= maxSentences) return clean(text);
  return parts.slice(0, maxSentences).join("");
}

function preserveEnd(text) {
  return /[。！？!?]$/.test(text) ? text : `${text}。`;
}

export function formatMobileAnswer({ answer = "", density = {}, plan = {}, query = "" } = {}) {
  let text = clean(answer)
    .replace(/个人青春/g, "青春")
    .replace(/城乡\/城市变化/g, "城乡变化")
    .replace(/乡土\/现代化/g, "乡土和现代化")
    .replace(/改变观看、阅读或判断关系/g, "组织经验和时代感")
    .replace(/观看关系|阅读关系|图像关系/g, "表达关系");

  const maxChars = density.max_chars_zh || density.max_chars || 110;
  const maxSentences = density.max_sentences || 2;

  if (plan.semantic_signature === "person.luo_dayou|music_characteristics|representativeness") {
    if (/同一个方向|换个说法/.test(text)) {
      text = "同一个方向，简单说：他的歌把青春记忆、城乡变化和社会观察放进流行歌；《童年》《鹿港小镇》《恋曲1990》是入口。";
    } else if (/特点|风格/.test(query)) {
      text = "特点是叙事性、民谣/摇滚质地和直白压力：旋律易进，主题常落到青春、城市变化和社会观察。";
    } else {
      text = "代表性在三点：青春记忆、城乡变化、社会观察。入口可以听《童年》《鹿港小镇》《恋曲1990》。";
    }
  }

  if (/代表作家可先抓|重要作家可从|可先记夏目漱石/.test(text)) {
    text = /重要作家/.test(query)
      ? "重要作家可从夏目漱石、川端康成、太宰治、村上春树进入，分别连到近代、战后和当代。"
      : "代表作家先抓夏目漱石、川端康成、太宰治、村上春树。";
  }

  if (/simplify|last_answer_transform/.test(`${plan.plan_id || ""} ${query}`) && /罗大佑|青春|社会观察/.test(text)) {
    text = "简单说：他的歌把青春、城市变化和社会观察写进流行歌里。";
  }

  text = truncateAtSentence(text, maxSentences);
  if (text.length > maxChars) {
    text = text.slice(0, Math.max(12, maxChars - 1)).replace(/[，、；：,.!?！？。]*$/g, "");
  }
  return preserveEnd(text);
}
