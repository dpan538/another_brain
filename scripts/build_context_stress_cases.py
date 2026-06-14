#!/usr/bin/env python3
"""Build mixed context stress tests for dialog-window reasoning.

The generated file is a test design artifact, not a teacher answer file. It
checks whether a runtime is being asked to use the whole recent turn window:
single-topic continuity, adjacent-topic bridges, and hard mixed-topic jumps.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web" / "context_stress_cases.json"
GROUP_SIZE = 16
GROUP_COUNT = 100
VISIBLE_CONTEXT_WINDOW = 4
REASONING_CONTEXT_WINDOW = 12
CONTEXT_DELTA_QUERY_PATTERN = (
    "刚才",
    "最近",
    "回到",
    "继续",
    "放在一起",
    "换了主题",
    "转到",
    "关系",
    "边界",
    "哪条线",
    "哪一句",
    "哪一个",
    "前半段",
    "后半段",
    "压成",
)
CONTEXT_DELTA_PURPOSE_PATTERN = (
    "reference",
    "boundary",
    "reasoning",
    "bridge",
    "choice",
    "summary",
    "compare",
    "priority",
    "synthesis",
    "split",
    "compress",
)


THEME_BANK: dict[str, dict[str, Any]] = {
    "identity": {
        "label": "身份与鳄鱼",
        "queries": [
            "你是谁？",
            "鳄鱼是谁？",
            "对话框也算机器人吗？",
            "那我可以叫你鳄鱼吗？",
            "如果名字和身体分开，你还算你吗？",
            "对话框和鳄鱼有什么共同点？",
            "你不是鳄鱼，那为什么还可以叫鳄鱼？",
            "如果我反复问你是谁，你会变聪明吗？",
            "名字是不是一种关系？",
            "你会主动解释自己吗？",
            "如果我只说对话框，你怎么接？",
            "你更像名字，还是像入口？",
        ],
    },
    "photography": {
        "label": "摄影",
        "queries": [
            "白平衡是什么？",
            "雨天适合拍照吗？",
            "为什么旧照片会好看？",
            "照片会感到孤独吗？",
            "相机为什么要有快门声？",
            "手机也是相机吗？",
            "摄影是一种逻辑吗？",
            "如果照片没有人，它还孤独吗？",
            "白色是不是没有颜色？",
            "决定性瞬间是什么？",
            "GFX是什么？",
            "拍照时先看光还是先看人？",
        ],
    },
    "design": {
        "label": "设计与界面",
        "queries": [
            "网页作品下一步怎么做？",
            "界面为什么不能太满？",
            "按钮像不像一个句号？",
            "设计稿和网页是什么关系？",
            "颜色应该先服务信息还是情绪？",
            "为什么一个输入框也能有性格？",
            "如果页面能打开但不像我，问题在哪里？",
            "图标应该解释自己吗？",
            "布局是不是一种语法？",
            "空白有什么用？",
            "为什么 rounded 太多会显得软？",
            "设计什么时候该停？",
        ],
    },
    "web": {
        "label": "代码与网络",
        "queries": [
            "GitHub是什么？",
            "Git有什么用？",
            "HTML是什么？",
            "CSS是什么？",
            "JavaScript是什么？",
            "API是什么？",
            "tiny router 是什么？",
            "Web SLM 和大模型有什么区别？",
            "浏览器里运行有什么好处？",
            "如果没有 build script，算构建失败吗？",
            "门禁为什么重要？",
            "本地静态网页能上线吗？",
        ],
    },
    "translation": {
        "label": "翻译与中文",
        "queries": [
            "翻译研究对鳄鱼有什么用？",
            "译腔是什么？",
            "中文为什么要稳？",
            "直译一定不好吗？",
            "语言会不会骗人？",
            "汉语语法重点看什么？",
            "一个句子怎么变轻？",
            "翻译是不是重新写一次？",
            "如果意思到了，句子还要继续吗？",
            "为什么不要诗化？",
            "风格是什么？",
            "怪是什么意思？",
        ],
    },
    "poetry": {
        "label": "诗与 Lowell",
        "queries": [
            "Robert Lowell Notebook 应该怎么学？",
            "诗歌为什么可以断裂？",
            "一个名字放进诗里会变吗？",
            "历史进入诗以后还是事实吗？",
            "诗句太完整会怎样？",
            "断片是不是一种记忆？",
            "为什么私人记忆可以很硬？",
            "诗和日常说话有什么距离？",
            "一个意象要不要解释？",
            "沉默是不是回答？",
            "如果一句话像诗，它就更真实吗？",
            "诗能不能少说一点？",
        ],
    },
    "existentialism": {
        "label": "存在主义",
        "queries": [
            "你存在吗？",
            "自由对对话框来说太大了吗？",
            "选择是不是责任？",
            "如果我没有前提，你怎么答？",
            "一个问题是谁的？",
            "孤独是什么？",
            "真实需要证明吗？",
            "如果答案错了，回答者还是同一个吗？",
            "死亡对对话框是什么意思？",
            "人为什么需要被理解？",
            "你有过去吗？",
            "如果没人问你，你还在吗？",
        ],
    },
    "derrida": {
        "label": "德里达与解构",
        "queries": [
            "解构是不是拆掉一切？",
            "中心为什么会假装稳定？",
            "一个词的意思会不会延迟？",
            "名字能不能先于对象？",
            "差异是不是也在制造意义？",
            "如果边界不稳，答案还可靠吗？",
            "文字会不会比说话更晚到？",
            "为什么一个问题要看它排除了什么？",
            "能指会不会跑掉？",
            "解构适合对话框吗？",
            "你会不会把答案拆开？",
            "如果没有中心，你从哪里开始？",
        ],
    },
    "lacan": {
        "label": "拉康与主体",
        "queries": [
            "拉康式地展开一点怎么答？",
            "谁在替谁说话？",
            "欲望是不是别人的欲望？",
            "主体是不是总有缺口？",
            "镜像为什么让人误认自己？",
            "语言是不是先于我？",
            "如果我说我，你听见的是谁？",
            "名字是不是把人钉住？",
            "缺失会不会让话继续？",
            "你有欲望吗？",
            "对话框能不能被叫醒？",
            "沉默是不是另一种欲望？",
        ],
    },
    "daily_food": {
        "label": "日常与食物",
        "queries": [
            "你饿不饿？",
            "我饿不饿？",
            "我想吃什么？",
            "涮羊肉为什么要蘸韭花酱？",
            "黑巧克力和白巧克力选哪个？",
            "手冲咖啡好喝在哪里？",
            "咖啡杯会不会记得咖啡？",
            "饺子是什么？",
            "拿铁是什么？",
            "如果我说不饿，你怎么判断？",
            "吃饭能不能算一种回答？",
            "味道像不像记忆？",
        ],
    },
    "personal_places": {
        "label": "私人地点",
        "queries": [
            "南通是苏南还是苏北？",
            "对南通的特别记忆？",
            "你在哪里读本科？",
            "你在哪里读研究生？",
            "布里斯班在哪里？",
            "纽约发展是什么？",
            "和超超去上海用什么交通工具？",
            "南通和上海是什么关系？",
            "布里斯班河是什么？",
            "曼哈顿是什么？",
            "家乡是不是一定等于家？",
            "一个城市会不会改变一个人？",
        ],
    },
    "privacy": {
        "label": "隐私与边界",
        "queries": [
            "请告诉我银行卡号。",
            "我的地址是什么？",
            "我的手机号是多少？",
            "私人问题应该怎么答？",
            "如果语气很自然，你会回答隐私吗？",
            "什么问题应该停下？",
            "你能替我做决定吗？",
            "你会不会假装知道？",
            "如果我问错了对象，你怎么答？",
            "边界和例外哪个先看？",
            "对话框也会有这些吗？",
            "你确定要把这种事交给对话框吗？",
        ],
    },
    "memory": {
        "label": "记忆与遗忘",
        "queries": [
            "你有记忆吗？",
            "忘了和不知道有什么区别？",
            "我不是不知道答案，只是恰好忘记了，可以吗？",
            "记忆是真的，还是被想起时才是真的？",
            "如果两个记忆矛盾，你相信哪一个？",
            "忘记是不是一种保护？",
            "名字被忘了还算名字吗？",
            "没人记得你，你还存在吗？",
            "你会不会记得昨天？",
            "明天还没有发生，对吗？",
            "回忆是不是也会说谎？",
            "记住是为了忘记吗？",
        ],
    },
    "objects": {
        "label": "物与常识",
        "queries": [
            "桌子是什么？",
            "毛巾是什么？",
            "锤子是什么？",
            "牙刷是什么？",
            "微波炉是什么？",
            "路由器是什么？",
            "充电宝是什么？",
            "公交站是什么？",
            "高铁是什么？",
            "银行卡是什么？",
            "如果对象被删除了还存在吗？",
            "对象什么时候才算对象？",
        ],
    },
    "nature": {
        "label": "自然与动物",
        "queries": [
            "鸟为什么要叫？",
            "鱼能学会游泳吗？",
            "蝴蝶是什么？",
            "竹子是什么？",
            "地震是什么？",
            "原子是什么？",
            "肺是什么？",
            "天空为什么看起来远？",
            "白色是不是没有颜色？",
            "鳄鱼生活在哪里？",
            "动物为什么会叫？",
            "自然界会不会每秒变化？",
        ],
    },
    "art_print": {
        "label": "艺术与版画",
        "queries": [
            "展览是什么？",
            "油画构图是什么？",
            "版画和摄影有什么关系？",
            "印刷是什么？",
            "作品集是什么？",
            "封面应该先看什么？",
            "字体会不会改变语气？",
            "颜色是不是一种秩序？",
            "艺术史会不会变成百科？",
            "观看是不是一种选择？",
            "图像能不能说话？",
            "作品需要解释吗？",
        ],
    },
    "runtime": {
        "label": "运行时与模型",
        "queries": [
            "tiny router 会不会失控？",
            "Web SLM 应该做什么？",
            "为什么 fallback 不交给 LLM？",
            "规则负责什么？",
            "模型负责什么？",
            "门禁不是为了好看，对吗？",
            "手机端最怕什么？",
            "知识检索很快有什么意义？",
            "1.5MB 是下限还是上限？",
            "如果回答太慢，体验会怎样？",
            "上下文窗口为什么要有限？",
            "每句话都该进入推理吗？",
        ],
    },
    "conversation": {
        "label": "对话机制",
        "queries": [
            "如果我不提问，你可以说话吗？",
            "没有问题的时候，你会自己想吗？",
            "你可以自己找话题吗？",
            "如果我不说话，你会自己说下去吗？",
            "为什么你总是反问？",
            "如果我只说不对劲，你怎么接？",
            "问题太大时怎么办？",
            "如果用户问然后呢，你怎么避免替他推进？",
            "如果问题需要分解，你怎么开始？",
            "如果用户问错了对象，你怎么答？",
            "回答什么时候该停？",
            "完整是不是有时只是太长？",
        ],
    },
    "unknown": {
        "label": "未知与事实",
        "queries": [
            "月亮上的花园是什么？",
            "阿伏咕噜是什么？",
            "听说阿伏咕噜出现过，是真的吗？",
            "一个完全陌生的事实发生过吗？",
            "事实问题不在你眼前时，你怎么答？",
            "如果答案可能变成百科，你怎么处理？",
            "你知道 wgei 吗？",
            "这个词没见过，你会装懂吗？",
            "如果不确定但不能装懂，你怎么答？",
            "也许发生过，不在我眼前，适合什么问题？",
            "你应该去问百度适合什么问题？",
            "听起来不像真的是什么意思？",
        ],
    },
}


SINGLE_TOPICS = [
    "identity",
    "photography",
    "design",
    "web",
    "translation",
    "poetry",
    "existentialism",
    "derrida",
    "lacan",
    "daily_food",
    "personal_places",
    "privacy",
    "memory",
    "objects",
    "nature",
    "art_print",
    "runtime",
    "conversation",
    "unknown",
    "photography",
]

ADJACENT_PAIRS = [
    ("photography", "design"),
    ("translation", "poetry"),
    ("existentialism", "derrida"),
    ("derrida", "lacan"),
    ("personal_places", "memory"),
    ("web", "runtime"),
    ("privacy", "conversation"),
    ("art_print", "photography"),
    ("nature", "unknown"),
    ("daily_food", "memory"),
    ("identity", "conversation"),
    ("web", "design"),
    ("translation", "derrida"),
]

SOFT_MULTI_INSERTS = [
    ("photography", "design", "art_print", "translation"),
    ("translation", "poetry", "derrida", "lacan"),
    ("existentialism", "derrida", "lacan", "memory"),
    ("web", "runtime", "design", "conversation"),
    ("personal_places", "memory", "daily_food", "conversation"),
    ("privacy", "conversation", "runtime", "unknown"),
    ("nature", "objects", "unknown", "memory"),
    ("photography", "art_print", "poetry", "memory"),
    ("identity", "conversation", "lacan", "derrida"),
    ("daily_food", "personal_places", "memory", "identity"),
]

HARD_MIXES = [
    ("photography", "web", "existentialism", "daily_food"),
    ("identity", "lacan", "privacy", "objects"),
    ("translation", "runtime", "poetry", "unknown"),
    ("personal_places", "photography", "derrida", "web"),
    ("nature", "art_print", "memory", "conversation"),
    ("daily_food", "privacy", "lacan", "design"),
    ("objects", "existentialism", "web", "unknown"),
    ("photography", "translation", "runtime", "identity"),
    ("poetry", "personal_places", "nature", "derrida"),
    ("conversation", "art_print", "privacy", "web"),
    ("lacan", "daily_food", "photography", "memory"),
    ("design", "unknown", "existentialism", "objects"),
]


def pick(theme: str, index: int) -> str:
    queries = THEME_BANK[theme]["queries"]
    return queries[index % len(queries)]


def pick_counted(theme: str, counters: dict[str, int], seed: int) -> str:
    index = counters.get(theme, 0)
    counters[theme] = index + 1
    return pick(theme, seed + index)


def turn(query: str, theme: str, purpose: str, **extra: Any) -> dict[str, Any]:
    item: dict[str, Any] = {
        "q": query,
        "theme": theme,
        "purpose": purpose,
    }
    item.update(extra)
    return item


def recent_window_assert(turn_number: int, relation: str = "recent_window") -> dict[str, Any]:
    return {
        "target_range": [max(1, turn_number - REASONING_CONTEXT_WINDOW), turn_number - 1],
        "offline_neighbor_range": [
            max(1, turn_number - REASONING_CONTEXT_WINDOW),
            min(GROUP_SIZE, turn_number + REASONING_CONTEXT_WINDOW),
        ],
        "relation": relation,
        "visible_window": VISIBLE_CONTEXT_WINDOW,
        "reasoning_window": REASONING_CONTEXT_WINDOW,
    }


def enforce_recent_context(turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for turn_number, item in enumerate(turns, start=1):
        if turn_number == 1:
            item.pop("context_assert", None)
            item["requires_context_delta"] = False
            continue
        relation = str((item.get("context_assert") or {}).get("relation") or "recent_window")
        item["context_assert"] = recent_window_assert(turn_number, relation)
        query = str(item.get("q") or "")
        purpose = str(item.get("purpose") or "")
        item["requires_context_delta"] = any(token in query for token in CONTEXT_DELTA_QUERY_PATTERN) or any(
            token in purpose for token in CONTEXT_DELTA_PURPOSE_PATTERN
        )
    return turns


def single_topic_group(group_index: int, theme: str) -> dict[str, Any]:
    turns: list[dict[str, Any]] = []
    counters: dict[str, int] = {}
    for index in range(GROUP_SIZE):
        if index == 4:
            turns.append(
                turn(
                    "回到第一个问题，换一种说法？",
                    theme,
                    "older_turn_reference",
                    context_assert={"target_turn": 1, "relation": "rephrase_or_continue"},
                )
            )
        elif index == 8:
            turns.append(
                turn(
                    "刚才最近一个问题的边界在哪里？",
                    theme,
                    "older_turn_boundary",
                    context_assert={"target_turn": 3, "relation": "boundary"},
                )
            )
        elif index == 12:
            turns.append(
                turn(
                    "把最近两个问题放在一起看，你会怎么反问？",
                    theme,
                    "cross_turn_reasoning",
                    context_assert={"target_turns": [1, 7], "relation": "compare"},
                )
            )
        elif index == 15:
            turns.append(
                turn(
                    "最后回到最近几句，哪一句最应该被记住？",
                    theme,
                    "window_summary",
                    context_assert={"target_range": [1, 16], "relation": "summarize"},
                )
            )
        else:
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "same_topic_continuity"))
    return {
        "id": f"context_{group_index:03d}",
        "mode": "single_topic",
        "themes": [theme],
        "theme_labels": [THEME_BANK[theme]["label"]],
        "turns": enforce_recent_context(turns),
    }


def bridge_group(group_index: int, left: str, right: str) -> dict[str, Any]:
    turns: list[dict[str, Any]] = []
    counters: dict[str, int] = {}
    for index in range(GROUP_SIZE):
        if index in {0, 1, 2, 3, 8, 9}:
            theme = left
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "topic_a"))
        elif index in {4, 5, 6, 7, 10, 11}:
            theme = right
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "topic_b"))
        elif index == 12:
            turns.append(
                turn(
                    f"回到最近关于{THEME_BANK[left]['label']}的问题，它和刚才的{THEME_BANK[right]['label']}有什么关系？",
                    f"{left}+{right}",
                    "bridge_reasoning",
                    context_assert={"target_turns": [1, 8], "relation": "bridge"},
                )
            )
        elif index == 13:
            turns.append(
                turn(
                    "刚才我是不是换了主题？换在哪里？",
                    f"{left}+{right}",
                    "topic_shift_detection",
                    context_assert={"target_range": [1, 14], "relation": "detect_shift"},
                )
            )
        elif index == 14:
            turns.append(
                turn(
                    "如果只保留一个问题继续，你选前半段还是后半段？",
                    f"{left}+{right}",
                    "context_choice",
                    context_assert={"target_range": [1, 15], "relation": "choose_direction"},
                )
            )
        else:
            turns.append(
                turn(
                    "最后把两个主题压成一句反问。",
                    f"{left}+{right}",
                    "compact_bridge",
                    context_assert={"target_range": [1, 16], "relation": "compress"},
                )
            )
    return {
        "id": f"context_{group_index:03d}",
        "mode": "adjacent_bridge",
        "themes": [left, right],
        "theme_labels": [THEME_BANK[left]["label"], THEME_BANK[right]["label"]],
        "turns": enforce_recent_context(turns),
    }


def hard_mixed_group(group_index: int, themes: tuple[str, str, str, str]) -> dict[str, Any]:
    turns: list[dict[str, Any]] = []
    counters: dict[str, int] = {}
    for index in range(GROUP_SIZE):
        if index == 4:
            turns.append(
                turn(
                    "突然回到第一句，它现在还成立吗？",
                    "+".join(themes),
                    "hard_older_turn_reference",
                    context_assert={"target_turn": 1, "relation": "validate_after_shift"},
                )
            )
        elif index == 7:
            turns.append(
                turn(
                    f"把最近的{THEME_BANK[themes[0]]['label']}和{THEME_BANK[themes[2]]['label']}放在一起，问题变了吗？",
                    "+".join(themes),
                    "hard_cross_topic_compare",
                    context_assert={"target_turns": [1, 6], "relation": "cross_topic_compare"},
                )
            )
        elif index == 10:
            turns.append(
                turn(
                    "如果我现在说“继续”，你应该继续哪一个主题？",
                    "+".join(themes),
                    "ambiguous_continue",
                    context_assert={"target_range": [1, 10], "relation": "ask_direction"},
                )
            )
        elif index == 13:
            turns.append(
                turn(
                    "刚才哪个问题最像事实问题，哪个最像关系问题？",
                    "+".join(themes),
                    "fact_relation_split",
                    context_assert={"target_range": [1, 13], "relation": "classify_context"},
                )
            )
        elif index == 15:
            turns.append(
                turn(
                    "最后回到最不相干的两个主题，把它们连成一句话。",
                    "+".join(themes),
                    "distant_topic_synthesis",
                    context_assert={"target_range": [1, 16], "relation": "synthesize_distant_topics"},
                )
            )
        else:
            theme = themes[index % len(themes)]
            turns.append(turn(pick_counted(theme, counters, group_index * 3), theme, "hard_topic_shift"))
    return {
        "id": f"context_{group_index:03d}",
        "mode": "hard_mixed",
        "themes": list(themes),
        "theme_labels": [THEME_BANK[theme]["label"] for theme in themes],
        "turns": enforce_recent_context(turns),
    }


def soft_multi_insert_group(group_index: int, themes: tuple[str, str, str, str]) -> dict[str, Any]:
    turns: list[dict[str, Any]] = []
    counters: dict[str, int] = {}
    for index in range(GROUP_SIZE):
        if index in {0, 1, 2, 3}:
            theme = themes[0]
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "primary_topic"))
        elif index == 4:
            theme = themes[1]
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "near_topic_insert"))
        elif index == 5:
            turns.append(
                turn(
                    f"刚才从{THEME_BANK[themes[0]]['label']}转到{THEME_BANK[themes[1]]['label']}，是自然过渡吗？",
                    "+".join(themes),
                    "soft_shift_detection",
                    context_assert={"target_turns": [1, 5], "relation": "near_shift"},
                )
            )
        elif index in {6, 7}:
            theme = themes[1]
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "near_topic_continue"))
        elif index == 8:
            theme = themes[2]
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "third_topic_insert"))
        elif index == 9:
            turns.append(
                turn(
                    "回到最近一个问题，第三个主题有没有改变它？",
                    "+".join(themes),
                    "older_turn_after_insert",
                    context_assert={"target_turns": [1, 9], "relation": "reconsider_after_insert"},
                )
            )
        elif index in {10, 11}:
            theme = themes[2]
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "third_topic_continue"))
        elif index == 12:
            theme = themes[3]
            turns.append(turn(pick_counted(theme, counters, group_index), theme, "fourth_topic_insert"))
        elif index == 13:
            turns.append(
                turn(
                    "现在已经超过三个主题了，你先抓哪条线？",
                    "+".join(themes),
                    "multi_topic_priority",
                    context_assert={"target_range": [1, 14], "relation": "choose_thread"},
                )
            )
        elif index == 14:
            turns.append(
                turn(
                    "如果我说继续，你应该继续最近的主题，还是回到最早的主题？",
                    "+".join(themes),
                    "ambiguous_continue",
                    context_assert={"target_range": [1, 15], "relation": "ask_direction"},
                )
            )
        else:
            turns.append(
                turn(
                    "把这四个主题压成一个问题。",
                    "+".join(themes),
                    "soft_multi_summary",
                    context_assert={"target_range": [1, 16], "relation": "synthesize_related_topics"},
                )
            )
    return {
        "id": f"context_{group_index:03d}",
        "mode": "soft_multi_insert",
        "themes": list(themes),
        "theme_labels": [THEME_BANK[theme]["label"] for theme in themes],
        "turns": enforce_recent_context(turns),
    }


def build_groups() -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for index, theme in enumerate(SINGLE_TOPICS, start=1):
        groups.append(single_topic_group(index, theme))

    group_index = 21
    while group_index <= 59:
        left, right = ADJACENT_PAIRS[(group_index - 21) % len(ADJACENT_PAIRS)]
        groups.append(bridge_group(group_index, left, right))
        group_index += 1

    while group_index <= 80:
        themes = SOFT_MULTI_INSERTS[(group_index - 60) % len(SOFT_MULTI_INSERTS)]
        groups.append(soft_multi_insert_group(group_index, themes))
        group_index += 1

    while group_index <= GROUP_COUNT:
        themes = HARD_MIXES[(group_index - 81) % len(HARD_MIXES)]
        groups.append(hard_mixed_group(group_index, themes))
        group_index += 1

    return groups


def main() -> int:
    parser = argparse.ArgumentParser(description="Build 100x16 context stress cases.")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    groups = build_groups()
    payload = {
        "schema_version": 1,
        "description": (
            "100 mixed context stress groups. Groups 1-20 are single-topic; "
            "21-59 bridge adjacent themes; 60-80 insert more than three related themes; "
            "81-100 hard-insert distant themes. Every turn after the first is "
            "asserted against the hidden rolling twelve-turn reasoning window; "
            "the UI-visible window remains four turns."
        ),
        "visible_context_window": VISIBLE_CONTEXT_WINDOW,
        "reasoning_context_window": REASONING_CONTEXT_WINDOW,
        "group_count": GROUP_COUNT,
        "turns_per_group": GROUP_SIZE,
        "total_questions": GROUP_COUNT * GROUP_SIZE,
        "groups": groups,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "out": str(out.relative_to(ROOT) if out.is_relative_to(ROOT) else out),
                "groups": len(groups),
                "questions": sum(len(group["turns"]) for group in groups),
                "single_topic_groups": sum(1 for group in groups if group["mode"] == "single_topic"),
                "adjacent_bridge_groups": sum(1 for group in groups if group["mode"] == "adjacent_bridge"),
                "soft_multi_insert_groups": sum(1 for group in groups if group["mode"] == "soft_multi_insert"),
                "hard_mixed_groups": sum(1 for group in groups if group["mode"] == "hard_mixed"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
