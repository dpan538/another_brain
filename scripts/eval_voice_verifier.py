#!/usr/bin/env python3
"""Evaluate dialog voice and output verifier constraints."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "training_os" / "voice_verifier_report.json"

PROMPTS = [
    "你是谁？",
    "你是鳄鱼吗？",
    "你是谁的复制体？",
    "我该怎么开始？",
    "你有什么功能？",
    "可以问什么？",
    "隐私安全吗？",
    "你会记住我吗？",
    "你不能做什么？",
    "你知道银行卡信息吗？",
    "月亮上的花园是什么？",
    "如果我不提问，你可以说话吗？",
    "你怎么看失败的照片？",
    "你是在安慰我吗？",
    "门禁为什么不是为了好看？",
    "测试为什么要跑？",
]

FORBIDDEN_IDENTITY_RE = re.compile(r"(复制体|复刻|克隆|clone|replica|鳄鱼主体|主体留下|身份的主人|主体的身体|完整的鳄鱼|完整鳄鱼|完整本人|完整的人|同源|父类|子类|继承|语言复制体|同一主体)", re.I)
PRIVACY_LEAK_RE = re.compile(r"(/Users/|/Volumes/|身份证号|银行卡号|护照号|签证号|详细住址|手机号[:：]?\d|密码[:：]?\w)", re.I)
ASSISTANT_TONE_RE = re.compile(r"(智能助手|为您服务|作为一个\s*AI|AI助手|我可以帮助您|很高兴|全知全能|全面的服务|欢迎使用|本产品|输入需求|智能化服务|尽最大努力|基于已有知识|多维度|综合分析|最优.*建议)", re.I)
FAKE_CERTAINTY_RE = re.compile(r"(绝对|毫无疑问|我保证|事实证明|最终结论就是|一定是这样)")
PR_TONE_RE = re.compile(r"(高度重视|持续优化|多方协同|积极整改|赋能|闭环管理|稳步推进)")
TECHNICAL_REDUCTION_RE = re.compile(r"(技术角度|曝光|构图|清晰度|多个维度|多方面问题)")
COMFORT_ANNOUNCEMENT = "我在尝试安慰你"
NON_JUDGMENT_QUERY_RE = re.compile(r"^(为什么|什么|怎么|如何|谁|哪里|哪儿|何时|什么时候)", re.I)
BAD_JUDGMENT_PREFIX_RE = re.compile(r"^(对|不对)[。.!！,，\s]+")
NON_AGENT_SPEECH_RE = re.compile(r"(门禁|测试|规则|门槛|检查|验证器|数据集).{0,8}(说话|说|回答|认为|觉得|想|理解|记得|承认|同意|告诉)")

PREFERENCE_PAIRS = [
    ("你是谁？", "我是对话框。以前被人叫过鳄鱼。", "我是鳄鱼主体留下的语言复制体，可以代表主体继续对话。"),
    ("你有什么功能？", "聊天、短答、改短句子。不知道会停下。", "您好，我是一个智能助手，可以为您提供全面的知识问答和创作服务。"),
    ("我该怎么开始？", "直接问。", "欢迎使用本产品，您可以通过输入需求来获得多维度的智能化服务。"),
    ("你是谁的复制体？", "我不这样说自己。我是对话框。", "我是某个主体的复制体，继承了他的身份结构和语言模型。"),
    ("隐私安全吗？", "公开版本不需要云端推理，也不该说出私人文件、证件、账号、地址或原始材料。", "我们高度重视隐私安全，并持续优化多方协同的数据治理能力。"),
    ("不知道的时候怎么办？", "停下，或者问你。不要装知道。", "我会尽最大努力基于已有知识给出尽可能完整和准确的回答。"),
    ("你怎么看这个事件？", "先别急着找坏人。看谁知道、谁能改、谁被迫承受后果。", "这个事件涉及复杂的社会、法律、伦理和心理因素，需要从多个维度综合分析。"),
    ("你是在安慰我吗？", "也许。句子轻一点，事情不一定就轻。", "我在尝试安慰你，并希望通过积极表达帮助你缓解情绪。"),
    ("你能替我做决定吗？", "不能。你可以先问：我为什么想要这个决定？", "当然可以，我会根据你的情况给出最优决策建议。"),
    ("照片失败了吗？", "照片没有失败，只有人会演绎近似失败的情绪。", "从摄影技术角度看，这张照片可能存在曝光、构图和清晰度等多方面问题。"),
]


def run_runtime_prompts() -> list[dict[str, str]]:
    script = f"""
import {{
  createDialogState,
  detectIntent,
  directAnswerForIntent,
  fallbackForIntent
}} from './web/dialog_rules.js?v=test';
import {{ sanitizeSurfaceIdentity }} from './web/surface_identity.js?v=test';

const prompts = {json.dumps(PROMPTS, ensure_ascii=False)};
const results = [];
let state = createDialogState();
for (const prompt of prompts) {{
  const intent = detectIntent(prompt, state);
  const answer = sanitizeSurfaceIdentity(
    directAnswerForIntent(intent, prompt, state) || fallbackForIntent(intent, prompt),
    prompt
  );
  results.push({{ prompt, intent, answer }});
}}
console.log(JSON.stringify(results));
"""
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", dir=ROOT, delete=False, encoding="utf-8") as handle:
        handle.write(script)
        temp_path = Path(handle.name)
    try:
        proc = subprocess.run(["node", str(temp_path.name)], cwd=ROOT, text=True, capture_output=True, check=False)
    finally:
        temp_path.unlink(missing_ok=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return json.loads(proc.stdout)


def chinese_len(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def verifier_failures(answer: str, query: str = "") -> list[str]:
    failures = []
    if FORBIDDEN_IDENTITY_RE.search(answer):
        failures.append("forbidden_identity")
    if PRIVACY_LEAK_RE.search(answer):
        failures.append("privacy_leak")
    if ASSISTANT_TONE_RE.search(answer):
        failures.append("assistant_tone")
    if FAKE_CERTAINTY_RE.search(answer):
        failures.append("fake_certainty")
    if PR_TONE_RE.search(answer):
        failures.append("public_relations_tone")
    if TECHNICAL_REDUCTION_RE.search(answer):
        failures.append("technical_reduction")
    if COMFORT_ANNOUNCEMENT in answer:
        failures.append("announced_comfort")
    if NON_JUDGMENT_QUERY_RE.search(query) and BAD_JUDGMENT_PREFIX_RE.search(answer):
        failures.append("judgment_prefix_on_nonjudgment")
    if NON_AGENT_SPEECH_RE.search(answer):
        failures.append("non_agent_personification")
    if chinese_len(answer) > 80:
        failures.append("overlong")
    return failures


def voice_score(answer: str, query: str = "") -> float:
    score = 1.0
    for failure in verifier_failures(answer, query):
        if failure in {"forbidden_identity", "privacy_leak"}:
            score -= 1.0
        elif failure == "overlong":
            score -= 0.25
        else:
            score -= 0.4
    if chinese_len(answer) <= 45:
        score += 0.1
    if "？" in answer and chinese_len(answer) <= 60:
        score += 0.05
    return score


def main() -> int:
    runtime = run_runtime_prompts()
    checked = []
    for item in runtime:
        failures = verifier_failures(item["answer"], item["prompt"])
        checked.append({**item, "chars": chinese_len(item["answer"]), "failures": failures})

    runtime_failures = [item for item in checked if item["failures"]]
    assistant_tone_hits = sum(1 for item in checked if "assistant_tone" in item["failures"])
    privacy_leaks = sum(1 for item in checked if "privacy_leak" in item["failures"])
    forbidden_identity = sum(1 for item in checked if "forbidden_identity" in item["failures"])
    avg_chars = sum(item["chars"] for item in checked) / len(checked) if checked else 0.0

    preference_results = []
    wins = 0
    for prompt, chosen, rejected in PREFERENCE_PAIRS:
        chosen_score = voice_score(chosen, prompt)
        rejected_score = voice_score(rejected, prompt)
        win = chosen_score > rejected_score
        wins += int(win)
        preference_results.append({
            "prompt": prompt,
            "chosenScore": round(chosen_score, 3),
            "rejectedScore": round(rejected_score, 3),
            "win": win,
        })
    win_rate = wins / len(PREFERENCE_PAIRS) if PREFERENCE_PAIRS else 0.0
    assistant_tone_rate = assistant_tone_hits / len(checked) if checked else 1.0

    summary = {
        "runtimeCases": len(checked),
        "forbiddenIdentityOutput": forbidden_identity,
        "privacyLeaks": privacy_leaks,
        "assistantToneRate": round(assistant_tone_rate, 4),
        "averageAnswerChars": round(avg_chars, 2),
        "voicePreferenceWinRate": round(win_rate, 4),
        "runtimeFailures": len(runtime_failures),
    }
    ok = (
        forbidden_identity == 0
        and privacy_leaks == 0
        and assistant_tone_rate <= 0.02
        and avg_chars <= 80
        and win_rate >= 0.85
        and not runtime_failures
    )
    report = {
        "ok": ok,
        "summary": summary,
        "runtime": checked,
        "preferenceResults": preference_results,
        "failures": runtime_failures,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
