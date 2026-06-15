const MUSIC_METHOD_LEAK_RE = /(观看关系|阅读关系|判断关系|改变观看|改变阅读|图像关系|观看、阅读或判断关系)/;
const LITERATURE_LIST_LEAK_RE = /(只看沉默|只看季节|先看羞耻|沉默、季节、羞耻)/;

function clean(text) {
  return String(text || "").trim();
}

function musicLike({ query = "", domain = "", questionType = "" } = {}) {
  return (
    /^music\./.test(domain || "") ||
    /(罗大佑|华语流行|歌曲|歌|专辑|童年|鹿港小镇|恋曲1990|之乎者也)/.test(query) ||
    /^music_/.test(questionType || "")
  );
}

function listLike(questionType = "") {
  return /(works_list|representative_works|author_list|list|music_representativeness|music_characteristics)/.test(questionType);
}

export function detectMethodLeak({ query = "", answer = "", domain = "", questionType = "" } = {}) {
  const q = clean(query);
  const text = clean(answer);
  const reasons = [];

  if (musicLike({ query: q, domain, questionType }) && !/(跨媒介|视觉|摄影|艺术|文学.*音乐|比较.*文学|比较.*艺术)/.test(q)) {
    if (MUSIC_METHOD_LEAK_RE.test(text)) reasons.push("music_answer_leaks_visual_or_literary_method");
  }

  if (/literature/.test(domain || "") && listLike(questionType) && LITERATURE_LIST_LEAK_RE.test(text)) {
    reasons.push("literature_list_leaks_mood_template");
  }

  if (listLike(questionType) && !/《[^》]+》|夏目|川端|罗大佑|李宗盛|邓丽君|鲁迅|张爱玲|杜尚|人物|作品/.test(text)) {
    if (/抽象|气质|时代感|沉默|季节|玄学/.test(text)) reasons.push("list_answer_missing_anchors");
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}
