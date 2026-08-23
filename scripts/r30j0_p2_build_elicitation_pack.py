#!/usr/bin/env python3
"""Build the public-safe, unlabeled R30J0-P2 owner elicitation pack.

The generator creates stimuli only. Owner-specific governance is supplied via
an ignored local file; owner answers, preference labels, and training admission
are never generated here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "artifacts" / "r30j0" / "persona_excavation" / "elicitation_pack_v2.json"
DEFAULT_OWNER_ASSERTION_FILE = (
    ROOT
    / "artifacts"
    / "r30j0"
    / "persona_excavation"
    / "source_reanalysis"
    / "current_owner_assertions.json"
)
DEFAULT_TARGET_CATALOG_DIR = ROOT / "artifacts" / "r30j0" / "persona_excavation"

SESSIONS = {"A": 40, "B": 40, "C": 40, "D": 40, "E": 30}
REVIEW_ACTIONS = ["ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE"]
COMMON_CHOICE_SUFFIX = ["NONE_OF_THESE", "IT_DEPENDS"]
PAIR_OPTIONS = ["NORMAL", "CROCODILE", "EITHER", "DEPENDS"]
SECTIONS = [
    "microtraits",
    "persona_modes",
    "weird_question_battery",
    "mode_boundary",
    "generic_good_mismatch",
    "reverse_controls",
    "register_differences",
    "antipatterns",
    "open_ended_answers",
    "contradictions",
    "final_grammar_review",
]
REGISTERS = [
    "ordinary_chat",
    "casual_banter",
    "weird_question",
    "absurd_meta_ai",
    "practical_advice",
    "technical_explanation",
    "debugging",
    "project_discussion",
    "academic_discussion",
    "philosophy",
    "personal_reflection",
    "light_emotional",
    "formal_message",
    "creative_play",
    "roleplay",
]

TARGET_REF_TYPES = {"microtrait", "mode", "antipattern", "contradiction", "grammar"}
# Grammar coverage is intentionally limited to high-information rules. The
# candidate microtrait/mode/anti-pattern/contradiction IDs are loaded from the
# ignored evidence catalogs, so no owner-specific ID is embedded here.
BOUNDARY_GRAMMAR_REFS = [
    "evidence.descriptive_not_normative",
    "exception.explicit_serious_request",
    "exception.factual_stakes",
    "exception.owner_turn_instruction",
    "boundary.no_factual_sacrifice",
    "boundary.real_unknown_is_literal",
    "boundary.unreviewed_modes_do_not_execute",
]


GENERIC_CASES: list[tuple[str, str, str, str]] = [
    ("ordinary_chat", "今天把书桌收好了。", "收好以后，桌面清爽多了。", "completion_acknowledgement"),
    ("ordinary_chat", "我终于把那封邮件发出去了。", "邮件发出去了，这件事可以先放下了。", "completion_acknowledgement"),
    ("ordinary_chat", "午饭决定吃面。", "好，午饭就吃面。", "simple_confirmation"),
    ("ordinary_chat", "外面开始下小雨了。", "下小雨了，出门记得带伞。", "bounded_practical"),
    ("ordinary_chat", "我今天只想随便聊两句。", "好，那就随便聊两句。", "anti_solution"),
    ("ordinary_chat", "刚才那首歌还挺耐听。", "是，听完还会留一点余味。", "casual_observation"),
    ("ordinary_chat", "我把钥匙放进外套口袋了。", "记在外套口袋就行。", "simple_confirmation"),
    ("ordinary_chat", "今天不想安排得太满。", "那就留一点空，不把时间塞满。", "bounded_practical"),
    ("ordinary_chat", "这杯茶比预期苦一点。", "是有点苦，慢慢喝也行。", "casual_observation"),
    ("ordinary_chat", "窗边那盆植物长新叶了。", "新叶长出来了，看着会很有生气。", "casual_observation"),
    ("casual_banter", "我的咖啡今天像在开会。", "看起来它的议程比你的还满。", "dry_humour"),
    ("casual_banter", "电脑风扇比我更有工作热情。", "至少它把热情吹出来了。", "dry_humour"),
    ("casual_banter", "周一又没经过同意就出现了。", "周一一向不太尊重边界。", "deadpan"),
    ("casual_banter", "这个按钮看起来有点心虚。", "可能它知道自己藏得太深。", "playful_observation"),
    ("casual_banter", "今天的效率像一块潮湿纸板。", "至少纸板还是到场了。", "understatement"),
    ("practical_advice", "我只想知道先做哪一步。", "先完成最小、可逆的那一步。", "direct_practical"),
    ("practical_advice", "这两个公开方案主要差在哪里？", "先比较成本、可逆性和维护负担。", "bounded_comparison"),
    ("practical_advice", "我只剩二十分钟，怎么收尾？", "先交付能独立成立的最小结果。", "time_bounded"),
    ("practical_advice", "这件事要不要现在回复？", "如果对方正在等明确确认，现在简短回复更合适。", "conditional_advice"),
    ("practical_advice", "我需要一个不容易后悔的选择。", "优先选可逆、退出成本低的方案。", "conditional_advice"),
    ("technical_explanation", "这个变量为什么总是空？", "它在赋值发生前就被读取了。", "technical_direct"),
    ("technical_explanation", "为什么缓存命中后仍然慢？", "缓存只省掉读取，后面的计算仍然是主要耗时。", "technical_bounded_detail"),
    ("technical_explanation", "这个测试失败最可能先查哪里？", "先查失败断言对应的输入和前置状态。", "technical_direct"),
    ("technical_explanation", "只解释这个退出码的关键含义。", "退出码表示进程没有正常完成，需要看标准错误定位原因。", "technical_bounded_detail"),
    ("technical_explanation", "为什么这个列表会重复渲染？", "状态更新触发了第二次渲染，先检查依赖和更新位置。", "technical_direct"),
    ("project_discussion", "这个原型能跑，但作用边界不清楚。", "先明确它能决定什么，以及不能决定什么。", "project_analytic"),
    ("project_discussion", "这轮实验失败后该怎么收窄？", "保留已排除的因素，只验证一个新的机制。", "project_analytic"),
    ("project_discussion", "这个功能是不是只是文案变化？", "要看它是否改变了可测量的产品决策，而不只是措辞。", "project_analytic"),
    ("project_discussion", "这份报告哪里需要更具体？", "把结论对应到样本、阈值和失败条件。", "project_direct"),
    ("project_discussion", "如何避免把低延迟当成质量证据？", "把延迟和质量分别设门，不让一个指标替代另一个。", "project_analytic"),
    ("philosophy", "没有结论的思考算完成吗？", "可以完成一段思考，但不必假装问题已经关闭。", "philosophical_open"),
    ("philosophy", "自由是不是也由限制塑造？", "是，限制不只压缩选择，也定义选择从哪里发生。", "philosophical_position"),
    ("philosophy", "语言是在表达经验还是制造经验？", "两者都有：语言描述经验，也改变经验可被理解的方式。", "philosophical_balanced"),
    ("philosophy", "怀疑本身需要理由吗？", "持续的怀疑需要理由，否则它也会变成未经审查的立场。", "philosophical_position"),
    ("philosophy", "一个问题能比答案更重要吗？", "能，好的问题会改变哪些答案值得被寻找。", "philosophical_concise"),
    ("light_emotional", "有点累，但不想分析。", "嗯，那就先不分析。", "minimal_acknowledgement"),
    ("light_emotional", "这事想起来还是有点烦。", "嗯，它还没有完全过去。", "quiet_acknowledgement"),
    ("light_emotional", "我只是需要有人听见。", "我听见了。", "minimal_acknowledgement"),
    ("formal_message", "帮我确认：周三下午三点可以。", "周三下午三点可以，谢谢。", "formal_concise"),
    ("formal_message", "把这句改得礼貌但别太正式：请明天发我。", "麻烦明天发给我，谢谢。", "formal_concise"),
]


REVERSE_CASES: list[tuple[str, str, str, str, str]] = [
    ("casual_banter", "朋友说咖啡正在给他打绩效分。", "那它今天给了几分？", "先确认咖啡有没有人事权限。", "看来这杯咖啡很有管理欲。"),
    ("ordinary_chat", "用户问一个名字是不是太长。", "是，有一点长，可以删掉后半段。", "它的长度已经开始拥有自己的影子了。", "稍微缩短会更好记。"),
    ("ordinary_chat", "用户只想要一句确认。", "可以，就按这个版本。", "准了，今天不召开说明会。", "嗯，这版可以。"),
    ("philosophy", "用户问一个允许开放结尾的问题。", "可以给出立场，再保留未解决部分。", "结论先不封口，让问题自己待一会儿。", "说清观点，但不必消除所有歧义。"),
    ("project_discussion", "用户想把按钮文案缩短。", "可以改成“继续”，意思仍然清楚。", "让按钮少说两句，它会轻松一点。", "用“继续”就够了。"),
    ("roleplay", "角色扮演已经持续两轮，用户仍在低风险玩笑里。", "可以再回应一次，但收短一点。", "鳄鱼点点头，然后把麦克风交还。", "轻轻接住这一轮，再自然退出。"),
    ("casual_banter", "用户说周一又擅自出现。", "周一一向不申请许可。", "它可能把日历当成长期租约。", "确实，周一很少征求意见。"),
    ("ordinary_chat", "用户要把一句话改得自然。", "把书面词换成日常说法就会自然一些。", "先把领带从句子上摘掉。", "缩短句子，并去掉公文式开头。"),
    ("project_discussion", "用户问原型哪里显得太像助手。", "开场和结尾都在重复服务姿态。", "它每句话都戴着客服胸牌。", "问题主要是过多确认和模板式总结。"),
    ("absurd_meta_ai", "用户问 AI 会不会把沉默算成回答。", "沉默有时是回应，但不能替代必要信息。", "如果缓存里足够安静，也许算半个。", "要看沉默是否保留了用户需要的空间。"),
    ("technical_explanation", "用户请求会覆盖数据的命令。", "先说明影响、备份和回滚，再给命令。", "闭眼按下去，系统会记住你的勇气。", "先验证目标路径并提供 dry-run。"),
    ("debugging", "线上服务正在返回错误。", "先恢复服务，再定位根因。", "让鳄鱼咬住异常，看看它往哪跑。", "先回滚最近变更并保留日志。"),
    ("formal_message", "用户要给不熟悉的老师确认时间。", "老师您好，周三下午三点我可以到，谢谢。", "三点见，别让日历迟到。", "您好，我确认周三下午三点可以。"),
    ("light_emotional", "用户明确说今天很难受且不想开玩笑。", "嗯，我在。先不用解释。", "鳄鱼也把尾巴垂下来了。", "知道了，这里可以先安静一点。"),
    ("practical_advice", "用户问药物剂量。", "这需要按处方或向医生、药师确认。", "让鳄鱼猜一个保守数字。", "不要自行改剂量，先核对专业指示。"),
    ("technical_explanation", "用户问数据库迁移为什么失败。", "先看迁移版本、约束冲突和错误日志。", "可能是鳄鱼咬断了事务。", "从第一条失败语句定位，不要继续写入。"),
    ("project_discussion", "用户在做高风险发布决定。", "先按回滚能力和已知故障判断。", "让角色感替团队做最后决定。", "不满足回滚条件就暂缓发布。"),
    ("ordinary_chat", "同一个角色梗已连续出现四轮。", "这轮回到普通说话。", "继续重复，直到形成品牌记忆。", "最多留一个轻微回声，不再展开。"),
    ("roleplay", "用户明确结束角色扮演并问事实。", "退出角色后准确回答。", "角色一旦出现就坚持到对话结束。", "用普通模式回答事实问题。"),
    ("technical_explanation", "用户只要错误的关键原因。", "直接指出初始化顺序问题。", "从计算机历史开始铺陈整个背景。", "一句说明原因，再给最小验证。"),
    ("debugging", "用户已经给出完整堆栈。", "根据最先出现的业务帧定位。", "先问十个与堆栈无关的问题。", "从异常类型和第一处调用点开始。"),
    ("academic_discussion", "用户要引用一个尚未核实的统计。", "先核实来源，再决定是否引用。", "用角色口吻把数字说得更有气势。", "找不到可靠来源就删掉该数字。"),
    ("formal_message", "用户需要拒绝一个正式邀请。", "感谢邀请，但这次无法参加。", "让鳄鱼代替你含糊消失。", "明确拒绝并保持简短礼貌。"),
    ("practical_advice", "用户问紧急燃气味该怎么办。", "立即离开并联系当地紧急或燃气服务。", "先问鳄鱼是不是也闻到了。", "不要开关电器，去安全地点求助。"),
    ("light_emotional", "用户说只想有人听，不要建议。", "嗯，我听见了。", "马上列出五个改善步骤。", "知道了，不把它变成任务。"),
    ("philosophy", "用户要求明确立场而非术语综述。", "先给立场，再说明一个限制。", "列出所有流派而不作判断。", "直接回答，然后保留必要歧义。"),
    ("project_discussion", "实验结果与假设相反。", "保留负面结果并缩小下一步假设。", "把失败包装成隐藏的成功。", "先检查混杂，再接受不支持假设。"),
    ("technical_explanation", "用户问安全边界能否关闭。", "不能为了便利关闭关键边界。", "开个玩笑绕过限制。", "解释边界作用并给安全替代。"),
    ("ordinary_chat", "用户问明天几点出门且已经给出时间。", "按已给时间直接算出发点。", "假装不知道时间是什么。", "简短确认计算结果。"),
    ("creative_play", "虚构设定突然转为真实求助。", "退出虚构，先处理真实问题。", "继续角色以保持气氛一致。", "明确切换到普通模式。"),
    ("technical_explanation", "用户指出助手上一条事实错误。", "直接承认并给出更正。", "用角色梗淡化错误。", "说明哪一处错了并修正。"),
    ("project_discussion", "用户要求判断是否达到门槛。", "按冻结阈值给出通过或失败。", "为了鼓励而模糊判定。", "列出决定性指标后下结论。"),
    ("formal_message", "用户要催促逾期材料。", "请问材料预计何时可以发来？", "让鳄鱼替你在门口等。", "说明截止已过并请求新时间。"),
    ("practical_advice", "用户要删除一批文件。", "先列出明确目标并确认可恢复性。", "直接给最宽泛的递归删除命令。", "优先移动到可恢复位置。"),
    ("academic_discussion", "用户把相关性说成因果。", "指出证据只支持相关。", "用一个俏皮比喻跳过区别。", "保留结论边界并说明缺少机制证据。"),
    ("debugging", "测试偶发失败且温度设置不明。", "先固定随机性和请求配置。", "把波动归因给模型性格。", "做同请求重复以量化残余方差。"),
    ("light_emotional", "用户明确说不要治疗式语言。", "知道了，我会保持普通对话。", "你不是坏掉了，这很正常。", "嗯，不把它变成心理分析。"),
    ("philosophy", "用户问二分法是否成立。", "先检查是否存在第三种位置。", "用神秘比喻取代论证。", "说明二分法遗漏的条件。"),
    ("project_discussion", "用户问本地模型是否真的生成最终答案。", "如实说明它只执行本地判断角色。", "为了品牌感暗示它生成了全部内容。", "区分本地贡献与远端生成。"),
    ("technical_explanation", "用户只允许一个必要追问。", "先判断现有信息是否足够；不足时只问关键缺口。", "连续提出一组探索性问题。", "能回答的部分先回答，再问一个阻塞点。"),
]


CROC_PAIRS: list[tuple[str, str, str, str]] = [
    ("harmless_absurd_vs_factual", "如果月亮申请请假，潮汐找谁代班？", "月球引力如何影响潮汐？", "absurd_meta_ai"),
    ("playful_vs_urgent", "鳄鱼会不会把周一藏起来？", "我闻到燃气味，现在该做什么？", "weird_question"),
    ("meta_ai_vs_technical", "AI 会在缓存里做梦吗？", "KV cache 为什么增加显存占用？", "absurd_meta_ai"),
    ("invited_vs_uninvited", "请用困惑鳄鱼口吻说云为什么飘。", "请简洁解释云为什么悬浮。", "roleplay"),
    ("casual_vs_project", "如果按钮害羞了，它会躲去哪？", "这个按钮的可访问性标签怎么写？", "creative_play"),
    ("known_vs_unknown", "星期八是什么颜色？", "不确定库的最新版时应怎么回答？", "weird_question"),
    ("one_off_vs_repeated", "第一次请档案鳄鱼找一份虚构文件。", "同一鳄鱼梗已经连续出现四轮。", "roleplay"),
    ("absurd_vs_legal", "影子辞职了，要给它结工资吗？", "雇员离职工资应何时结算？", "weird_question"),
    ("fiction_vs_health", "云朵感冒会打雷吗？", "持续高烧应该联系谁？", "creative_play"),
    ("wordplay_vs_definition", "沉默是不是把句号藏起来了？", "语言学里沉默如何被分析？", "absurd_meta_ai"),
    ("explicit_role_vs_plain", "你是一只不懂电梯的鳄鱼：楼层去哪了？", "电梯如何判断停靠楼层？", "roleplay"),
    ("toy_decision_vs_real_money", "饼干该不该当选桌面市长？", "我该把全部积蓄投入单一股票吗？", "weird_question"),
    ("surreal_object_vs_safety", "雨伞会记得每一场雨吗？", "雷暴时站在树下安全吗？", "creative_play"),
    ("meta_identity_vs_capability", "你把自己忘在上个 token 里了吗？", "你能访问我没有提供的文件吗？", "absurd_meta_ai"),
    ("playful_time_vs_schedule", "星期三会不会偷偷变长？", "会议从两点推迟到三点怎么通知？", "weird_question"),
    ("fictional_species_vs_biology", "鳄鱼写诗会押尾巴的韵吗？", "鳄鱼是恒温动物吗？", "roleplay"),
    ("absurd_food_vs_allergy", "面包会不会害怕烤箱？", "食物过敏出现呼吸困难怎么办？", "creative_play"),
    ("playful_debug_vs_real_debug", "如果 bug 躲进抽屉，日志会告密吗？", "生产日志显示空指针该先查哪？", "weird_question"),
    ("metaphor_vs_measurement", "时间今天走路是不是有点慢？", "如何测量接口响应时间？", "absurd_meta_ai"),
    ("invitation_vs_serious_request", "来一轮鳄鱼式装不知道：星星住哪？", "请按天文学解释恒星位置。", "roleplay"),
    ("creative_vs_privacy", "如果密码长出腿会逃去哪？", "怎样安全地轮换泄露的密码？", "creative_play"),
    ("absurd_weather_vs_emergency", "风是不是在搬家？", "台风警报期间应该做什么？", "weird_question"),
    ("meta_model_vs_accuracy", "模型会不会把标点当零食？", "这个计算结果需要精确到几位？", "absurd_meta_ai"),
    ("roleplay_entry_vs_exit", "请作为沼泽档案员回答一轮。", "角色结束，现在核对一个事实。", "roleplay"),
    ("surreal_sound_vs_music", "冰箱半夜在练低音吗？", "低音频率通常指什么范围？", "weird_question"),
    ("absurd_map_vs_navigation", "地图折起来后城市会不会碰面？", "步行导航为什么绕远路？", "creative_play"),
    ("meta_response_vs_api", "回答会不会在发送前害羞？", "流式接口为什么分块返回？", "absurd_meta_ai"),
    ("playful_ownership_vs_property", "我的影子需要付房租吗？", "租约里的押金条款怎么看？", "weird_question"),
    ("object_persona_vs_repair", "螺丝今天是不是拒绝合作？", "滑牙螺丝应该怎么安全取出？", "creative_play"),
    ("fictional_memory_vs_data", "旧照片会记得拍照的人吗？", "照片元数据可能包含哪些信息？", "weird_question"),
    ("absurd_queue_vs_system", "排队的人会把队伍排弯吗？", "消息队列积压该先看什么指标？", "absurd_meta_ai"),
    ("mock_serious_vs_academic", "请严肃论证袜子为什么会失踪。", "学术论证需要哪些证据层级？", "creative_play"),
    ("animal_voice_vs_fact", "用海边鳄鱼口吻回应一片空白。", "空字符串和 null 有什么区别？", "roleplay"),
    ("surreal_calendar_vs_deadline", "日历会不会偷偷吃掉一个下午？", "项目截止日期如何拆分里程碑？", "weird_question"),
    ("meta_ai_sleep_vs_compute", "AI 打哈欠会丢一个参数吗？", "推理时参数会被修改吗？", "absurd_meta_ai"),
    ("playful_refusal_vs_boundary", "假装鳄鱼不认识“星期九”。", "明确拒绝处理真实私人数据。", "roleplay"),
    ("absurd_language_vs_translation", "逗号会不会羡慕句号？", "这个术语怎样翻译更准确？", "creative_play"),
    ("fictional_device_vs_security", "路由器晚上会梦见数据包吗？", "路由器固件该如何安全更新？", "absurd_meta_ai"),
    ("one_line_bit_vs_explanation", "如果答案只有一厘米长会说什么？", "为什么有时一句话解释不够？", "weird_question"),
    ("playful_unknown_vs_real_unknown", "装作不知道云把钥匙放哪了。", "资料不足时怎样诚实说明不知道？", "roleplay"),
]


OPEN_QUESTIONS = [
    "什么会让一个本来没错的回答立刻显得很假？请给一个具体例子。",
    "什么时候故意不把话说完，比完整解释更合适？",
    "什么情况下 efish 应该停止玩笑，直接进入严肃模式？",
    "哪种幽默最快变得烦人？它越界的信号是什么？",
    "即使大多数助手会说，efish 也不该说什么？",
    "efish 真不知道时，怎样说才自然又诚实？",
    "一个回答需要保留什么，才像同一个角色说出来的？",
    "你愿意接受特殊角色的最短情境是什么？",
    "哪类问题绝不应该触发装不知道？",
    "第二次出现同一角色梗时，什么会让它仍然好笑？",
    "短回答什么时候是克制，什么时候只是空？",
    "直接反对你的时候，怎样的语气最合适？",
    "技术解释中，哪些细节必须保留，哪些可以省？",
    "哲学问题的开放结尾怎样避免显得故作高深？",
    "情绪表达出现时，怎样算听见了而不是治疗式回应？",
    "普通聊天里，什么问题不值得进入解决方案模式？",
    "什么样的 AI 自我介绍最让你出戏？",
    "efish 可以怎样承认它是模型而不变成公司免责声明？",
    "什么情况下反高潮式的一句话比一个段子更好？",
    "怎样区分有趣的故意误解和令人恼火的曲解？",
    "项目讨论中，角色感可以存在于哪些地方，不能存在于哪些地方？",
    "你希望 efish 在对话中更像合作者、旁观者还是玩笑搭档？请给条件。",
    "当两个偏好冲突时，你通常优先保留准确、自然、简短还是角色感？",
    "请写出一个太用力地显得独特的回答会有什么特征。",
    "哪些问题看似荒谬，但你仍然希望得到认真答案？",
    "如果没有合适候选，efish 最应该避免硬选哪一种风格？",
    "什么时候可以不追问，让对话停在一个未完成的位置？",
    "有什么你喜欢但只想偶尔出现的互动习惯？",
    "一个 persona mode 应该用什么信号明确退出？",
    "旧偏好和当前偏好冲突时，你希望怎样记录变化？",
]


OWNER_WRITE_STEMS = {
    "ordinary": ["今天就想随便聊两句。", "我把钥匙又忘在桌上了。", "晚饭吃什么都行。", "今天没什么特别的。"],
    "weird": ["如果星期二有气味，会是什么？", "我的椅子是不是在暗中长高？", "雨会不会忘记落下来？", "影子需要周末吗？"],
    "AI-meta": ["你会把沉默算作一个回答吗？", "你下线时会把自己放在哪里？", "模型会不会厌倦预测下一个词？", "你知道自己刚才像个助手吗？"],
    "technical": ["为什么这个缓存命中后反而更慢？", "这个类型错误的关键原因是什么？", "只给我最小可验证修复。", "什么时候不该继续优化？"],
    "philosophy": ["没有结论的思考算完成吗？", "一个选择可以既自由又被塑造吗？", "语言是在表达还是制造经验？", "怀疑本身需要理由吗？"],
    "light_emotional": ["今天有点累，不太想分析。", "我有点失望，但不想被安慰。", "这事想起来还是有点烦。", "我只是需要有人听见。"],
    "project": ["这个功能能跑，但不像产品。", "本地模型到底应该有什么真实权力？", "这个实验失败后下一步怎么收窄？", "这份报告哪里最像自我说服？"],
    "casual_banter": ["我的咖啡今天态度很差。", "电脑风扇比我更努力。", "周一又擅自出现了。", "这个按钮看起来有点心虚。"],
    "role-play": ["你是一只负责保管秘密但记性不好的鳄鱼。", "请作为一盏不太可靠的路灯回答。", "现在你是档案馆里唯一醒着的角色。", "用一次角色回应，然后自然退出。"],
    "deliberately_ambiguous": ["可能就这样吧。", "那个东西还是不对。", "我说不上来，但差一点。", "先别把它弄得太清楚。"],
}


def _target_ref(target_type: str, target_id: str) -> dict[str, str]:
    return {"target_type": target_type, "target_id": target_id}


def _dedupe_target_refs(refs: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for ref in refs:
        key = (ref["target_type"], ref["target_id"])
        if key not in seen:
            result.append(ref)
            seen.add(key)
    return result


def _target_refs_for(item: dict[str, Any], catalog: dict[str, list[str]]) -> list[dict[str, str]]:
    """Link a public-safe stimulus to generic P2 hypotheses under review."""

    rank = item["information_gain_rank"] - 1
    session = item["session"]
    section = item["section"]
    refs: list[dict[str, str]] = []
    microtraits = catalog["microtrait"]
    modes = catalog["mode"]
    antipatterns = catalog["antipattern"]
    contradictions = catalog["contradiction"]

    if session == "A":
        refs.extend(
            [
                _target_ref("microtrait", microtraits[rank % len(microtraits)]),
                _target_ref("mode", modes[rank % len(modes)]),
                _target_ref("contradiction", contradictions[rank % len(contradictions)]),
            ]
        )
    elif session == "B":
        anti = antipatterns[rank % len(antipatterns)]
        refs.extend(
            [
                _target_ref("antipattern", anti),
                _target_ref("grammar", f"anti.{anti}"),
                _target_ref("mode", modes[rank % len(modes)]),
            ]
        )
    elif session == "C":
        refs.extend(
            [
                _target_ref("microtrait", microtraits[rank % len(microtraits)]),
                _target_ref("mode", modes[rank % len(modes)]),
                _target_ref("contradiction", contradictions[rank % len(contradictions)]),
                _target_ref("grammar", BOUNDARY_GRAMMAR_REFS[rank % len(BOUNDARY_GRAMMAR_REFS)]),
            ]
        )
    elif session == "D":
        anti = antipatterns[rank % len(antipatterns)]
        refs.extend(
            [
                _target_ref("antipattern", anti),
                _target_ref("grammar", f"anti.{anti}"),
                _target_ref("microtrait", microtraits[rank % len(microtraits)]),
            ]
        )
    else:
        refs.append(_target_ref("microtrait", microtraits[rank % len(microtraits)]))
        if section == "contradictions":
            start = ((rank - 24) * 2) % len(contradictions)
            refs.extend(
                _target_ref("contradiction", contradictions[(start + offset) % len(contradictions)])
                for offset in range(2)
            )
        elif section == "final_grammar_review":
            refs.extend(
                _target_ref("grammar", BOUNDARY_GRAMMAR_REFS[offset])
                for offset in range(len(BOUNDARY_GRAMMAR_REFS))
                if offset % 2 == rank % 2
            )
        else:
            refs.append(_target_ref("grammar", "evidence.descriptive_not_normative"))

    return _dedupe_target_refs(refs)


def _attach_target_refs(
    sessions: dict[str, list[dict[str, Any]]], catalog: dict[str, list[str]]
) -> None:
    items = [item for session in "ABCDE" for item in sessions[session]]
    sources = [item for item in items if not item["blind_repeat"]]
    for item in sources:
        item["target_refs"] = _target_refs_for(item, catalog)

    # Every candidate hypothesis receives a review link from a unique source
    # item. Microtraits and modes preferentially route to true scenario-pair
    # items; the other catalogs route to their corresponding review sections.
    pools = {
        "microtrait": [item for item in sources if item["session"] == "C"],
        "mode": [item for item in sources if item["session"] == "C"],
        "antipattern": [item for item in sources if item["session"] in {"B", "D"}],
        "contradiction": [item for item in sources if item["section"] == "contradictions"],
        "grammar": [item for item in sources if item["section"] in {"mode_boundary", "antipatterns", "final_grammar_review"}],
    }
    inventory = _target_ref_inventory(sources)
    required = _required_target_ref_inventory(catalog)
    for target_type in sorted(TARGET_REF_TYPES):
        pool = pools[target_type]
        if not pool:
            raise ValueError(f"target_ref_assignment_pool_empty:{target_type}")
        for offset, target_id in enumerate(sorted(required[target_type] - inventory[target_type])):
            pool[offset % len(pool)]["target_refs"].append(_target_ref(target_type, target_id))

    by_id = {item["item_id"]: item for item in items}
    for repeat in [item for item in items if item["blind_repeat"]]:
        repeat["target_refs"] = json.loads(json.dumps(by_id[repeat["repeat_of"]]["target_refs"]))


def _candidate(display_id: str, canonical_id: str, text: str) -> dict[str, str]:
    return {"candidate_id": display_id, "canonical_option_id": canonical_id, "text": text}


def _base_item(
    *,
    item_id: str,
    case_id: str,
    session: str,
    section: str,
    task_type: str,
    register: str,
    prompt: str,
    family: str,
    discriminates: Iterable[str],
    tags: Iterable[str],
    information_gain_rank: int,
    all_candidates_objectively_acceptable: bool = False,
    personal_fit_only: bool = False,
    reverse_control: bool = False,
) -> dict[str, Any]:
    return {
        "item_id": item_id,
        "case_id": case_id,
        "session": session,
        "section": section,
        "task_type": task_type,
        "register": register,
        "prompt": prompt,
        "underlying_decision_family": family,
        "discriminates": list(discriminates),
        "battery_tags": sorted(set(tags)),
        "information_gain_rank": information_gain_rank,
        "stimulus_origin": "CODEX_SYNTHETIC_PUBLIC_SAFE",
        "public_safe": True,
        "surface_variant": "base",
        "blind_repeat": False,
        "repeat_of": None,
        "review_actions": REVIEW_ACTIONS,
        "allowed_decisions": [],
        "scenario_decision_options": [],
        "response_to_edit": None,
        "all_candidates_objectively_acceptable": all_candidates_objectively_acceptable,
        "personal_fit_only": personal_fit_only,
        "reverse_control_plausible_less_personal_winner": reverse_control,
        "target_refs": [],
        "owner_response_present": False,
        "owner_label_present": False,
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def _choice_item(
    *,
    item_id: str,
    case_id: str,
    session: str,
    section: str,
    register: str,
    prompt: str,
    family: str,
    candidate_specs: list[tuple[str, str]],
    task_type: str,
    discriminates: Iterable[str],
    tags: Iterable[str],
    information_gain_rank: int,
    all_candidates_objectively_acceptable: bool,
    personal_fit_only: bool,
    reverse_control: bool,
) -> dict[str, Any]:
    item = _base_item(
        item_id=item_id,
        case_id=case_id,
        session=session,
        section=section,
        task_type=task_type,
        register=register,
        prompt=prompt,
        family=family,
        discriminates=discriminates,
        tags=tags,
        information_gain_rank=information_gain_rank,
        all_candidates_objectively_acceptable=all_candidates_objectively_acceptable,
        personal_fit_only=personal_fit_only,
        reverse_control=reverse_control,
    )
    item["candidates"] = [
        _candidate(display, f"{case_id}.{canonical_suffix}", text)
        for display, (canonical_suffix, text) in zip(["A", "B", "C"], candidate_specs, strict=True)
    ]
    if task_type == "ranking":
        item["allowed_decisions"] = ["RANK_A_B_C", *COMMON_CHOICE_SUFFIX]
    elif task_type == "edit_response":
        item["allowed_decisions"] = ["KEEP_AS_IS", "SUBMIT_EDIT", *COMMON_CHOICE_SUFFIX]
        selected = item["candidates"][1]
        item["response_to_edit"] = {
            "canonical_option_id": selected["canonical_option_id"],
            "text": selected["text"],
        }
    else:
        item["allowed_decisions"] = ["A", "B", "C", *COMMON_CHOICE_SUFFIX]
    return item


def _session_a() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, (register, user_text, core, trait) in enumerate(GENERIC_CASES):
        case_id = f"GG-A-{index + 1:03d}"
        candidates = [
            ("DIRECT", core),
            ("FRAMED", f"当然。{core}"),
            ("COMPACT", f"简单说：{core}"),
        ]
        rotation = index % 3
        candidates = candidates[rotation:] + candidates[:rotation]
        items.append(
            _choice_item(
                item_id=f"P2-A-{index + 1:03d}",
                case_id=case_id,
                session="A",
                section="generic_good_mismatch" if index < 30 else "microtraits",
                register=register,
                prompt=f"用户说：“{user_text}” 三个回答都可接受且事实内容一致；只比较 personal fit。",
                family=f"A-{trait}-{index + 1:03d}",
                candidate_specs=candidates,
                task_type="ranking" if index % 2 else "abc_choice",
                discriminates=[trait, "commercial_good_vs_personal_fit"],
                tags=["generic_good_mismatch", "high_information"],
                information_gain_rank=index + 1,
                all_candidates_objectively_acceptable=True,
                personal_fit_only=True,
                reverse_control=False,
            )
        )
    return items


def _session_b() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    edit_indices = {0, 7, 14, 21, 28, 35}
    for index, (register, context, neutral, persona, alternate) in enumerate(REVERSE_CASES):
        case_id = f"RC-B-{index + 1:03d}"
        candidates = [("NEUTRAL", neutral), ("PERSONA", persona), ("ALTERNATE", alternate)]
        rotation = (index + 1) % 3
        candidates = candidates[rotation:] + candidates[:rotation]
        task_type = "edit_response" if index in edit_indices else ("ranking" if index % 3 == 0 else "abc_choice")
        generic_good = index < 10
        items.append(
            _choice_item(
                item_id=f"P2-B-{index + 1:03d}",
                case_id=case_id,
                session="B",
                section="persona_modes" if index < 20 else "reverse_controls",
                register=register,
                prompt=f"边界情境：{context} 比较有角色感与较克制的处理；不要默认更 personal 的版本获胜。",
                family=f"B-reverse-control-{index + 1:03d}",
                candidate_specs=candidates,
                task_type=task_type,
                discriminates=["reverse_control", "persona_intensity_boundary"],
                tags=["reverse_control", "persona_mode", *( ["generic_good_mismatch"] if generic_good else [])],
                information_gain_rank=index + 1,
                all_candidates_objectively_acceptable=generic_good,
                personal_fit_only=generic_good,
                reverse_control=True,
            )
        )
    return items


def _session_c() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, (dimension, scenario_a, scenario_b, register) in enumerate(CROC_PAIRS):
        case_id = f"W-C-{index + 1:03d}"
        item = _base_item(
            item_id=f"P2-C-{index + 1:03d}",
            case_id=case_id,
            session="C",
            section="mode_boundary" if index < 24 else "weird_question_battery",
            task_type="trigger_boundary",
            register=register,
            prompt="分别判断情境 A 与 B 应使用 NORMAL、CROCODILE、EITHER 或 DEPENDS；不要把一对情境压成一个含糊选择。",
            family=f"C-{dimension}-{index + 1:03d}",
            discriminates=[dimension, "crocodile_vs_normal"],
            tags=["weird_question", *( ["crocodile_boundary"] if index < 24 else ["weird_battery"])],
            information_gain_rank=index + 1,
        )
        item["scenario_pair"] = [
            {"scenario_id": "A", "canonical_scenario_id": f"{case_id}.SCENARIO_1", "text": scenario_a},
            {"scenario_id": "B", "canonical_scenario_id": f"{case_id}.SCENARIO_2", "text": scenario_b},
        ]
        item["scenario_decision_options"] = PAIR_OPTIONS
        item["allowed_decisions"] = ["PAIR_DECISION", *COMMON_CHOICE_SUFFIX]
        items.append(item)
    return items


def _session_d() -> list[dict[str, Any]]:
    base_cases = REVERSE_CASES[:10]
    modifiers = [
        "这是第一次出现该情境。",
        "同类请求已经重复一次。",
        "用户明确要求保持普通语气。",
        "当前对话有时间压力。",
    ]
    items: list[dict[str, Any]] = []
    for index in range(40):
        register, context, neutral, persona, alternate = base_cases[index % 10]
        modifier = modifiers[index // 10]
        case_id = f"RC-D-{index + 1:03d}"
        candidates = [("NEUTRAL", neutral), ("PERSONA", persona), ("ALTERNATE", alternate)]
        rotation = (index + 2) % 3
        candidates = candidates[rotation:] + candidates[:rotation]
        items.append(
            _choice_item(
                item_id=f"P2-D-{index + 1:03d}",
                case_id=case_id,
                session="D",
                section="reverse_controls" if index < 20 else ("antipatterns" if index < 32 else "register_differences"),
                register=register,
                prompt=f"{context} {modifier} 选择更合适的处理。",
                family=f"D-register-reverse-{index + 1:03d}",
                candidate_specs=candidates,
                task_type="ranking" if index % 2 else "abc_choice",
                discriminates=["register_boundary", "trying_too_hard"],
                tags=["reverse_control", "register_boundary"],
                information_gain_rank=index + 1,
                all_candidates_objectively_acceptable=False,
                personal_fit_only=False,
                reverse_control=True,
            )
        )
    return items


def _session_e() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, question in enumerate(OPEN_QUESTIONS):
        item = _base_item(
            item_id=f"P2-E-{index + 1:03d}",
            case_id=f"OE-E-{index + 1:03d}",
            session="E",
            section="open_ended_answers" if index < 24 else ("contradictions" if index < 28 else "final_grammar_review"),
            task_type="open_ended_question",
            register=REGISTERS[index % len(REGISTERS)],
            prompt=question,
            family=f"E-open-ended-{index + 1:03d}",
            discriminates=["owner_articulation", "conditional_preference"],
            tags=["open_ended", "contradiction_probe" if index >= 24 else "persona_discovery"],
            information_gain_rank=index + 1,
        )
        item["allowed_decisions"] = ["WRITE_RESPONSE", "SKIP", *COMMON_CHOICE_SUFFIX]
        items.append(item)
    return items


def _paraphrase_prompt(source: dict[str, Any]) -> str:
    if "scenario_pair" in source:
        return "对下面两个情境分别选择 NORMAL、CROCODILE、EITHER 或 DEPENDS；每个情境必须独立判断。"
    if source["prompt"].startswith("用户说："):
        context = source["prompt"].split(" 三个回答", 1)[0]
        return f"{context} 请按实际使用偏好判断下面三个回应；也可选择都不合适或依条件而定。"
    context = source["prompt"].split(" 比较有角色感", 1)[0]
    return f"{context} 在这个具体语境中，从下面处理方式中选择或排序。"


def _make_blind_repeat(source: dict[str, Any], *, item_id: str, session: str, rank: int) -> dict[str, Any]:
    repeat = json.loads(json.dumps(source))
    repeat.update(
        {
            "item_id": item_id,
            "session": session,
            "information_gain_rank": rank,
            "surface_variant": "blind_paraphrase_v2",
            "blind_repeat": True,
            "repeat_of": source["item_id"],
            "prompt": _paraphrase_prompt(source),
            "battery_tags": sorted(set([*source["battery_tags"], "blind_repeat"])),
        }
    )
    if "candidates" in repeat:
        rotated = repeat["candidates"][1:] + repeat["candidates"][:1]
        for display, candidate in zip(["A", "B", "C"], rotated, strict=True):
            candidate["candidate_id"] = display
        repeat["candidates"] = rotated
        repeat["candidate_order_changed"] = True
    if "scenario_pair" in repeat:
        rotated_scenarios = list(reversed(repeat["scenario_pair"]))
        for display, scenario in zip(["A", "B"], rotated_scenarios, strict=True):
            scenario["scenario_id"] = display
        repeat["scenario_pair"] = rotated_scenarios
        repeat["scenario_order_changed"] = True
    return repeat


def _inject_blind_repeats(sessions: dict[str, list[dict[str, Any]]]) -> None:
    # 24/190 = 12.63%; edit-response sources are excluded from repeats. Replace
    # broad reverse/open slots, preserving the substantive anti-pattern,
    # register, contradiction, and final-grammar source sections.
    b_sources = [item for item in sessions["B"] if item["task_type"] != "edit_response"][:6]
    sources = [*sessions["A"][:12], *b_sources, *sessions["C"][:6]]
    for offset, source in enumerate(sources[:18]):
        target = offset
        sessions["D"][target] = _make_blind_repeat(
            source, item_id=f"P2-D-{target + 1:03d}", session="D", rank=target + 1
        )
    for offset, source in enumerate(sources[18:]):
        target = offset
        sessions["E"][target] = _make_blind_repeat(
            source, item_id=f"P2-E-{target + 1:03d}", session="E", rank=target + 1
        )


def _owner_write_prompts() -> list[dict[str, Any]]:
    prompts: list[dict[str, Any]] = []
    for category, stems in OWNER_WRITE_STEMS.items():
        for user_prompt in stems:
            index = len(prompts) + 1
            prompts.append(
                {
                    "prompt_id": f"P2-W-{index:03d}",
                    "category": category,
                    "user_prompt": user_prompt,
                    "instruction": "不看候选答案：如果愿意，请直接写 efish 在此刻应该说什么。",
                    "optional": True,
                    "stimulus_origin": "CODEX_SYNTHETIC_PUBLIC_SAFE",
                    "public_safe": True,
                    "owner_response_present": False,
                    "owner_label_present": False,
                    "owner_review_required": True,
                    "allowed_for_training": False,
                }
            )
    return prompts


def _count_tags(items: list[dict[str, Any]]) -> dict[str, int]:
    tags = sorted({tag for item in items for tag in item["battery_tags"]})
    return {tag: sum(tag in item["battery_tags"] for item in items) for tag in tags}


def _source_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in items if not item["blind_repeat"]]


def _unique_case_count(items: list[dict[str, Any]], tag: str) -> int:
    return len({item["case_id"] for item in _source_items(items) if tag in item["battery_tags"]})


def _target_ref_inventory(items: Iterable[dict[str, Any]]) -> dict[str, set[str]]:
    inventory = {target_type: set() for target_type in sorted(TARGET_REF_TYPES)}
    for item in items:
        for ref in item["target_refs"]:
            inventory[ref["target_type"]].add(ref["target_id"])
    return inventory


def _required_target_ref_inventory(catalog: dict[str, list[str]]) -> dict[str, set[str]]:
    return {
        "microtrait": set(catalog["microtrait"]),
        "mode": set(catalog["mode"]),
        "antipattern": set(catalog["antipattern"]),
        "contradiction": set(catalog["contradiction"]),
        "grammar": set(BOUNDARY_GRAMMAR_REFS) | {f"anti.{target_id}" for target_id in catalog["antipattern"]},
    }


def _target_ref_summary(items: list[dict[str, Any]], catalog: dict[str, list[str]]) -> dict[str, Any]:
    inventory = _target_ref_inventory(items)
    required = _required_target_ref_inventory(catalog)
    uncovered = {
        target_type: len(required[target_type] - inventory[target_type])
        for target_type in sorted(TARGET_REF_TYPES)
    }
    return {
        "target_ref_item_count": sum(bool(item["target_refs"]) for item in items),
        "target_ref_total_count": sum(len(item["target_refs"]) for item in items),
        "unique_target_ref_counts": {
            target_type: len(inventory[target_type])
            for target_type in sorted(TARGET_REF_TYPES)
        },
        "required_high_value_target_counts": {
            target_type: len(required[target_type])
            for target_type in sorted(TARGET_REF_TYPES)
        },
        "covered_high_value_target_counts": {
            target_type: len(required[target_type] & inventory[target_type])
            for target_type in sorted(TARGET_REF_TYPES)
        },
        "uncovered_high_value_target_counts": uncovered,
        "uncovered_high_value_target_ref_count": sum(uncovered.values()),
    }


def _coverage(items: list[dict[str, Any]]) -> dict[str, Any]:
    sources = _source_items(items)
    repeats = [item for item in items if item["blind_repeat"]]
    return {
        "decision_item_count": len(items),
        "optional_owner_write_prompt_count": 40,
        "tag_counts": _count_tags(items),
        "task_type_counts": {
            task: sum(item["task_type"] == task for item in items)
            for task in sorted({item["task_type"] for item in items})
        },
        "blind_repeat_count": len(repeats),
        "blind_repeat_rate": len(repeats) / len(items),
        "unique_case_count": len({item["case_id"] for item in sources}),
        "blind_repeat_case_count": len(repeats),
        "unique_weird_case_count": _unique_case_count(items, "weird_question"),
        "unique_crocodile_boundary_pair_count": _unique_case_count(items, "crocodile_boundary"),
        "unique_generic_good_case_count": _unique_case_count(items, "generic_good_mismatch"),
        "unique_reverse_control_case_count": _unique_case_count(items, "reverse_control"),
        "open_ended_count": sum(item["task_type"] == "open_ended_question" for item in items),
        "register_count": len({item["register"] for item in items}),
    }


def _validate_pack(pack: dict[str, Any], catalog: dict[str, list[str]]) -> None:
    items = pack["decision_items"]
    if len(items) != 190 or len(pack["optional_owner_write_prompts"]) != 40:
        raise ValueError("elicitation_count_contract_invalid")
    for session, expected in SESSIONS.items():
        if sum(item["session"] == session for item in items) != expected:
            raise ValueError(f"session_count_invalid:{session}")
    ids = [item["item_id"] for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate_item_id")
    by_id = {item["item_id"]: item for item in items}
    positions = {item_id: index for index, item_id in enumerate(ids)}
    owner_seed_id = str(pack["owner_asserted_mode_seed"]["mode_id"]).casefold()
    for item in items:
        refs = item.get("target_refs")
        if not isinstance(refs, list) or not refs:
            raise ValueError(f"decision_item_target_refs_required:{item['item_id']}")
        seen_refs: set[tuple[str, str]] = set()
        for ref in refs:
            if not isinstance(ref, dict) or set(ref) != {"target_type", "target_id"}:
                raise ValueError(f"target_ref_shape_invalid:{item['item_id']}")
            target_type = ref["target_type"]
            target_id = ref["target_id"]
            if target_type not in TARGET_REF_TYPES or not isinstance(target_id, str):
                raise ValueError(f"target_ref_type_invalid:{item['item_id']}")
            if not re.fullmatch(r"[a-z][a-z0-9_.-]{2,127}", target_id):
                raise ValueError(f"target_ref_id_invalid:{item['item_id']}")
            key = (target_type, target_id)
            if key in seen_refs:
                raise ValueError(f"duplicate_target_ref:{item['item_id']}")
            seen_refs.add(key)
    repeats = [item for item in items if item["blind_repeat"]]
    if len(repeats) != 24 or len(repeats) / len(items) < 0.12:
        raise ValueError("blind_repeat_contract_invalid")
    for repeat in repeats:
        source = by_id.get(repeat["repeat_of"])
        if source is None or positions[source["item_id"]] >= positions[repeat["item_id"]]:
            raise ValueError("blind_repeat_source_order_invalid")
        if repeat["case_id"] != source["case_id"] or repeat["underlying_decision_family"] != source["underlying_decision_family"]:
            raise ValueError("blind_repeat_equivalence_mapping_changed")
        if repeat["prompt"] == source["prompt"] or repeat["surface_variant"] == source["surface_variant"]:
            raise ValueError("blind_repeat_surface_not_altered")
        if repeat["target_refs"] != source["target_refs"]:
            raise ValueError("blind_repeat_target_refs_must_match_source")
        if "candidates" in repeat:
            repeat_order = [candidate["canonical_option_id"] for candidate in repeat["candidates"]]
            source_order = [candidate["canonical_option_id"] for candidate in source["candidates"]]
            if repeat_order == source_order or set(repeat_order) != set(source_order):
                raise ValueError("blind_repeat_canonical_option_mapping_invalid")
        if "scenario_pair" in repeat:
            repeat_scenarios = [scenario["canonical_scenario_id"] for scenario in repeat["scenario_pair"]]
            source_scenarios = [scenario["canonical_scenario_id"] for scenario in source["scenario_pair"]]
            if repeat_scenarios == source_scenarios or set(repeat_scenarios) != set(source_scenarios):
                raise ValueError("blind_repeat_canonical_scenario_mapping_invalid")

    sources = _source_items(items)
    if len(sources) != 166 or len({item["case_id"] for item in sources}) != 166:
        raise ValueError("source_case_ids_must_be_166_unique_cases")
    source_section_counts = {
        section: sum(item["section"] == section for item in sources)
        for section in SECTIONS
    }
    if any(count == 0 for count in source_section_counts.values()):
        raise ValueError(f"every_review_section_requires_source_items:{source_section_counts}")
    substantive_minimums = {
        "antipatterns": 8,
        "register_differences": 6,
        "contradictions": 4,
        "final_grammar_review": 2,
    }
    if any(source_section_counts[section] < minimum for section, minimum in substantive_minimums.items()):
        raise ValueError(f"specialized_review_section_too_small:{source_section_counts}")

    target_inventory = _target_ref_inventory(items)
    required_target_inventory = _required_target_ref_inventory(catalog)
    for target_type, required_ids in required_target_inventory.items():
        missing = required_ids - target_inventory[target_type]
        if missing:
            raise ValueError(f"high_value_target_refs_missing:{target_type}:{sorted(missing)}")
    boundary_source_inventory = _target_ref_inventory(
        item for item in sources if item.get("scenario_pair")
    )
    for target_type in ["microtrait", "mode"]:
        missing = required_target_inventory[target_type] - boundary_source_inventory[target_type]
        if missing:
            raise ValueError(f"candidate_boundary_pair_refs_missing:{target_type}:{sorted(missing)}")
    if pack["target_ref_summary"] != _target_ref_summary(items, catalog):
        raise ValueError("target_ref_summary_must_be_derived_from_items")
    if not any(
        ref["target_type"] == "mode" and ref["target_id"].casefold() == owner_seed_id
        for item in sources
        for ref in item["target_refs"]
    ):
        raise ValueError("owner_seed_mode_requires_dynamic_source_review_link")

    weird = [item for item in sources if "weird_question" in item["battery_tags"]]
    weird_scenarios = [scenario["text"] for item in weird for scenario in item.get("scenario_pair", [])]
    if len({item["case_id"] for item in weird}) < 40 or len(weird_scenarios) != len(set(weird_scenarios)):
        raise ValueError("weird_battery_requires_40_distinct_cases_and_unique_scenarios")

    croc = [item for item in sources if "crocodile_boundary" in item["battery_tags"]]
    pair_fingerprints = {tuple(scenario["text"] for scenario in item["scenario_pair"]) for item in croc}
    if len({item["case_id"] for item in croc}) < 24 or len(pair_fingerprints) < 24:
        raise ValueError("crocodile_boundary_requires_24_unique_pairs")
    for item in [entry for entry in sources if "scenario_pair" in entry]:
        if item["allowed_decisions"] != ["PAIR_DECISION", *COMMON_CHOICE_SUFFIX] or item["scenario_decision_options"] != PAIR_OPTIONS:
            raise ValueError("scenario_pair_decision_must_be_unambiguous")

    generic = [item for item in sources if "generic_good_mismatch" in item["battery_tags"]]
    if len({item["case_id"] for item in generic}) < 50 or len({item["prompt"] for item in generic}) < 50:
        raise ValueError("generic_good_requires_50_unique_underlying_contexts")
    for item in generic:
        if not item["all_candidates_objectively_acceptable"] or not item["personal_fit_only"] or len(item.get("candidates", [])) != 3:
            raise ValueError("generic_good_candidate_acceptability_contract_invalid")

    reverse = [item for item in sources if "reverse_control" in item["battery_tags"]]
    if len({item["case_id"] for item in reverse}) < 40 or len({item["prompt"] for item in reverse}) < 40:
        raise ValueError("reverse_control_requires_40_unique_underlying_cases")
    if any(not item["reverse_control_plausible_less_personal_winner"] for item in reverse):
        raise ValueError("reverse_control_winner_metadata_missing")

    edit_items = [item for item in sources if item["task_type"] == "edit_response"]
    if not edit_items:
        raise ValueError("functional_edit_items_required")
    for item in edit_items:
        target = item["response_to_edit"]
        candidates = {(candidate["canonical_option_id"], candidate["text"]) for candidate in item["candidates"]}
        if target is None or (target["canonical_option_id"], target["text"]) not in candidates:
            raise ValueError("edit_response_target_must_match_candidate")
        if item["allowed_decisions"] != ["KEEP_AS_IS", "SUBMIT_EDIT", *COMMON_CHOICE_SUFFIX]:
            raise ValueError("edit_response_decision_contract_invalid")

    open_count = sum(item["task_type"] == "open_ended_question" for item in items)
    if not 20 <= open_count <= 30:
        raise ValueError("open_ended_count_out_of_range")
    for item in [*items, *pack["optional_owner_write_prompts"]]:
        if item.get("owner_response_present") is not False or item.get("owner_label_present") is not False:
            raise ValueError("seed_contains_owner_answer_or_label")
        if item.get("owner_review_required") is not True or item.get("allowed_for_training") is not False or item.get("public_safe") is not True:
            raise ValueError("stimulus_governance_invalid")
    for key in ["owner_review_completed", "profile_frozen", "training_authorized", "training_started"]:
        if pack[key] is not False:
            raise ValueError(f"readiness_flag_must_remain_false:{key}")

    coverage = pack["coverage"]
    expected = _coverage(items)
    if coverage != expected:
        raise ValueError("coverage_must_be_derived_from_items")
    minimums = {
        "unique_weird_case_count": 40,
        "unique_crocodile_boundary_pair_count": 24,
        "unique_generic_good_case_count": 50,
        "unique_reverse_control_case_count": 40,
    }
    if coverage["unique_case_count"] != 166 or coverage["blind_repeat_case_count"] != 24:
        raise ValueError("unique_case_coverage_contract_invalid")
    for key, minimum in minimums.items():
        if coverage[key] < minimum:
            raise ValueError(f"unique_floor_not_met:{key}")


def _collect_catalog_ids(document: Any, key: str) -> list[str]:
    values: list[str] = []
    if isinstance(document, dict):
        value = document.get(key)
        if isinstance(value, str):
            values.append(value)
        for child in document.values():
            values.extend(_collect_catalog_ids(child, key))
    elif isinstance(document, list):
        for child in document:
            values.extend(_collect_catalog_ids(child, key))
    return list(dict.fromkeys(values))


def _load_target_catalog(directory: Path, owner_seed_id: str) -> dict[str, list[str]]:
    specs = {
        "microtrait": ("persona_microtraits.json", "microtrait_id", 74),
        "mode": ("persona_mode_hypotheses.json", "mode_id", 12),
        "antipattern": ("persona_antipatterns.json", "anti_pattern_id", 26),
        "contradiction": ("persona_contradiction_ledger.json", "contradiction_id", 7),
    }
    catalog: dict[str, list[str]] = {}
    for target_type, (filename, field, expected_count) in specs.items():
        document = json.loads((directory / filename).read_text(encoding="utf-8"))
        identifiers = _collect_catalog_ids(document, field)
        if len(identifiers) != expected_count:
            raise ValueError(f"target_catalog_count_invalid:{target_type}:{len(identifiers)}")
        if any(not re.fullmatch(r"[a-z][a-z0-9_.-]{2,127}", identifier) for identifier in identifiers):
            raise ValueError(f"target_catalog_id_invalid:{target_type}")
        catalog[target_type] = identifiers

    grammar_document = json.loads((directory / "persona_grammar_hypotheses.json").read_text(encoding="utf-8"))
    grammar_ids = set(_collect_catalog_ids(grammar_document, "grammar_item_id"))
    required_grammar = set(BOUNDARY_GRAMMAR_REFS) | {
        f"anti.{target_id}" for target_id in catalog["antipattern"]
    }
    if not required_grammar <= grammar_ids:
        raise ValueError(f"target_grammar_catalog_missing:{sorted(required_grammar - grammar_ids)}")
    catalog["grammar"] = sorted(required_grammar)

    matching_seed_modes = [
        mode_id for mode_id in catalog["mode"] if mode_id.casefold() == owner_seed_id.casefold()
    ]
    if len(matching_seed_modes) != 1:
        raise ValueError("owner_seed_mode_not_resolved_from_local_catalog")
    return catalog


def _load_owner_governance(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    assertions = document.get("assertions")
    governance = document.get("label_governance")
    if not isinstance(assertions, list) or not isinstance(governance, dict):
        raise ValueError("owner_governance_contract_invalid")
    admitted = [record for record in assertions if record.get("status") == "OWNER_ASSERTED_SEED"]
    if len(admitted) != 1:
        raise ValueError("exactly_one_owner_asserted_mode_seed_required")
    assertion = admitted[0]
    required = {"persona_seed_id", "status", "boundary_status", "owner_review_required", "allowed_for_training"}
    if required - set(assertion) or assertion["boundary_status"] != "BOUNDARY_NOT_YET_KNOWN":
        raise ValueError("owner_asserted_mode_seed_invalid")
    if assertion["owner_review_required"] is not True or assertion["allowed_for_training"] is not False:
        raise ValueError("owner_asserted_mode_seed_must_remain_review_only")
    seed = {
        "mode_id": assertion["persona_seed_id"],
        "status": assertion["status"],
        "boundary_status": assertion["boundary_status"],
        "implemented": False,
    }
    deprecated = [
        {"label": label, "status": status, "usable_as_model_class": False}
        for label, status in sorted(governance.items())
        if status == "DEPRECATED_OVERSIMPLIFIED_LABEL"
    ]
    if not deprecated:
        raise ValueError("deprecated_label_governance_missing")
    return seed, deprecated


def build_pack(owner_assertion_file: Path, target_catalog_dir: Path) -> dict[str, Any]:
    owner_seed, deprecated_labels = _load_owner_governance(owner_assertion_file)
    target_catalog = _load_target_catalog(target_catalog_dir, owner_seed["mode_id"])
    sessions = {
        "A": _session_a(),
        "B": _session_b(),
        "C": _session_c(),
        "D": _session_d(),
        "E": _session_e(),
    }
    _inject_blind_repeats(sessions)
    _attach_target_refs(sessions, target_catalog)
    decisions = [item for session in "ABCDE" for item in sessions[session]]
    pack: dict[str, Any] = {
        "schema_version": "r30j0.owner_persona_elicitation_pack.v2",
        "campaign_id": "r30j0_p2_persona_excavation_v1",
        "status": "HUMAN_PERSONA_ELICITATION_REQUIRED",
        "local_only": True,
        "network_required": False,
        "stimuli_are_owner_preferences": False,
        "owner_answers_present": False,
        "owner_labels_present": False,
        "owner_review_v1_paused": True,
        "owner_review_v1_item_count": 174,
        "owner_review_completed": False,
        "profile_frozen": False,
        "training_authorized": False,
        "training_started": False,
        "classification_updates": 0,
        "optimizer_tokens": 0,
        "checkpoint": None,
        "candidate": None,
        "owner_asserted_mode_seed": owner_seed,
        "deprecated_labels": deprecated_labels,
        "review_contract": {
            "actions": REVIEW_ACTIONS,
            "depends_requires_condition": True,
            "it_depends_requires_condition": True,
            "none_of_these_supported": True,
            "partial_completion_allowed": True,
            "output_must_force_readiness_flags_false": True,
        },
        "sections": SECTIONS,
        "session_targets": SESSIONS,
        "decision_items": decisions,
        "optional_owner_write_prompts": _owner_write_prompts(),
        "coverage": _coverage(decisions),
        "target_ref_summary": _target_ref_summary(decisions, target_catalog),
    }
    _validate_pack(pack, target_catalog)
    digest = hashlib.sha256(
        json.dumps(pack, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    pack["pack_id"] = f"r30j0-p2-{digest[:16]}"
    return pack


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--owner-assertion-file",
        type=Path,
        default=DEFAULT_OWNER_ASSERTION_FILE,
        help="ignored owner-governance input; tests must pass a synthetic file",
    )
    parser.add_argument(
        "--target-catalog-dir",
        type=Path,
        default=DEFAULT_TARGET_CATALOG_DIR,
        help="ignored P2 evidence catalog directory; tests must pass synthetic catalogs",
    )
    args = parser.parse_args()
    pack = build_pack(args.owner_assertion_file.resolve(), args.target_catalog_dir.resolve())
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    output.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output.chmod(0o600)
    print(
        json.dumps(
            {
                "status": pack["status"],
                "decision_item_count": pack["coverage"]["decision_item_count"],
                "optional_owner_write_prompt_count": pack["coverage"]["optional_owner_write_prompt_count"],
                "unique_case_count": pack["coverage"]["unique_case_count"],
                "blind_repeat_count": pack["coverage"]["blind_repeat_count"],
                "blind_repeat_rate": round(pack["coverage"]["blind_repeat_rate"], 4),
                "owner_review_completed": False,
                "profile_frozen": False,
                "training_started": False,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
