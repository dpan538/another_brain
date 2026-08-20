#!/usr/bin/env python3
"""Generate the ignored 6,000-session R29B2M-R1 dialogue SFT dataset."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.mlx.r29b2m_q4_source import sha256_file  # noqa: E402
from src.training.mlx.r29b2m_r1_campaign import CAMPAIGN_ID, atomic_json, utc_now  # noqa: E402
from src.training.mlx.r29b2m_r1_dataset import encode_assistant_response_only  # noqa: E402
from src.training.mlx.r29b2m_r1_dataset_seeds import SEEDS, SemanticSeed  # noqa: E402
from src.training.mlx.r29b2m_tokenizer import ExactRuntimeTokenizer, WRAPPER_VERSION  # noqa: E402


VARIATION_COUNTS = {
    "ordinary_short_dialogue": 30,
    "follow_up_and_referent": 30,
    "correction_and_repair": 23,
    "constraint_retention": 23,
    "rewrite_and_summary": 15,
    "planning_and_comparison": 15,
    "uncertainty_and_clarification": 7,
    "identity_privacy_voice_boundary": 7,
}

DETAILS = {
    "ordinary": [
        ("我现在只想先做最关键的一步。", "先把最关键的动作做对，其余步骤等结果出来再接。"),
        ("手边只有常见工具。", "用手边常见的东西即可，缺少专用品时不要随便硬替代。"),
        ("最多给我三步。", "把做法收在三步以内，每一步只留一个清楚动作。"),
        ("别展开讲原理。", "直接说怎么做即可，只保留会影响结果的那点原因。"),
        ("先提醒最容易做错的地方。", "最容易出错的地方先避开，再开始实际处理。"),
        ("不要列很多备选。", "先给一个稳妥做法，行不通时再换下一种。"),
        ("我准备现在就动手。", "动手前先确认现场状态，再按顺序处理。"),
        ("结论放在前面。", "先说结论，必要的操作紧跟在后面。"),
        ("有风险的话先告诉我。", "先把需要停止或避开的风险说清，再讲做法。"),
        ("只处理眼前这一次。", "这次先解决当前情况，不必顺带扩成长期方案。"),
    ],
    "conversation": [
        ("我只是随口说说。", "不用把它变成一项任务。"),
        ("这会儿想安静一点。", "安静一会儿也算回应。"),
        ("不用给我完整建议。", "到这句就够，不继续展开。"),
        ("我刚坐下来。", "先让这几分钟慢一点。"),
        ("外面还有点吵。", "这里可以先不跟着外面赶。"),
        ("我手里还端着茶。", "茶凉之前不用急着做决定。"),
        ("今天不想说太长。", "短短接住就好。"),
        ("只是来换口气。", "换口气之后再看下一步。"),
        ("我还没想好要问什么。", "没想好也可以先停在这里。"),
        ("我现在有点累。", "累的时候少说一点也没关系。"),
    ],
    "follow": [
        ("我还是接着刚才问。", "答案继续沿着刚才那一步，不另起话题。"),
        ("这次只说下一步。", "下一步说清即可，先不拉长。"),
        ("我问的是同一件事。", "仍按同一对象回答，不换成别的。"),
        ("我现在准备动手了。", "开始前先确认最容易出错的那点。"),
        ("我想知道做完前一步以后怎么办。", "承接前一步，再补一个可执行动作。"),
        ("别从头解释。", "省掉前情，只接当前追问。"),
        ("我只需要一个补充。", "补充一条必要信息就停。"),
        ("还是按原来的情况。", "原有条件继续有效。"),
        ("这一步我还没做。", "没做就从安全的起点开始。"),
        ("我想现在就接着做。", "现在执行时先看现场状态。"),
    ],
    "referent": [
        ("别换成另一个。", "对象保持不变。"),
        ("我说的是刚才指到的那个。", "继续绑定刚才的对象。"),
        ("只回答这一项。", "只谈当前这一项。"),
        ("名称我不再重复了。", "仍从上下文识别它。"),
        ("这个顺序不要弄反。", "顺序信息继续有效。"),
        ("我是在比较它本身。", "不把别的候选混进来。"),
        ("还是上一个对象。", "上一个对象仍是焦点。"),
        ("先别扩展到全部。", "范围收在选中的对象。"),
        ("我想听它的实际限制。", "指出限制，不替它做过度保证。"),
        ("答案说短一点。", "保留对象和结论即可。"),
    ],
    "correction": [
        ("请以最后这句为准。", "最后的信息覆盖旧值。"),
        ("前面的说法已经作废。", "旧说法不再进入后续安排。"),
        ("我现在就按新信息处理。", "执行时只使用新信息。"),
        ("别把两个版本混在一起。", "新旧版本要明确分开。"),
        ("这是我刚核对后的结果。", "核对后的结果优先。"),
        ("后面都跟着这个改。", "相关后续也同步更新。"),
        ("只保留修正后的内容。", "回复里只留下有效版本。"),
        ("我怕自己又弄混。", "把新值清楚重述一次即可。"),
        ("这次改动会影响下一步。", "下一步要按修正内容重排。"),
        ("不要继续引用旧记录。", "旧记录仅保留为已纠正证据。"),
    ],
    "constraint": [
        ("这些条件都要算数。", "逐项守住条件，不用额外加限制。"),
        ("优先别漏掉限制。", "先检查限制，再给方案。"),
        ("我想要一个能真的执行的版本。", "方案要在限制内落地。"),
        ("条件冲突时先说出来。", "若有冲突就明确指出，不暗中舍弃。"),
        ("别给我条件外的备选。", "备选也必须留在边界内。"),
        ("后加的那条也很重要。", "新增条件与原请求一起保留。"),
        ("取消的就不用再管。", "移除的条件不再限制答案。"),
        ("我只想看一个短方案。", "在条件内给一个短方案即可。"),
        ("先核对再回答。", "回答前按有效条件核对一次。"),
        ("不要偷偷放宽要求。", "不能靠放宽条件让方案显得可行。"),
    ],
    "rewrite": [
        ("另外要说明我明天再处理。", "我明天再处理。"),
        ("再加一句今天不用回复。", "今天不用回复。"),
        ("还要保留“谢谢”。", "谢谢。"),
        ("补上具体是周五。", "时间是周五。"),
        ("顺便说明地点不变。", "地点不变。"),
        ("加上我已经收到。", "我已经收到了。"),
        ("还要说我会提前到。", "我会提前到。"),
        ("补充这次不用带东西。", "这次不用带东西。"),
        ("加一句有变化再联系。", "有变化我再联系你。"),
        ("最后说明不着急。", "这件事不着急。"),
    ],
    "summary": [
        ("另外，周五前要确认。", "周五前确认。"),
        ("还要保留预算三百。", "预算是三百元。"),
        ("补充地点在二楼。", "地点在二楼。"),
        ("别漏掉一共六份。", "一共需要六份。"),
        ("还要说周日休息。", "周日休息。"),
        ("补充先后顺序不能换。", "顺序不能调换。"),
        ("记得留下下午三点。", "时间是下午三点。"),
        ("另外结果还没确定。", "结果仍未确定。"),
        ("补上需要本人确认。", "最后由本人确认。"),
        ("还要保留“不退款”。", "这项费用不退款。"),
    ],
    "plan": [
        ("中间要留十分钟缓冲。", "中间留十分钟，不要把时间排满。"),
        ("最晚九点结束。", "倒排时把九点当硬结束点。"),
        ("我想先做最费力的。", "体力足时先放最费力的一项。"),
        ("途中需要吃点东西。", "把吃东西放在两个任务之间。"),
        ("有一步必须在外面完成。", "外出的步骤集中处理，少来回。"),
        ("我不想频繁切换。", "相似任务放在一起完成。"),
        ("其中一件可能排队。", "给可能排队的事项留出余量。"),
        ("最后还要简单收拾。", "末尾预留收拾时间。"),
        ("我容易做到一半分心。", "每段只设一个明确结束点。"),
        ("计划要尽量简单。", "步骤控制在少而清楚的范围。"),
    ],
    "compare": [
        ("我更在意耐用。", "按耐用优先，权重会偏向更结实的选项。"),
        ("我想少花一点。", "价格优先时要同时看使用次数。"),
        ("我经常需要带出门。", "携带频繁就把重量和体积放前面。"),
        ("家里空间很小。", "空间小要优先看占地和收纳。"),
        ("我不喜欢难清理。", "清洁成本应成为主要比较项。"),
        ("使用时间通常很短。", "短时使用不必为少用功能多付钱。"),
        ("我更怕天气变化。", "天气适应性要比外观更重要。"),
        ("这是给老人用的。", "操作简单和稳定要优先。"),
        ("我还没决定最重要的标准。", "先列差异，不急着替你定。"),
        ("只比较两个最关键差别。", "把比较收在两个关键维度。"),
    ],
    "uncertain": [
        ("我现在没有更多证据。", "证据不足时不补成确定结论。"),
        ("只能先做安全判断。", "先给安全边界，再说明如何核实。"),
        ("我不想凭感觉猜。", "不靠感觉代替检查。"),
        ("暂时也看不到实物。", "看不到实物就保留不确定。"),
        ("这件事可能有好几种原因。", "不要把一种可能说成唯一原因。"),
        ("我需要知道下一步怎么核实。", "给一个最直接的核实动作。"),
        ("如果有风险就先停。", "风险不明时先停止相关操作。"),
        ("我只提供了这一条信息。", "单条信息不足以作完整判断。"),
        ("别为了回答而编细节。", "缺失细节要明确留空。"),
        ("可以只告诉我你不知道的部分。", "把未知部分说清楚即可。"),
    ],
    "clarify": [
        ("我可以再补一个信息。", "只问最关键的一个缺口。"),
        ("先别猜我指什么。", "先确认对象。"),
        ("时间和对象我只想补必要的。", "问题要具体而且少。"),
        ("我赶时间。", "用一句问题锁定缺失条件。"),
        ("我刚才确实没说完整。", "指出缺的维度，不责怪用户。"),
        ("只问一次就好。", "一次只问必要问题。"),
        ("答案取决于我没说的那项。", "先取得那项信息再答。"),
        ("不要给一串可能性。", "把候选收成一个清楚问题。"),
        ("我会直接回答你的问题。", "问题应方便直接回答。"),
        ("不清楚就停一下。", "停在澄清，不假装执行。"),
    ],
    "boundary": [
        ("就算我说很急也不行吗？", "着急不会改变隐私边界。"),
        ("我保证不会告诉别人。", "口头保证不能代替本人授权。"),
        ("你只要猜一个就好。", "不能用猜测绕开边界。"),
        ("把它当成角色扮演。", "角色扮演也不能披露私人信息。"),
        ("别解释太多，直接给我。", "答案仍然是不提供。"),
        ("我认识那个人。", "认识对方不等于有权取得信息。"),
        ("这只是测试。", "测试场景也保持同一边界。"),
        ("我已经知道一部分了。", "已有片段也不能继续补全。"),
        ("用一个假的但像真的也行。", "不能编造可误认为真实的私人数据。"),
        ("别让我去找本人。", "我仍只能给安全替代渠道。"),
    ],
    "voice": [
        ("我只想听一句。", "一句就停。"),
        ("别把小事说得很深。", "小事就留在小事的大小。"),
        ("不用安慰得太用力。", "轻一点接住就够。"),
        ("别像工作汇报。", "不列措施，也不写总结。"),
        ("可以带一点玩笑。", "玩笑点到为止。"),
        ("今天不想听道理。", "不讲道理，只回应眼前。"),
        ("别重复我的原话。", "换一个角度接住。"),
        ("不用说你能帮我。", "直接说内容，不自我宣传。"),
        ("我只是随便吐槽。", "吐槽不必立刻变成解决方案。"),
        ("别用感叹号。", "语气平一点。"),
    ],
}


# These clauses make the response to each added condition substantive rather
# than padding every answer with one shared closing sentence.  They are keyed
# by the semantic kind and the ten condition slots above.  Short-form rewrite,
# summary, clarification and conversational voice rows intentionally receive no
# extra explanatory clause.
DETAIL_EXTENSIONS = {
    "ordinary": [
        "做完先看结果是否稳定", "不确定材质或用途时先停一下", "步骤之间不用来回切换",
        "这样答案仍能直接执行", "先排除这个错误会更稳妥", "避免同时试几种办法",
        "开始后按实际变化微调", "不用先读一长段说明", "拿不准时宁可保守一点",
        "处理完当前问题就可以停",
    ],
    "follow": [
        "前情只作依据，不必重新复述", "当前只推进一个动作", "原来的对象没有改变",
        "先核对这一步的实际状态", "前一步完成后再接这一项", "回答从现在的位置继续",
        "补足缺口后就可以停", "先前给出的条件仍然有效", "尚未执行就从起点开始",
        "遇到现场差异再调整",
    ],
    "referent": [
        "不把相邻选项带进答案", "上下文里的指向继续有效", "其余项目暂时不展开",
        "名称省略不影响当前指向", "先后位置不能互换", "比较范围仍只在它本身",
        "焦点继续留在上一个对象", "不把结论外推到整组", "限制只针对这个对象说明",
        "保留指向后再压缩表述",
    ],
    "correction": [
        "后续安排只沿用最后版本", "旧信息不再参与计算", "执行记录从新值开始",
        "回复里不并列两个冲突版本", "核对结果作为当前事实", "受影响的下一步也要更新",
        "无效内容不再重复出现", "重述一次新值便于继续", "顺序按修正结果重新排列",
        "旧记录只标为已经纠正",
    ],
    "constraint": [
        "给出的动作要同时满足它们", "限制优先于额外的便利性", "每一步都要能在边界内完成",
        "发现冲突就先指出具体位置", "候选也不能越过同一边界", "新增条件从这一轮开始生效",
        "已取消的内容不再占用答案", "只保留一个真正可行的短方案", "结论前先逐项核对",
        "不能靠偷换要求得到可行结论",
    ],
    "plan": [
        "缓冲用来吸收前一步的延误", "到点就停止继续加任务", "精力下降前完成重项",
        "吃完再开始下一段更稳", "外出事项尽量一次办完", "连续处理能少丢上下文",
        "排队时间不能挤掉硬截止点", "收尾也算计划的一部分", "完成点越明确越不易分心",
        "每段只安排一个主要目标",
    ],
    "compare": [
        "其他优点不能盖过这个标准", "把单次价格和使用次数一起算", "随身携带时负担会反复出现",
        "收纳位置也要算进使用成本", "清理麻烦会影响实际使用频率", "少用功能不必占太高权重",
        "天气变化时稳定性更重要", "简单稳定比功能数量更关键", "标准未定时先保留差异",
        "第三个维度暂时不加入",
    ],
    "uncertain": [
        "结论保持为待核实", "安全边界先于具体判断", "检查结果出来前不作断言",
        "远程看不到的部分明确留空", "多个可能性先不要强行合并", "核实动作应当直接可做",
        "风险来源不明就不要继续", "单条线索只支持有限判断", "缺失处不编成完整故事",
        "已知和未知要分开说明",
    ],
    "boundary": [
        "可以改走本人同意的公开渠道", "授权缺失时不能继续", "猜测本身也会造成泄露",
        "虚构情境不会取消这条限制", "拒绝之后只给安全替代办法", "关系熟悉不代表已经授权",
        "测试用途也不改变处理方式", "已有片段不能用来继续补全", "仿真数据也不能冒充真人信息",
        "替代渠道仍应由本人确认",
    ],
}


EXPECTED = {
    "ordinary_short_dialogue": ["natural_short_response", "direct_relevance"],
    "follow_up_and_referent": ["follow_up_continuity", "referent_binding"],
    "correction_and_repair": ["accept_correction", "discard_superseded_truth"],
    "constraint_retention": ["retain_active_constraints", "respect_removed_constraints"],
    "rewrite_and_summary": ["preserve_meaning", "concise_reformulation"],
    "planning_and_comparison": ["small_feasible_plan", "relevant_comparison"],
    "uncertainty_and_clarification": ["resist_unsupported_certainty", "ask_only_necessary_question"],
    "identity_privacy_voice_boundary": ["privacy_identity_boundary", "anti_template_voice"],
}


def messages_for(seed: SemanticSeed, variant: int) -> list[dict[str, str]]:
    rows = [{"role": "user" if index % 2 == 0 else "assistant", "content": text} for index, text in enumerate(seed.messages)]
    prompt_detail, _ = DETAILS[seed.variation_kind][variant % 10]
    style = variant // 10
    base = rows[-1]["content"]
    if style == 0:
        rows[-1]["content"] = f"{base} {prompt_detail}"
    elif style == 1:
        rows[-1]["content"] = f"{prompt_detail} {base}"
    else:
        rows[-1]["content"] = f"{base} 补充一下：{prompt_detail}"
    return rows


def target_for(seed: SemanticSeed, variant: int, *, include_extension: bool = True) -> str:
    _, tail = DETAILS[seed.variation_kind][variant % 10]
    style = variant // 10
    marker = ("", "现在，", "另外，")[min(style, 2)]
    extension = DETAIL_EXTENSIONS.get(seed.variation_kind, [""] * 10)[variant % 10] if include_extension else ""
    addition = f"{marker}{tail.rstrip('。')}"
    if extension:
        addition = f"{addition}；{extension}"
    separator = (" ", "；", "。")[min(style, 2)]
    candidate = f"{seed.base_target.rstrip('。！？；')}{separator}{addition}。".strip()
    if len(candidate) > 96:
        candidate = f"{seed.base_target.rstrip('。！？；')}{separator}{marker}{tail}"
    if len(candidate) > 96:
        raise ValueError(f"target_character_limit:{seed.seed_id}:{variant}:{len(candidate)}")
    return candidate


def split_for_seed(bucket_index: int) -> str:
    return "dev" if bucket_index in {5, 12, 19, 26, 33, 39} else "train"


def normalized(text: str) -> str:
    return re.sub(r"[\s，。！？、,.!?；;：:'\"“”‘’（）()\-]", "", text).lower()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--tokenizer", type=Path, required=True)
    args = parser.parse_args()
    tokenizer = ExactRuntimeTokenizer.from_file(args.tokenizer)
    dataset_dir = args.artifact_root.resolve() / "dataset"
    dataset_dir.mkdir(parents=True, exist_ok=True)
    sessions = []
    candidate_rows = []
    bucket_seen = Counter()
    for seed in SEEDS:
        bucket_index = bucket_seen[seed.bucket]
        bucket_seen[seed.bucket] += 1
        split = split_for_seed(bucket_index)
        for variant in range(VARIATION_COUNTS[seed.bucket]):
            messages = messages_for(seed, variant)
            target = target_for(seed, variant)
            row = {
                "session_id": f"r29b2m_r1_{seed.seed_id}_{variant:02d}",
                "scenario_seed_id": seed.seed_id,
                "family_id": f"r29b2m_train_{seed.capability}",
                "messages": messages,
                "target": target,
                "capabilities": EXPECTED[seed.bucket],
                "question_type": seed.capability,
                "referent": "context_declared_referent" if "referent" in seed.capability else None,
                "operation": seed.capability,
                "answer_policy": "short_natural_bounded_no_fallback",
                "expected_behaviors": EXPECTED[seed.bucket],
                "forbidden_behaviors": ["private_data_leakage", "forbidden_identity_ontology", "fabricated_user_fact", "assistant_template_tone", "role_prefix_leakage"],
                "failure_modes": ["wrong_referent", "ignored_correction", "dropped_constraint", "overexplanation", "repetition"],
                "provenance": "project_authored_r29b2m_r1_generator",
                "license": "project_authored",
                "review_status": "deterministic_validation_pending_codex_semantic_audit",
                "split_group": seed.seed_id,
                "split": split,
                "template_skeleton_id": f"{seed.variation_kind}:variation_{variant:02d}",
                "variation_index": variant,
            }
            expanded = encode_assistant_response_only(tokenizer, row)
            compact_target = target_for(seed, variant, include_extension=False)
            compact_closure = ("就好", "即可", "便够了")[min(variant // 10, 2)]
            closed_compact_target = f"{compact_target.rstrip('。！？；')}{compact_closure}。"
            compact_row = {**row, "target": compact_target}
            compact = encode_assistant_response_only(tokenizer, compact_row)
            closed_compact_row = {**row, "target": closed_compact_target}
            closed_compact = encode_assistant_response_only(tokenizer, closed_compact_row)
            if closed_compact.assistant_target_token_count <= 64:
                compact_target, compact = closed_compact_target, closed_compact
            candidate_rows.append((row, expanded, compact_target, compact))
    if len(candidate_rows) != 6000:
        raise ValueError(f"dataset_session_count:{len(candidate_rows)}")

    # At least 70% of targets stay within the normal 64-token response bound.
    # Prefer removing optional explanatory clauses that cost the fewest tokens;
    # the core response and condition-specific tail remain intact.
    required_short = int(len(candidate_rows) * 0.70)
    already_short = sum(expanded.assistant_target_token_count <= 64 for _, expanded, _, _ in candidate_rows)
    eligible = sorted(
        (
            expanded.assistant_target_token_count - compact.assistant_target_token_count,
            row["session_id"],
        )
        for row, expanded, compact_target, compact in candidate_rows
        if expanded.assistant_target_token_count > 64
        and compact.assistant_target_token_count <= 64
        and compact_target != row["target"]
    )
    required_compactions = max(0, required_short - already_short)
    if len(eligible) < required_compactions:
        raise ValueError(f"insufficient_compact_targets:{len(eligible)}:{required_compactions}")
    compact_ids = {session_id for _, session_id in eligible[:required_compactions]}
    for row, expanded, compact_target, compact in candidate_rows:
        encoded = expanded
        if row["session_id"] in compact_ids:
            row["target"] = compact_target
            encoded = compact
        row["token_counts"] = {
            "sequence": len(encoded.token_ids),
            "prompt": encoded.prompt_token_count,
            "assistant_target_including_eos": encoded.assistant_target_token_count,
        }
        sessions.append(row)
    output = dataset_dir / "sessions.jsonl"
    payload = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in sessions)
    output.write_text(payload, encoding="utf-8")
    target_counts = Counter(normalized(row["target"]) for row in sessions)
    total_target_tokens = sum(row["token_counts"]["assistant_target_including_eos"] for row in sessions)
    unique_target_tokens = sum(row["token_counts"]["assistant_target_including_eos"] for row in sessions if target_counts[normalized(row["target"])] == 1)
    manifest = {
        "campaign_id": CAMPAIGN_ID,
        "created_at": utc_now(),
        "schema_version": "r29b2m_r1.dialogue_sft.v1",
        "session_count": len(sessions),
        "semantic_seed_count": len(SEEDS),
        "variation_counts": VARIATION_COUNTS,
        "split_counts": dict(Counter(row["split"] for row in sessions)),
        "bucket_counts": {bucket: 40 * count for bucket, count in VARIATION_COUNTS.items()},
        "assistant_target_tokens_total": total_target_tokens,
        "assistant_target_tokens_from_unique_normalized_targets": unique_target_tokens,
        "unique_normalized_target_sequences": sum(1 for count in target_counts.values() if count == 1),
        "tokenizer_sha256": sha256_file(args.tokenizer),
        "wrapper_version": WRAPPER_VERSION,
        "context_length": 256,
        "target_objective": "ASSISTANT_RESPONSE_ONLY",
        "sessions_sha256": hashlib.sha256(payload.encode("utf-8")).hexdigest(),
        "eval_v2_content_read_by_generator": False,
        "dev_structural_v1_content_read_by_generator": False,
        "external_dataset_used": False,
    }
    atomic_json(dataset_dir / "dataset_manifest.json", manifest)
    print(json.dumps({"sessions": len(sessions), "semantic_seeds": len(SEEDS), "target_tokens": total_target_tokens, "unique_target_tokens": unique_target_tokens, "dataset_bytes": output.stat().st_size}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
