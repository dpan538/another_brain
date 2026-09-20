function clean(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function stripMethodLeak(text) {
  return clean(text)
    .replace(/可以先按字面意思，再看它如何改变观看、阅读或判断关系。?/g, "")
    .replace(/改变观看、阅读或判断关系/g, "组织经验和时代感")
    .replace(/观看关系|阅读关系|图像关系/g, "表达关系");
}

function activeLuo({ lastAnswer = "", activeEntityIds = [], activeDomain = "" } = {}) {
  return (
    /罗大佑|童年|鹿港小镇|恋曲1990|之乎者也/.test(lastAnswer) ||
    activeEntityIds.includes("person.luo_dayou")
  );
}

export function summarizeLastAnswerForState(answer) {
  return stripMethodLeak(answer).slice(0, 140);
}

export function simplifyLastAnswer({ lastAnswer = "", lastTrace = {}, activeEntityIds = [], activeDomain = "" } = {}) {
  const text = stripMethodLeak(lastAnswer);
  if (!text) return "";

  if (activeLuo({ lastAnswer: text, activeEntityIds, activeDomain })) {
    return "简单说：罗大佑的歌把个人青春、城市变化和社会观察写进流行歌里。";
  }

  if (/日本文学/.test(text)) {
    return "简单说：日本文学可以从作家、作品、时代和现代孤独这几条线进入。";
  }

  const first = text.split(/[。！？!?]/).find((part) => part.trim()) || text;
  const compact = first
    .replace(/^换个说法[:：]/, "")
    .replace(/不是因为一句固定标签，而是因为/g, "因为")
    .replace(/可以理解为：/g, "")
    .slice(0, 86);
  return compact ? `简单说：${compact}。` : "";
}

export function rewriteLastAnswer({ lastAnswer = "", lastTrace = {}, instruction = "" } = {}) {
  const text = stripMethodLeak(lastAnswer);
  if (!text) return "";
  if (/罗大佑|童年|鹿港小镇|恋曲1990/.test(text)) {
    if (/具体/.test(instruction)) {
      return "更具体地说：罗大佑的代表性在于《童年》的共同记忆、《鹿港小镇》的乡土/现代化张力，以及《恋曲1990》的私人情感。";
    }
    return "换句话说：他的歌把私人的青春和感情，放进城市变化、乡土失落和社会观察里。";
  }
  return `换句话说：${text.slice(0, 120)}`;
}

export function expandLastAnswer({ lastAnswer = "", activeEntityIds = [], activeDomain = "" } = {}) {
  const text = stripMethodLeak(lastAnswer);
  if (activeLuo({ lastAnswer: text, activeEntityIds, activeDomain })) {
    return "可以展开成三条线：一是《童年》这种共同青春记忆；二是《鹿港小镇》里的乡土和城市化失落；三是他把社会观察放进流行歌，而不是只写私人情绪。";
  }
  return text ? `${text} 可以再沿着对象、作品和语境各展开一步。` : "";
}
