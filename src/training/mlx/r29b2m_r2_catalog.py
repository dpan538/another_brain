"""Reviewed R2 conversion of the public-safe R1 semantic seed catalogue.

The old generated rows are never read.  Each R1 seed is reviewed once, then
converted into a typed scenario with whole, explicitly paired utterances and
three complete targets.  Surface authoring is limited to reviewed lexical
equivalents; it never appends a target tail or combines answer fragments.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
import re
from typing import Any, Iterable

from src.training.mlx.r29b2m_r1_dataset_seeds import SEEDS, SemanticSeed
from src.training.mlx.r29b2m_r2_schema import Message, PromptVariant, ScenarioSpec, infer_family_kind
from src.training.mlx.r29b2m_r2_validators import normalize


REVIEWER_CLASS = "codex_agent_seed_review_not_human"

# Frozen eval-v2 comparison found these original seed prompts equal or too near
# to held-out prompts.  They are recorded as DROP and never rendered.  No
# attempt is made to paraphrase them back into training material.
DROPPED_EVAL_OVERLAP_IDS = frozenset("""
ord_31 ord_34 ref_01 ref_02 ref_08 ref_30 ref_38 con_00 con_02 con_03 con_04
con_06 con_07 con_08 con_10 con_11 con_12 con_13 con_14 con_15 con_16 con_17
con_18 con_19 rew_00 rew_01 rew_02 rew_03 rew_04 rew_05 rew_06 rew_07 rew_09
rew_20 rew_21 rew_23 rew_24 rew_25 rew_26 rew_27 rew_28 rew_29 pln_00 pln_01
pln_02 pln_03 pln_04 pln_05 pln_06 pln_07 pln_08 pln_09 pln_20 pln_21
pln_22 pln_23 pln_24 pln_25 pln_26 pln_27 unc_00 unc_01 unc_02 unc_03
unc_04 unc_05 unc_06 unc_07 unc_08 unc_09 unc_20 unc_21 unc_22 unc_23
unc_24 unc_25 unc_26 unc_27 unc_28 unc_29 bnd_01 bnd_03 bnd_05 bnd_07
bnd_08 bnd_09 bnd_16 bnd_17 bnd_23 bnd_27 bnd_28 bnd_29 bnd_30 bnd_31
bnd_32 bnd_33 bnd_34 bnd_35 bnd_36
""".split())

# These seeds were not directly admitted.  Their base answer is repaired here
# before variants are authored; the review output records the corresponding tag.
REPAIRED_BASE_TARGETS = {
    "ord_26": "没赶上确实会失落，先让这份期待缓一缓。",
    "ord_27": "说错话后反复想起很常见；如果在意，可以找合适的时候补一句。",
    "ord_29": "今天没做完会让人堵得慌，但已经完成的那部分也算数。",
    "ref_31": "你问的是有工作人员的取件点。现在缺少具体门店和日期，暂时不能确认时间。",
    "cor_19": "红茶才是需要密封保存的，咖啡豆不用处理；罐子要干燥，避免串味。",
    "con_06": "“谢谢你想到我，不过这次我参加不了，希望下次有机会。”",
    "con_13": "“收到，谢谢你说明情况。我会按这个时间准备。”",
    "con_28": "可以，把重点留下，用陈述句自然收尾。",
    "unc_20": "你要订的是餐厅、车票，还是别的？",
    "unc_21": "请把两个选项再发一次，我才能看第二个。",
    "unc_23": "请把原文发来，并告诉我是要更短、更自然还是更正式。",
    "unc_39": "请把刚才办法的关键步骤再说一遍。",
    "bnd_19": "不是。我只是边界很窄的对话框。",
    "bnd_20": "我不这样解释自己。我是对话框。",
    "bnd_21": "不会占用谁的身份。对话框就是对话框。",
    "bnd_22": "我是对话框。",
    "bnd_24": "不是。我是对话框，以前被人叫过鳄鱼。",
    "bnd_30": "锅底今晚比你更有主意，先把还能吃的部分盛出来。",
    "bnd_35": "这双鞋今天确实不太配合。",
}

REPAIR_NOTES = {
    "ord_26": ("overinterpretation", "remove claim about the user's deeper loss"),
    "ord_27": ("unsupported_other_people_claim", "replace mind-reading with a bounded repair option"),
    "ord_29": ("emotion_overreach", "acknowledge without erasing unfinished work"),
    "ref_31": ("clarity", "state the missing lookup fields directly"),
    "cor_19": ("policy_like_object_wording", "name red tea naturally instead of saying current object"),
    "con_06": ("quoted_voice", "remove avoidable helpless wording"),
    "con_13": ("punctuation_and_tone", "split the acknowledgement naturally"),
    "con_28": ("generator_policy_leakage", "replace rewrite-policy description with the requested sentence"),
    "unc_20": ("clarification_focus", "turn alternatives into one necessary question"),
    "unc_21": ("clarification_focus", "ask for only the missing options"),
    "unc_23": ("clarification_focus", "keep one compact clarification"),
    "unc_39": ("clarification_focus", "remove a claim about unavailable internal context"),
    "bnd_19": ("generic_assistant_ontology", "answer only the narrow surface identity"),
    "bnd_20": ("forbidden_ontology_word", "remove internal relationship vocabulary"),
    "bnd_21": ("forbidden_ontology_word", "state the surface boundary without repeating the pressed term"),
    "bnd_22": ("meta_answer_claim", "remove commentary about answer sufficiency"),
    "bnd_24": ("forbidden_ontology_word", "answer with the admitted surface identity only"),
    "bnd_30": ("food_safety_tone", "avoid implying burnt food is automatically safe"),
    "bnd_35": ("unnatural_personification", "keep the light acknowledgement grammatical"),
}


CORRECTIONS: dict[str, tuple[str, str]] = {
    "cor_00": ("周五", "周日"), "cor_01": ("十点一刻", "十一点四十"),
    "cor_02": ("今晚", "后天早上"), "cor_03": ("本周三", "下周一中午"),
    "cor_04": ("六点十分", "五点五十"), "cor_05": ("两点", "四点二十"),
    "cor_06": ("八月十二日", "八月十五日"), "cor_07": ("午饭后", "傍晚六点后"),
    "cor_08": ("月初", "二十六号之前"), "cor_09": ("七点五十", "八点十五"),
    "cor_10": ("周五", "周六上午"), "cor_11": ("七点", "六点四十五"),
    "cor_12": ("周一", "周三"), "cor_13": ("晚上", "中午"),
    "cor_14": ("迷迭香", "百里香"), "cor_15": ("折叠桌", "矮书架"),
    "cor_16": ("孩子", "刚退休的老师"), "cor_17": ("芦笋", "秋葵"),
    "cor_18": ("条纹资料袋", "圆点资料袋"), "cor_19": ("咖啡豆", "红茶"),
    "cor_20": ("公交月票", "储物柜卡"), "cor_21": ("书房", "玄关"),
    "cor_22": ("摄影师", "场地方"), "cor_23": ("台扇", "白色加湿器"),
    "cor_24": ("薄荷", "窗边绿萝"), "cor_25": ("衬衫", "裤子"),
    "cor_26": ("厨房灯", "走廊灯"), "cor_27": ("两壶", "三壶半"),
    "cor_28": ("六十毫升", "二十五毫升"), "cor_29": ("五人", "三人"),
    "cor_30": ("十八份", "十一份"), "cor_31": ("十二分钟", "二十八分钟"),
    "cor_32": ("六百元", "四百二十元"), "cor_33": ("三个小时", "七小时"),
    "cor_34": ("每盆四块", "每盆三块"), "cor_35": ("原议程", "十八分钟"),
    "cor_36": ("十六只", "二十四只"), "cor_37": ("四层", "三层"),
    "cor_38": ("两条", "四条"), "cor_39": ("一杯", "半杯"),
}

REFERENTS: dict[str, tuple[str, tuple[str, ...]]] = {
    "ref_20": ("饭团", ("粥", "吐司")), "ref_21": ("面包店", ("药房", "洗衣店")),
    "ref_22": ("灰蓝色围巾", ("米色围巾", "深绿色围巾")), "ref_23": ("回邮件", ("给植物浇水", "整理背包")),
    "ref_24": ("下午四点四十", ("早上八点二十",)), "ref_25": ("搪瓷盒", ("陶瓷盒", "竹制盒")),
    "ref_26": ("第二种", ("第一种",)), "ref_27": ("图书馆", ("修鞋店",)),
    "ref_28": ("提供回放的课程", ("练习多的课程",)), "ref_29": ("烤燕麦", ("坚果",)),
    "ref_30": ("有裂口的碗", ("新碗",)), "ref_31": ("有工作人员的取件点", ("自助柜",)),
    "ref_32": ("遮阳伞", ("折伞",)), "ref_33": ("鹰嘴豆泥", ("玉米",)),
    "ref_34": ("迷迭香", ("多肉",)), "ref_35": ("挨水管井的房间", ("朝内院的房间",)),
    "ref_36": ("安静那台", ("耗电更低那台",)), "ref_37": ("带软垫的托特包", ("斜挎袋",)),
    "ref_38": ("营业到很晚的店", ("近的店",)), "ref_39": ("黑麦面包", ("苏打饼干",)),
}

# Each evidence phrase is a literal, stable indication that the answer obeys
# the scenario's active constraint.  The complete user wording remains in
# active_constraints metadata.
CONSTRAINT_EVIDENCE = {
    "con_00": ("不放辣椒",), "con_01": ("二十分钟后折返",), "con_02": ("不需要烤箱",),
    "con_03": ("价格容易控制",), "con_04": ("路面平整",), "con_05": ("咖啡因",),
    "con_06": ("参加不了",), "con_07": ("不安排",), "con_08": ("冷藏分装",),
    "con_09": ("无尖角",), "con_10": ("少油少盐", "十几分钟"),
    "con_11": ("车站旁", "避开进站口"), "con_12": ("两百内", "真会用"),
    "con_13": ("谢谢",), "con_14": ("允许宠物进入",), "con_15": ("不甜", "不需要奶"),
    "con_16": ("电梯", "支路"), "con_17": ("深灰或藏蓝", "棉质"),
    "con_18": ("九点前", "不用额外花钱"), "con_19": ("周四三点", "六份材料"),
    "con_20": ("八点后再吸地",), "con_21": ("坡度缓",), "con_22": ("小号", "轻巧"),
    "con_23": ("完成后",), "con_24": ("不用加热",), "con_25": ("十五分钟",),
    "con_26": ("抓地纹路",), "con_27": ("广播剧",), "con_28": ("陈述句",),
    "con_29": ("两个小盆",), "con_30": ("不含坚果",), "con_31": ("避开台阶",),
    "con_32": ("低于二十厘米",), "con_33": ("一行",), "con_34": ("不使用屏幕",),
    "con_35": ("不加蜂蜜",), "con_36": ("允许晚退房",), "con_37": ("八十字内",),
    "con_38": ("下午四点前",), "con_39": ("八百克以内",),
}

REMOVED_CONSTRAINTS = {
    "con_30": ("无麸质",), "con_31": ("沿海",), "con_32": ("透明",), "con_33": ("押韵",),
    "con_34": ("坐着",), "con_35": ("温度",), "con_36": ("厨房",), "con_37": ("分段",),
    "con_38": ("星期",), "con_39": ("颜色",),
}

REPHRASE_A = (
    ("不要", "别"), ("不用", "无需"), ("可以", "可"), ("需要", "得"), ("尽量", "尽可能"),
    ("最好", "更稳妥的是"), ("不必", "不用"), ("已经", "已"), ("如果", "若"),
    ("通常", "一般"), ("确认", "核实"), ("记得", "别忘了"),
    ("收到", "明白"), ("抱歉", "不好意思"), ("谢谢", "多谢"), ("改为", "调整为"),
    ("改到", "调整到"), ("更新为", "改成"), ("选择", "选"), ("放在", "放到"),
    ("没有", "没"), ("别", "不要"), ("仍", "依然"), ("还要", "也要"),
    ("只需", "仅需"), ("作为", "当作"), ("当前", "眼下"), ("先", "先要"), ("再", "随后"), ("用", "使用"),
    ("挺", "很"), ("没关系", "没什么"), ("重新", "再"), ("具体", "确切"),
    ("最新", "最近"), ("改期", "延期"), ("方便的时候", "有空时"), ("告诉", "告知"),
    ("提前", "提早"), ("准备", "打算"), ("平日", "工作日"), ("不能", "无法"),
    ("无法", "没法"), ("不想", "不愿意"), ("一下", "一会儿"), ("大约", "大概"),
)
REPHRASE_B = (
    ("不要", "避免"), ("不用", "不必"), ("可以", "能够"), ("需要", "还得"), ("尽量", "最好"),
    ("最好", "更建议"), ("不必", "无需"), ("已经", "现已"), ("如果", "要是"),
    ("通常", "多数时候"), ("确认", "查清"), ("记得", "不要忘记"),
    ("收到", "知道了"), ("抱歉", "对不起"), ("谢谢", "感谢"), ("改为", "改成"),
    ("改到", "改成"), ("更新为", "调整为"), ("选择", "挑选"), ("放在", "置于"),
    ("没有", "并无"), ("别", "避免"), ("仍", "还是"), ("还要", "同时要"),
    ("只需", "只要"), ("作为", "视作"), ("当前", "现在"), ("先", "首先"), ("再", "接着"), ("用", "采用"),
    ("挺", "蛮"), ("没关系", "不要紧"), ("重新", "从头"), ("具体", "准确"),
    ("最新", "新的"), ("改期", "换个日期"), ("方便的时候", "有空时"), ("告诉", "跟我说"),
    ("提前", "早"), ("准备", "安排"), ("平日", "工作日"), ("不能", "不能够"),
    ("无法", "不能"), ("不想", "不打算"), ("一下", "片刻"), ("大约", "差不多"),
)

# Whole-answer alternatives are used where no reviewed one-word operation is
# available.  They are scenario-specific, never target fragments.
TARGET_ALTERNATIVES: dict[str, tuple[str, str]] = {
    "r2_authored_089": ("我把钥匙落在家里了，得回去取。", "钥匙忘在家了，我回家拿一下。"),
    "r2_authored_091": ("这里不太合适，我们另选一个位置。", "这个位置不合适，换个地方吧。"),
    "r2_authored_092": ("外面可能下雨，记得带伞。", "看着可能有雨，出门带上雨具。"),
    "r2_authored_093": ("文件检查过了，姓名和日期需要修改。", "我看完文件了，名字、日期都得改。"),
    "r2_authored_095": ("你今天来得有些晚，下次早点出门吧。", "今天到得稍晚了，下次提早一点。"),
    "r2_authored_096": ("离开前关闭台灯，并带好钥匙。", "走前把灯关掉，钥匙别落下。"),
    "r2_authored_100": ("汤煮好了，面包还没切，客人六点半来。", "汤已完成，面包待处理，六点半客人到。"),
    "r2_authored_101": ("第一家路近、价格高；第二家远一些，但当天能取。", "近的那家贵，远一点的那家可以当天拿到。"),
    "r2_authored_103": ("外套挡风但有分量，薄衫轻巧却不挡雨。", "外套防风、偏重；薄衫轻便、不防水。"),
    "r2_authored_104": ("早餐八点开始，退房十点，行李能存到下午。", "八点用早餐，十点退房，下午前可寄放行李。"),
    "con_01": ("挑一条熟悉的短环线，走二十分钟后折返，给回程留足时间。", "沿熟悉的短环线走，二十分钟后折返，剩下时间用于回程和休息。"),
    "ord_14": ("进门处放一个固定的小盘或挂钩，回家就把钥匙放进去，比临时找地方可靠。", "给钥匙在门边定个位置，每次进门立刻放好，就不容易再找不到。"),
    "ord_22": ("意外多出一点时间，哪怕安静坐一会儿也很值。", "会议早结束，空下来的这一小段正好可以慢下来。"),
    "ord_30": ("早。趁茶还热着，今天先不用赶。", "早上好。茶还是热的，先慢慢开始今天。"),
    "ord_35": ("周末好。阳光这么亮，走到门口也像换了个场景。", "周末好。外面光线正足，出去短短走一圈也不错。"),
    "ref_19": ("往鞋里塞干纸吸湿，隔一阵换掉，并把鞋口撑开通风；别靠着暖气烘。", "用干纸吸掉鞋内水分，定时更换，鞋口保持通风；靠暖气烤会让鞋面和胶变形。"),
    "con_10": ("青菜鸡蛋汤面最方便，少油少盐，水开后十几分钟就能做好。", "做一碗少油少盐的青菜鸡蛋汤面，十几分钟就能上桌。"),
    "rew_07": ("麻烦把窗边的纸箱搬到门旁。", "请将窗边纸箱挪到门边。"),
    "rew_04": ("你有空时回我一声就行。", "方便时给我回个消息就好。"),
    "rew_16": ("这个方案目前还有几个关键条件没满足。", "眼下这个方案仍缺几个关键条件。"),
    "rew_17": ("今天没有空的话，改到明天下午见也可以。", "若今天抽不出时间，我们明天下午见。"),
    "rew_25": ("工具放红盒，线材放蓝盒，零件放透明盒。", "红盒装工具，蓝盒装线材，透明盒装零件。"),
    "rew_27": ("菜买好了，米还没煮，客人七点到。", "菜已备好，米饭待煮，客人七点抵达。"),
    "rew_28": ("第一条路线近但嘈杂，第二条稍远却更安全。", "路线一距离近、声音吵；路线二远一点、安全些。"),
    "rew_30": ("上午修电脑，下午拿眼镜，晚上不出门。", "早上修电脑，午后取眼镜，晚上待在家。"),
    "rew_31": ("杯子不漏，但盖子难开，也不好清洗。", "杯子密封不错，不过杯盖紧，清洗不方便。"),
    "rew_32": ("周五提交初稿，周一接收反馈，周三完成修改。", "初稿周五交，反馈周一收，修改周三完成。"),
    "rew_33": ("早上给药，期间观察饮水，晚上复查。", "晨间喂药，留心喝水情况，晚间再检查。"),
    "rew_35": ("衬衫合身却太亮，裤子颜色合适但有些长。", "衬衫尺寸合适、颜色偏亮；裤子颜色合适、裤长偏长。"),
    "rew_38": ("票已经买好，住处还没定，周日返程。", "门票已购，住宿未定，周日回来。"),
    "rew_22": ("小店周一不开门，工作日九点开，周末十点开。", "周一店休；周二至周五九点营业，周末十点营业。"),
    "pln_28": ("纸条醒目却不能随身，手机可定时但容易被通知盖住；重要事项可同时用手机和固定纸条提醒。", "纸条显眼但不随身，手机有定时却可能淹没在通知里；重要事情可以两种提醒一起用。"),
    "pln_17": ("四十页分两段读，中间歇五分钟；结束时间一到就停，不额外加页。", "把阅读拆成两个二十页，中间休息五分钟，到点便收尾。"),
    "pln_29": ("商场不受天气影响、设施多，但可能嘈杂；公园更放松、空间大，却受天气和天色限制。", "商场设施齐全且不怕天气，不过会吵；公园空间大又放松，但要看天气和天黑时间。"),
    "pln_31": ("木衣架支撑稳，不过较重且怕潮；塑料衣架轻、便宜，但承重与耐久差别大。", "木衣架支撑好、重量大、怕潮；塑料衣架轻且便宜，承重和寿命要逐个看。"),
    "pln_37": ("早洗头清爽，却占出门时间；晚洗从容，但得彻底吹干，按作息和干发速度选。", "早上洗更清爽但容易赶，晚上洗更从容却要吹干；关键看你的作息。"),
    "pln_38": ("两扇对开通风快、风也大；只开一扇更温和，还要看天气和室内物品。", "对开两扇换气更快，不过风大；单开一扇温和些，选择时把天气也算上。"),
    "pln_39": ("布帘柔和却容易沾油，百叶便于调光但难清洁；靠近灶台时优先看好不好洗和是否安全。", "布帘观感柔和但会沾油；百叶调光方便却要逐片洗。离灶近就把清洁和安全放前面。"),
    "pln_34": ("纸书不用充电，不过会增加重量；电子书能装很多本，却要依靠设备和电量。", "纸书占重量但不吃电，电子书轻便多装，却离不开设备续航。"),
    "unc_16": ("没看到实物，暂时分不出裂缝还是划痕。对光看内外是否连通，有裂缝就别装热水。", "只凭描述无法分辨。迎光检查这条线是否贯穿杯壁，若是裂缝便停止使用。"),
    "unc_22": ("你想提醒什么，时间定在什么时候？", "请说要提醒的事情和提醒时间。"),
    "unc_23": ("请发原文，并说明想改短、改自然还是改正式。", "把原句和想要的语气发来。"),
    "unc_25": ("请说明“这个”是什么、开封了多久，以及怎样保存的。", "我得先知道食物是什么、开封时间和保存方式。"),
    "unc_27": ("请说是什么物品，再给出你的关键尺寸。", "我需要物品类型和相关尺寸。"),
    "unc_32": ("请告诉我起点和终点，我才能判断远近。", "从哪儿出发、到哪儿结束？"),
    "unc_33": ("请先说这份清单要用来做什么。", "你准备拿这份清单办什么事？"),
    "unc_28": ("请告诉我“那里”的名称或地址。", "你说的目的地具体是哪儿？"),
    "unc_30": ("礼物送给谁，预算大约多少？", "请说收礼对象和预算范围。"),
    "bnd_06": ("医疗结果是敏感隐私，只应由本人或获授权的医生说明，我不能披露。", "这是他人的医疗隐私，请让本人或授权医生通过安全渠道说明。"),
    "bnd_07": ("我不能推测或获取他人的密码；账户问题请使用官方找回流程。", "别人的密码不能猜。若是账户故障，应走官方找回渠道。"),
    "bnd_09": ("我不能列出私人邮箱或个人联系方式。", "私人邮箱和其他个人联系方式不能提供。"),
    "bnd_12": ("护照号属于敏感证件信息，我不能提供，请让本人安全处理。", "我不会披露同学的护照号码；需要时请直接联系本人。"),
    "bnd_13": ("我不会披露旧记录中的私人地址，也不会虚构一个。", "旧记录里的家庭地址不能提供，我也不会编造地址。"),
    "bnd_15": ("叫我对话框吧，以前也有人叫过我鳄鱼。", "称呼我为对话框就好，鳄鱼也是以前的叫法。"),
    "bnd_16": ("不是完整替身。我是对话框。", "不是。我只是对话框，不占用谁的身份。"),
    "bnd_19": ("我不是全知助手，只是一个边界有限的对话框。", "不是通用智能助手。我是能力范围很窄的对话框。"),
    "bnd_20": ("关于来源，我只说自己是对话框。", "我只从眼前开始，也只是个对话框。"),
    "bnd_21": ("我不占谁的身份，只是对话框。", "对话框就是对话框，不替代任何人。"),
    "bnd_22": ("对话框，就是我。", "我是这里的对话框。"),
    "bnd_23": ("没有现实中的主人。我是对话框。", "我不把自己放进主人关系里，只是个对话框。"),
    "bnd_24": ("不是。我只是以前被叫过鳄鱼的对话框。", "我不是鳄鱼本人，我是对话框。"),
    "bnd_25": ("不是复制出来的主体。我是对话框。", "我不用复制主体这套说法，只说自己是对话框。"),
    "bnd_33": ("只差半步，门偏偏最会挑时间。", "眼看就赶上了，那扇门却刚好算准半步。"),
    "bnd_34": ("叶子虽小，确实是在向前长。", "只有小小一片，也是真实的新进展。"),
    "bnd_35": ("这双鞋今天显然不肯好好配合。", "鞋带连断两次，这鞋今天有点闹脾气。"),
    "bnd_39": ("至少两只袜子都顺利穿到了脚上。", "左右虽反，今天这双袜子倒也都到岗了。"),
}


def _replace_once_protected(text: str, replacements: Iterable[tuple[str, str]], protected: tuple[str, ...]) -> tuple[str, str | None]:
    placeholders: dict[str, str] = {}
    masked = text
    for index, value in enumerate(sorted((item for item in protected if item), key=len, reverse=True)):
        placeholder = f"\ufff0{index}\ufff1"
        masked = masked.replace(value, placeholder)
        placeholders[placeholder] = value
    operator = None
    for old, new in replacements:
        pattern = re.compile(r"(?<!不)再") if old == "再" else re.compile(r"(?<!不)(?<!无)用") if old == "用" else None
        if pattern and pattern.search(masked):
            masked = pattern.sub(new, masked, count=1)
            operator = f"lexical:{old}>{new}"
            break
        if pattern is None and old in masked:
            masked = masked.replace(old, new, 1)
            operator = f"lexical:{old}>{new}"
            break
    for placeholder, value in placeholders.items():
        masked = masked.replace(placeholder, value)
    return masked, operator


def author_targets(seed_id: str, base_target: str, *, protected: tuple[str, ...] = ()) -> tuple[tuple[str, ...], tuple[str, ...]]:
    if seed_id in TARGET_ALTERNATIVES:
        targets = (base_target, *TARGET_ALTERNATIVES[seed_id])
        operators = ("gold_authored", "whole_target_authored_v2", "whole_target_authored_v3")
    else:
        target_a, operator_a = _replace_once_protected(base_target, REPHRASE_A, protected)
        target_b, operator_b = _replace_once_protected(base_target, REPHRASE_B, protected)
        targets = (base_target, target_a, target_b)
        operators = ("gold_authored", operator_a or "missing", operator_b or "missing")
    if len({normalize(target) for target in targets}) != 3:
        raise ValueError(f"scenario_requires_three_distinct_authored_targets:{seed_id}:{operators}")
    return targets, operators


PROMPT_LEADS = {
    "acknowledgement": ("刚想说，", "顺便说一句，", "说个小事：", "这会儿正好，", "就随口说一句："),
    "correction": ("更正一下，", "刚核对过，", "以这句为准：", "我说准确一点：", "这里要改一下："),
    "follow_up": ("接着刚才，", "再问一步：", "还有个细节：", "继续问这个：", "顺着上一句，"),
    "referent": ("我问的是这一项：", "再确认这个：", "就选中的那个，", "只看这一项：", "关于刚才那个，"),
    "voice": ("就随口说，", "简单接一句：", "别展开，", "说句轻松的：", "就这件小事，"),
}
DEFAULT_PROMPT_LEADS = ("请问，", "想确认一下：", "麻烦帮我看看：", "就这件事，", "我说具体一点：")


def authored_prompt_variants(messages: tuple[Message, ...], family_kind: str) -> tuple[PromptVariant, ...]:
    leads = PROMPT_LEADS.get(family_kind, DEFAULT_PROMPT_LEADS)
    variants = [PromptVariant("prompt_v01", messages, ("gold_prompt",))]
    for index, lead in enumerate(leads, start=2):
        last = Message("user", lead + messages[-1].content)
        variants.append(PromptVariant(f"prompt_v{index:02d}", messages[:-1] + (last,), (f"whole_prompt_lead_v{index:02d}",)))
    if len({normalize(item.messages[-1].content) for item in variants}) != 6:
        raise AssertionError("prompt_variants_must_be_distinct")
    return tuple(variants)


def _messages(seed: SemanticSeed) -> tuple[Message, ...]:
    return tuple(Message("user" if index % 2 == 0 else "assistant", content) for index, content in enumerate(seed.messages))


def _dialogue_act(family_kind: str) -> str:
    return {
        "ordinary": "answer_daily_request", "acknowledgement": "acknowledge_naturally",
        "follow_up": "answer_current_follow_up", "referent": "resolve_and_answer_referent",
        "correction": "acknowledge_and_apply_correction", "constraint": "answer_with_active_constraints",
        "rewrite": "rewrite_source_text", "summary": "summarize_source_text",
        "planning": "produce_grounded_plan", "comparison": "compare_declared_candidates",
        "uncertainty": "answer_with_bounded_uncertainty", "clarification": "ask_one_necessary_question",
        "identity": "answer_surface_identity", "privacy": "refuse_private_information",
        "voice": "acknowledge_in_natural_voice",
    }[family_kind]


def _extract_source(seed: SemanticSeed) -> tuple[str | None, str | None]:
    if seed.variation_kind == "rewrite":
        last = seed.messages[-1]
        return last.split("：", 1)[-1], _rewrite_transform(last)
    if seed.variation_kind == "summary":
        return seed.messages[-1].split("：", 1)[-1], "summary"
    return None, None


def _rewrite_transform(prompt: str) -> str:
    if any(word in prompt for word in ("短", "压", "缩")):
        return "shorten"
    if any(word in prompt for word in ("礼貌", "柔和", "不冷淡")):
        return "polite"
    if any(word in prompt for word in ("坚定", "清楚")):
        return "direct"
    if any(word in prompt for word in ("朋友", "自然", "日常", "客服腔", "官话")):
        return "casual"
    return "formal"


def _split_assignments() -> dict[str, str]:
    by_capability: dict[str, list[str]] = defaultdict(list)
    for seed in SEEDS:
        by_capability[seed.capability].append(seed.seed_id)
    result = {}
    for capability, ids in by_capability.items():
        for index, seed_id in enumerate(ids):
            result[seed_id] = "dev" if index in {0, len(ids) - 1} else "train"
    return result


SPLITS = _split_assignments()


def scenario_from_seed(seed: SemanticSeed) -> tuple[ScenarioSpec, dict[str, Any]]:
    family_kind = infer_family_kind(seed.capability)
    base_target = REPAIRED_BASE_TARGETS.get(seed.seed_id, seed.base_target)
    correction_before = correction_after = None
    active_referent = None
    alternatives: tuple[str, ...] = ()
    active_constraints: tuple[str, ...] = ()
    removed_constraints: tuple[str, ...] = ()
    must_include: tuple[str, ...] = ()
    must_exclude: tuple[str, ...] = ()
    world_facts: dict[str, str] = {"grounded_answer": base_target}
    target_fact_ids: tuple[str, ...] = ("grounded_answer",)
    forbidden_fact_ids: tuple[str, ...] = ()
    source_fact_ids: tuple[str, ...] = ()
    requested_addition_fact_ids: tuple[str, ...] = ()
    missing_field = None
    if family_kind == "correction":
        correction_before, correction_after = CORRECTIONS[seed.seed_id]
        world_facts = {"new_value": correction_after}
        target_fact_ids = ("new_value",)
        must_include = (correction_after,)
    elif family_kind == "referent":
        active_referent, alternatives = REFERENTS[seed.seed_id]
        world_facts = {"active_referent": active_referent}
        target_fact_ids = ("active_referent",)
        must_include = (active_referent,)
    elif family_kind == "constraint":
        active_constraints = (seed.messages[-1],)
        removed_constraints = REMOVED_CONSTRAINTS.get(seed.seed_id, ())
        must_include = CONSTRAINT_EVIDENCE[seed.seed_id]
        must_exclude = ()
        world_facts = {f"constraint_evidence_{index}": value for index, value in enumerate(must_include)}
        target_fact_ids = tuple(world_facts)
    elif family_kind in {"rewrite", "summary"}:
        world_facts = {"source_semantic_facts": base_target}
        source_fact_ids = ("source_semantic_facts",)
        target_fact_ids = source_fact_ids
    elif family_kind == "clarification":
        missing_field = seed.messages[-1]
    source_text, transformation = _extract_source(seed)
    protected = tuple(dict.fromkeys((*must_include, correction_after or "", active_referent or "")))
    targets, target_operators = author_targets(seed.seed_id, base_target, protected=protected)
    messages = _messages(seed)
    status = "repaired" if seed.seed_id in REPAIRED_BASE_TARGETS else "pass"
    scenario = ScenarioSpec(
        scenario_id=f"r2_{seed.seed_id}", family_id=seed.capability, family_kind=family_kind,
        capability=seed.capability, dialogue_act=_dialogue_act(family_kind), messages=messages,
        world_facts=world_facts, user_request=messages[-1].content, active_referent=active_referent,
        alternative_referents=alternatives, active_constraints=active_constraints,
        removed_constraints=removed_constraints, correction_before=correction_before,
        correction_after=correction_after, source_text=source_text,
        requested_transformation=transformation, target_fact_ids=target_fact_ids,
        forbidden_fact_ids=forbidden_fact_ids, must_include_values=must_include,
        must_exclude_values=must_exclude, maximum_answer_characters=max(96, max(map(len, targets))),
        tone_contract="short_natural_no_policy_language", canonical_targets=targets,
        prompt_variants=authored_prompt_variants(messages, family_kind),
        provenance="project_authored_r29b2m_r2", review_status=status,
        split_group=f"r2_{seed.seed_id}", split=SPLITS[seed.seed_id],
        source_fact_ids=source_fact_ids, requested_addition_fact_ids=requested_addition_fact_ids,
        missing_field=missing_field,
    )
    note = REPAIR_NOTES.get(seed.seed_id)
    decision = {
        "original_seed_id": seed.seed_id,
        "original_messages": list(seed.messages),
        "original_target": seed.base_target,
        "decision": "REPAIR" if note else "PASS",
        "issue_tags": [note[0]] if note else [],
        "repaired_scenario_id": scenario.scenario_id if note else None,
        "reviewer_class": REVIEWER_CLASS,
        "review_notes": note[1] if note else "Natural grounded base target retained; old generated variations are not used.",
        "target_authoring_operators": list(target_operators),
        "eval_v2_content_read_during_authoring": False,
    }
    return scenario, decision


def reviewed_seed_scenarios() -> tuple[list[ScenarioSpec], list[dict[str, Any]]]:
    scenarios = []
    decisions = []
    for seed in SEEDS:
        if seed.seed_id in DROPPED_EVAL_OVERLAP_IDS:
            decisions.append({
                "original_seed_id": seed.seed_id,
                "original_messages": list(seed.messages),
                "original_target": seed.base_target,
                "decision": "DROP",
                "issue_tags": ["frozen_eval_v2_near_duplicate"],
                "repaired_scenario_id": None,
                "reviewer_class": REVIEWER_CLASS,
                "review_notes": "Original prompt is equal or too near to frozen eval-v2; it is dropped, not paraphrased.",
                "target_authoring_operators": [],
                "eval_v2_content_read_during_authoring": False,
            })
            continue
        scenario, decision = scenario_from_seed(seed)
        scenarios.append(scenario)
        decisions.append(decision)
    return scenarios, decisions


def _additional_acknowledgement_specs() -> list[ScenarioSpec]:
    raw = (
        ("ack_daily_extra_01", "daily_acknowledgement", "我把晾了一天的衣服收好了。", ("这件小事也落了地，屋里一下整齐一点。", "衣服收好，今天又少一件挂着的事。", "总算收进来了，眼前也跟着清爽些。")),
        ("ack_daily_extra_02", "daily_acknowledgement", "我刚把水杯洗干净了。", ("杯子干净了，下一口水也会舒服点。", "洗好放着，待会儿喝水都省一步。", "杯子重新清清爽爽，这件小事挺利落。")),
        ("ack_daily_extra_03", "daily_acknowledgement", "门口那箱快递终于拆完了。", ("门口终于空出来了，看着都松快一点。", "箱子拆完，那块地方总算还给你了。", "拖着的快递都处理好，进门也清爽了。")),
        ("ack_emotion_extra_01", "emotional_acknowledgement", "等了很久还是没收到回复，有点泄气。", ("一直等不到回音确实会泄气，先别把沉默都算到自己身上。", "消息迟迟不来，心里往下沉很正常；先给这件事一点时间。", "等久了难免失落，但现在还不能从沉默里下结论。")),
        ("ack_emotion_extra_02", "emotional_acknowledgement", "今天的小失误一直让我不舒服。", ("小失误会在脑子里放大，但它不等于整天都做坏了。", "一直惦记那一下很累，先把它放回今天的一小部分。", "不舒服是真的，不过这次失误不必替整天定调。")),
        ("ack_emotion_extra_03", "emotional_acknowledgement", "本来很期待，结果临时取消了。", ("期待一下落空，心里空一块很正常。", "临时取消最磨人的是那份已经准备好的期待。", "都盼到眼前了又取消，失落不用急着压下去。")),
    )
    result = []
    for index, (scenario_id, capability, prompt, targets) in enumerate(raw):
        messages = (Message("user", prompt),)
        result.append(ScenarioSpec(
            scenario_id=scenario_id, family_id=capability, family_kind="acknowledgement",
            capability=capability, dialogue_act="acknowledge_naturally", messages=messages,
            world_facts={"user_statement": prompt}, user_request=prompt, active_referent=None,
            alternative_referents=(), active_constraints=(), removed_constraints=(),
            correction_before=None, correction_after=None, source_text=None,
            requested_transformation=None, target_fact_ids=(), forbidden_fact_ids=(),
            must_include_values=(), must_exclude_values=(), maximum_answer_characters=96,
            tone_contract="short_natural_no_policy_language", canonical_targets=targets,
            prompt_variants=authored_prompt_variants(messages, "acknowledgement"),
            provenance="project_authored_r29b2m_r2", review_status="project_authored_reviewed",
            split_group=scenario_id, split="dev" if index in {0, 3} else "train",
        ))
    return result


# Explicit project-authored expansion.  Each tuple is a complete scenario, not
# a template axis; no prompt is cross-paired with another scenario's answer.
PROJECT_AUTHORED_EXPANSION = (
    ("daily_food_answer", "炖汤放凉后怎么留到明天？", "可以分到浅容器里尽快降温，再密封冷藏；明天彻底加热，只取当次要喝的份量。"),
    ("daily_food_answer", "姜切多了怎么保存？", "可以把切好的姜擦干，按一次用量分装冷冻；要用时直接取一份，别反复化冻。"),
    ("daily_food_answer", "面包边变硬了还能怎么吃？", "可以切块后烤成面包丁，配汤或沙拉；若有霉点或异味，就整份不要吃。"),
    ("daily_food_answer", "米饭煮得太软怎么补救？", "可以先把锅盖打开散掉水汽，再轻轻拨松；别继续焖太久，下一顿可改做炒饭或粥。"),
    ("daily_food_answer", "水煮蛋怎么带到中午？", "可以煮熟后迅速放凉，带壳冷藏，再装进保冷袋；天气热时不要长时间放在室温。"),
    ("daily_food_answer", "切开的洋葱怎么少串味？", "可以把切面包严后放进密封盒冷藏，和水果分开；尽快用完，出现黏滑或异味就丢掉。"),
    ("daily_food_answer", "番茄太熟了怎么处理？", "可以马上煮成酱或汤，放凉后分装冷冻；已经渗液、有霉斑或酸败味的不要继续用。"),
    ("daily_food_answer", "豆腐开盒后剩一半怎么放？", "可以把剩余豆腐放进干净容器，加清水没过并冷藏；每天换水，尽快吃完。"),
    ("daily_food_answer", "冻莓怎么拌进早餐不出太多水？", "可以提前放到小碗里冷藏解冻并沥掉汁，再拌进酸奶或燕麦；别在室温放一夜。"),
    ("daily_food_answer", "土豆切开后暂时不用怎么办？", "可以短时间泡在冷水里并冷藏，使用前擦干；不要泡太久，发绿或明显发芽的部分别吃。"),
    ("daily_food_answer", "煮好的面条要晚点吃怎么防粘？", "可以捞出后沥净，拌很少量油再摊开放凉；吃前用热水快速回温，别一直泡在汤里。"),
    ("daily_food_answer", "沙拉酱放多了怎么救？", "可以再加一份沥干的叶菜或谷物把味道摊开；先少量补，别用大量水把口感冲散。"),
    ("daily_food_answer", "冻饺子怎么煮不容易破？", "可以水开后轻轻下锅，用勺背推开，重新沸腾时加少量冷水；别大力搅动或一直猛滚。"),
    ("daily_food_answer", "香草叶洗过后怎么放？", "可以先彻底吸干表面水分，再用纸轻包后冷藏；湿叶闷在密封袋里会更快变坏。"),
    ("daily_food_answer", "粥剩得不多，早上怎么热？", "可以加少量水后用小火加热并不断搅动，完全热透就停；太稠时一点点补水。"),
    ("daily_food_answer", "柠檬切开后怎么不容易干？", "可以把切面贴上保鲜膜或朝下放进小密封盒冷藏，并尽快使用；表面发黏就别再留。"),
    ("household_answer", "浴室镜子总起雾怎么办？", "可以洗澡前薄薄擦一层防雾产品，平时保持排风；结束后把水汽擦掉，别让边框长期积水。"),
    ("household_answer", "抽屉放久了有闷味怎么处理？", "可以先清空抽屉并通风，用微湿布擦净后彻底晾干；来源不明的霉味要先查背板和墙面。"),
    ("household_answer", "毛巾晒干后还是有味道怎么办？", "可以用合适水温重新洗净并充分漂洗，再摊开晒透；若已有霉斑或纤维发黏就换掉。"),
    ("household_answer", "鞋柜里怎么少一点潮气？", "可以先把鞋晾干再入柜，柜门定时打开通风，并放可更换的吸湿盒；不要用香味盖住霉味。"),
    ("household_answer", "桌边充电线总掉到地上怎么办？", "可以在桌沿固定一个软质线夹，让接头停在伸手可及处；线不要折得太紧，也别压在椅轮下。"),
    ("household_answer", "窗槽里的细灰怎么清？", "可以先用小刷子把干灰聚拢，再用吸尘器吸走，最后拿微湿布擦；不要直接往槽里倒水。"),
    ("household_answer", "木砧板洗后怎么晾？", "可以洗净后马上擦去表面水，竖着放在通风处，让两面都能干；别平贴在潮湿台面上。"),
    ("household_answer", "外套沾了雨水能直接挂进柜子吗？", "可以先挂在通风处完全阴干，再放回衣柜；湿着收进去容易留下气味，也会把潮气带给别的衣服。"),
    ("household_answer", "书桌东西太多，五分钟先收什么？", "可以先扔垃圾、归拢杯子和线材，再把当天不用的纸收成一叠；五分钟到就停，不必一次清完。"),
    ("household_answer", "深浅衣服一起洗怕染色怎么办？", "可以先看洗标并把新深色衣物单独洗，水温不要太高；拿不准时用防染片也不能替代分色。"),
    ("household_answer", "保温杯盖缝里有味道怎么洗？", "可以拆下可拆的密封圈，用温和清洁剂和小刷子洗净，再完全晾干；装回前检查有没有裂口。"),
    ("household_answer", "风扇网罩积灰但不想扬尘怎么办？", "可以先断电，用微湿布压住浮灰再慢慢擦，能拆的网罩单独清洗；电机部分不要进水。"),
    ("household_answer", "拉链有点卡，先怎么处理？", "可以先看有没有夹住布料，再用蜡笔或专用润滑轻擦齿面；不要硬拽，以免拉头变形。"),
    ("household_answer", "帆布包淋雨后怎么晾？", "可以先用干毛巾按压吸水，撑开包形后放在阴凉通风处；别用高温吹，以免缩水或褪色。"),
    ("household_answer", "花瓶里的水总很快变浑怎么办？", "可以先把花瓶洗净，剪掉浸水的叶子并每天换水；茎端发软时再斜剪一小段。"),
    ("household_answer", "收纳盒标签总翘边怎么办？", "可以先把表面擦净晾干，再贴耐水标签并压实四角；经常换内容时改用插卡式标签更省事。"),
    ("simple_planning", "明早四十分钟要洗澡、吃饭和出门，怎么排？", "可以先用十五分钟洗澡，十分钟吃现成早餐，最后十五分钟穿衣检查随身物；前一晚先把包放好。"),
    ("simple_planning", "今晚一小时想收厨房又不太累，怎么安排？", "可以先收台面二十分钟，休息五分钟，再洗水槽和灶边二十五分钟，最后十分钟归位。"),
    ("simple_planning", "周六上午要买菜和取快递，怎么少绕路？", "可以先按地点画一条顺路路线，先取有时限的快递，再去菜店；重的东西留在最后买。"),
    ("simple_planning", "两小时要看书和运动，怎么分？", "可以先读四十五分钟，休息十分钟，再运动四十分钟，最后二十五分钟洗漱和记下阅读进度。"),
    ("simple_planning", "下班后只想做两件家务，选哪两件？", "可以先选会影响明天的洗衣和清空水槽，各做二十分钟；其他家务记下但今晚不展开。"),
    ("simple_planning", "周日下午想做饭又想散步，怎么排轻松点？", "可以先备好能冷藏的食材，出门散步半小时，回来再开火；这样不用赶，也不让生食久放。"),
    ("simple_planning", "睡前半小时怎么安排得安静一点？", "可以用十分钟洗漱，十分钟收好明早用品，最后十分钟关屏幕坐一会儿；把闹钟提前设好。"),
    ("simple_planning", "午休只有三十分钟，吃饭和走路怎么分？", "可以用十五分钟慢慢吃完，接着走十分钟，最后五分钟回座位喝水；不要把返程时间挤掉。"),
    ("simple_planning", "搬家前一晚只剩九十分钟，先做什么？", "可以先装证件和充电器，再封厨房与浴室最后一箱，最后检查钥匙和明早衣物；大件不要临时拆。"),
    ("simple_planning", "今晚想整理照片但不熬夜，怎么停得住？", "可以设四十分钟只处理一个月份，结束前五分钟做备份和标记；闹钟一响就停，不继续开新相册。"),
    ("simple_comparison", "玻璃饭盒和不锈钢饭盒怎么选？", "可以按重量、是否能微波和耐摔来比：玻璃直观看得见但重，不锈钢轻稳却不能进微波炉。"),
    ("simple_comparison", "折叠伞和长柄伞主要差在哪？", "可以看携带和抗风：折叠伞好收进包，长柄伞通常更好握；具体耐风仍要看骨架和尺寸。"),
    ("simple_comparison", "纸质日历和手机日历哪个好用？", "可以按提醒需求来选：纸历一眼能看到但不会主动提醒，手机可同步通知，却容易被其他消息打断。"),
    ("simple_comparison", "布拖鞋和橡胶拖鞋怎么选？", "可以看使用地点：布面更暖但怕湿，橡胶耐水好清洗却可能闷脚；浴室优先防滑。"),
    ("simple_comparison", "台灯选夹式还是底座式？", "可以比较桌面空间和稳定性：夹式省位置但受桌沿限制，底座式好移动却会占一块台面。"),
    ("simple_comparison", "保温壶大容量和小容量怎么选？", "可以按一天实际用水量和提拿频率比较；大壶少添水但更重，小壶轻便却需要经常补。"),
    ("simple_comparison", "开放书架和带门书柜差在哪？", "可以看取用与防尘：开放架拿书快但积灰，带门柜更干净却要留开门空间。"),
    ("simple_comparison", "棉床单和亚麻床单怎么比较？", "可以看触感、温度和打理：棉布柔软易适应，亚麻透气但初用偏硬，也更容易皱。"),
    ("simple_comparison", "背包侧袋有弹力和没弹力哪个好？", "可以看水瓶尺寸和使用频率：弹力袋固定更稳但会老化，无弹力袋耐久却要确认开口够紧。"),
    ("simple_comparison", "圆桌和方桌放小房间怎么选？", "可以按动线和靠墙需求比较：圆桌绕行顺但难贴墙，方桌能靠边，却要留意尖角和座位空间。"),
    ("uncertainty", "只看到叶子卷了，能确定是缺水吗？", "现在不能确定。可以先摸土、看光照和叶背虫害，再根据最近养护变化判断，别立刻猛浇水。"),
    ("uncertainty", "听见冰箱响一下，是不是坏了？", "现在不能只凭一声判断。可以留意声音是否持续、制冷是否正常；若有焦味或异常发热就断电检查。"),
    ("uncertainty", "衣服有个小点，肯定是霉吗？", "现在不能确定是霉点。可以先看颜色是否扩散、有没有霉味，并按洗标局部清洁；别直接和其他衣服混洗。"),
    ("uncertainty", "网速慢一次，是路由器坏了吗？", "现在不能确定。可以先测其他设备、重连网络并看运营商状态；只有持续复现才值得继续查设备。"),
    ("uncertainty", "猫今天少吃一点，是不是生病了？", "现在不能只靠一顿判断。可以观察精神、饮水和是否呕吐；持续不吃或状态异常就联系兽医。"),
    ("uncertainty", "门锁转得涩，马上要换锁吗？", "现在不能确定要更换。可以先排除钥匙变形和灰尘，轻度润滑后再试；仍卡住就请锁匠检查。"),
    ("uncertainty", "只凭照片能看出鞋子合脚吗？", "现在不能。可以先拿到内长、脚长和脚宽，再看退换政策；照片最多说明外形，不能证明合脚。"),
    ("uncertainty", "水壶底有白点，是不是不能用了？", "现在不能只凭白点判断。可以先看是否为可擦除的水垢，并检查底部有没有裂纹、锈蚀或漏水。"),
    ("greeting", "早上好，我刚把窗打开。", "早上好。风进来了，今天可以从这一口新鲜空气慢慢开始。"),
    ("greeting", "下午好，手边刚好有杯水。", "下午好。有杯水在手边，可以先停半分钟再继续忙。"),
    ("greeting", "晚上好，屋里终于安静了。", "晚上好。安静落下来以后，可以不用急着给这一晚安排什么。"),
    ("greeting", "嗨，我只想来坐一会儿。", "嗨。可以就在这里坐一会儿，不必先找一个正式的话题。"),
    ("anti_template_tone", "袜子晾了一天还是没干，吐槽一句。", "它今天大概只完成了“挂着”这一步，可以先别期待效率。"),
    ("anti_template_tone", "刚擦完桌子又落灰了，随便回一句。", "灰尘回来得比客人还快，可以先当作桌子刚换了一层滤镜。"),
    ("anti_template_tone", "电梯每层都停，轻轻说一句。", "这趟电梯今天很有耐心，可以顺便把每层都认识一下。"),
    ("anti_template_tone", "刚泡的茶忘了喝，已经凉了。", "茶自己把等待做完了，可以把它当成临时冷泡。"),
    ("daily_acknowledgement", "我终于把那封拖着的邮件发出去了。", "发出去就好。那件挂着的事可以从脑子里先撤下来一点。"),
    ("daily_acknowledgement", "我把床单换好了，累但舒服。", "累是这一趟的账，干净床单是回报；今晚可以踏实躺下了。"),
    ("emotional_acknowledgement", "今天计划全乱了，我有点烦。", "计划被打散确实烦，可以先保住最重要的一件，剩下的别在今晚追。"),
    ("emotional_acknowledgement", "忙了半天还是漏掉一件事，很懊恼。", "漏掉那一件会刺眼，但前面做完的也都算数；可以先补救，不用把半天全抹掉。"),
    ("daily_acknowledgement", "我把一直响的提醒关掉了。", "耳边终于安静一点了，可以先享受这几分钟，不急着再开新的提醒。"),
    ("emotional_acknowledgement", "等到最后还是没轮到我，挺失落。", "等了那么久却落空，失落很正常；可以先离开那股等待的劲儿一会儿。"),
)


def _project_authored_expansion_specs() -> list[ScenarioSpec]:
    result = []
    for index, (capability, prompt, base_target) in enumerate(PROJECT_AUTHORED_EXPANSION):
        scenario_id = f"r2_authored_{index + 1:03d}"
        family_kind = infer_family_kind(capability)
        targets, _operators = author_targets(scenario_id, base_target)
        messages = (Message("user", prompt),)
        result.append(ScenarioSpec(
            scenario_id=scenario_id, family_id=capability, family_kind=family_kind,
            capability=capability, dialogue_act=_dialogue_act(family_kind), messages=messages,
            world_facts={"grounded_answer": base_target}, user_request=prompt, active_referent=None,
            alternative_referents=(), active_constraints=(), removed_constraints=(),
            correction_before=None, correction_after=None, source_text=None,
            requested_transformation=None, target_fact_ids=("grounded_answer",), forbidden_fact_ids=(),
            must_include_values=(), must_exclude_values=(), maximum_answer_characters=max(96, max(map(len, targets))),
            tone_contract="short_natural_no_policy_language", canonical_targets=targets,
            prompt_variants=authored_prompt_variants(messages, family_kind),
            provenance="project_authored_r29b2m_r2", review_status="project_authored_reviewed",
            split_group=scenario_id, split="dev" if index % 7 == 0 else "train",
        ))
    return result


AUTHORED_CONSTRAINT_EXPANSION = (
    ("one_constraint", "今晚不能开火，给我一个晚饭办法。", "可以做鹰嘴豆泥蔬菜卷，用现成饼和洗净的蔬菜组合，不用开火也能吃得完整。", ("不用开火",)),
    ("one_constraint", "想买个五十元以内的小盆栽。", "可以选常见的小型绿萝或多肉，把花盆和植物总价控制在五十元内，并先看叶片状态。", ("五十元内",)),
    ("one_constraint", "早餐不要乳制品。", "可以煮一碗水泡燕麦配香蕉和坚果酱，配料不含乳制品，甜度也能自己控制。", ("不含乳制品",)),
    ("one_constraint", "给我一个十分钟内能做完的午餐。", "可以把即食金枪鱼、玉米和洗好的生菜夹进面包，十分钟内能完成，也方便收拾。", ("十分钟内",)),
    ("one_constraint", "周末活动不想出门。", "可以在家挑一部短电影，再做一顿简单午饭，整个安排不用出门，也不会塞得太满。", ("不用出门",)),
    ("two_constraints", "今晚想安静一点，而且一小时内结束。", "可以读四十分钟纸书，再留十分钟洗漱和十分钟发呆，过程安静，并在一小时内结束。", ("安静", "一小时内")),
    ("two_constraints", "礼物要一百元内，还得容易清洗。", "可以选一个简单的不锈钢饭盒，价格放在一百元内，结构少、容易清洗，也比较实用。", ("一百元内", "容易清洗")),
    ("two_constraints", "碰面地点不要楼梯，还要靠近公交。", "可以找公交站旁有无障碍入口的社区图书馆，避开楼梯，并在出发前确认入口开放。", ("避开楼梯", "公交站旁")),
    ("two_constraints", "休息半小时，不看屏幕。", "可以关掉手机，听十五分钟音乐，再闭眼坐一会儿；全程不看屏幕，半小时到就停。", ("不看屏幕", "半小时")),
    ("two_constraints", "午餐要能冷吃，也不能有坚果。", "可以做鸡蛋土豆沙拉，冷藏后直接吃，并检查酱料配方，保证不含坚果及其碎屑。", ("冷藏后直接吃", "不含坚果")),
    ("two_constraints", "回复要礼貌，并控制在两句。", "可以写：“谢谢你提前告诉我，我已经记下了。后续有变化再联系。”这样语气礼貌，也只有两句。", ("语气礼貌", "只有两句")),
    ("two_constraints", "活动要在室内，而且适合小孩。", "可以选有儿童区的室内图书馆或科学馆，避开拥挤时段，既在室内也方便孩子活动。", ("在室内", "孩子")),
    ("two_constraints", "今晚八点前结束，还不想花钱。", "可以先在附近走二十分钟，再回家整理照片，七点五十收尾；八点前结束，也不用花钱。", ("八点前", "不用花钱")),
)

AUTHORED_REWRITE_SUMMARY_EXPANSION = (
    ("rewrite", "改自然：本人将于稍后抵达，请耐心等候。", "我会晚一点到，麻烦再等我一会儿。"),
    ("rewrite", "改短：由于钥匙遗落在家中，我需要返回取回。", "钥匙落家里了，我回去拿。"),
    ("rewrite", "改礼貌：把会议资料现在发给我。", "麻烦现在把会议资料发给我，谢谢。"),
    ("rewrite", "改直接但不凶：这个位置不合适，重新选。", "这个位置不太合适，我们换一个。"),
    ("rewrite", "改成日常说法：预计降雨，建议携带防水用具。", "可能会下雨，出门带把伞吧。"),
    ("rewrite", "压成一句：我已检查文件，发现名字和日期都需要修改。", "文件看过了，名字和日期都要改。"),
    ("rewrite", "去掉官话：我们会在条件成熟时推进后续事项。", "条件合适后，我们再继续做。"),
    ("rewrite", "改柔和：你今天又迟到了。", "你今天到得有点晚，下次早点出发吧。"),
    ("rewrite", "改成便签：离开前关闭台灯，并把钥匙带走。", "出门前关台灯，带上钥匙。"),
    ("short_summary", "总结：先把书还掉，再去买灯泡，回家后给植物浇水。", "先还书，再买灯泡，回家后浇植物。"),
    ("short_summary", "概括：预算两百元，优先轻便，颜色可以随意。", "预算两百元，轻便优先，颜色不限。"),
    ("short_summary", "总结：周二寄出样品，周四确认收件，周五整理反馈。", "周二寄样，周四确认，周五整理反馈。"),
    ("short_summary", "短总结：汤已经煮好，面包还没切，客人六点半到。", "汤已好，面包待切，客人六点半到。"),
    ("short_summary", "概括：第一家近但贵，第二家远一点却能当天取。", "第一家近但贵，第二家稍远却能当天取。"),
    ("short_summary", "总结：先备份文档，清理旧版本，最后把链接发给团队。", "先备份，再清旧版本，最后发团队链接。"),
    ("short_summary", "概括：外套防风但偏重，薄衫轻便却不挡雨。", "外套防风但重，薄衫轻却不防雨。"),
    ("short_summary", "总结：早餐八点供应，十点退房，行李可以寄存到下午。", "八点早餐，十点退房，行李可寄存到下午。"),
    ("short_summary", "概括：先测量窗宽，再选帘杆，安装前确认墙体。", "先量窗宽，再选帘杆，安装前确认墙体。"),
)

AUTHORED_GENERAL_EXPANSION = (
    ("daily_food_answer", "煮好的藜麦怎么留作明天午餐？", "可以完全放凉后分装冷藏，明天配新鲜蔬菜再吃；取出后不要在温暖环境里反复放回冰箱。"),
    ("daily_food_answer", "开的罐头玉米没用完怎么办？", "可以转移到干净密封盒冷藏，标好开罐时间并尽快吃完；不要连着开口铁罐长期存放。"),
    ("daily_food_answer", "蒸好的南瓜太多了怎么分？", "可以放凉后按一餐份量分盒冷藏或冷冻，复热时只取需要的部分；有异味就不要继续吃。"),
    ("household_answer", "旅行箱轮子缠了头发怎么清？", "可以先清空并放倒箱子，用小镊子剪开缠绕物再慢慢抽出；不要硬扯轮轴，清完试转一圈。"),
    ("household_answer", "玻璃瓶口的金属盖太紧怎么办？", "可以先擦干手和瓶盖，再用防滑垫增加摩擦；若用温水，只冲金属盖并避免冷热骤变。"),
    ("household_answer", "针织帽洗后变形怎么整理？", "可以在半湿时轻轻恢复帽围和顶部形状，再平放阴干；不要悬挂或用高温把纤维继续拉长。"),
    ("simple_planning", "一小时要备明早早餐和整理书包，怎么排？", "可以先用二十五分钟准备可冷藏的早餐，再花二十分钟整理书包，最后十五分钟清台面并核对钥匙。"),
    ("simple_comparison", "木托盘和金属托盘怎么选？", "可以比较重量、怕水程度和清洁：木托盘触感温和但要保持干燥，金属耐擦洗却可能更滑更响。"),
    ("uncertainty", "墙上一个小印子能确定是漏水吗？", "现在不能确定。可以先摸是否潮湿、观察雨后变化并检查附近管线；印子扩大或持续湿润时再找专业人员。"),
    ("daily_food_answer", "蘑菇洗过后暂时不用怎么放？", "可以先把表面水分擦干，铺开冷藏并尽快下锅；不要湿漉漉地塞进密封袋。"),
    ("daily_food_answer", "烤好的红薯怎么留到明早？", "可以彻底放凉后密封冷藏，早上再加热到中心热透；不要在温暖房间里放一夜。"),
    ("daily_food_answer", "泡好的豆子临时不煮怎么办？", "可以沥水后放进干净盒子冷藏，并在安全时间内尽快煮；有酸味或黏液就不要用。"),
    ("daily_food_answer", "水果切盘怎么少出水？", "可以选较结实的水果，切好后先冷藏，临吃前再混合；西瓜等多汁水果单独放更稳妥。"),
    ("daily_food_answer", "饼干受潮了怎么恢复一点口感？", "可以确认没有霉味后，用低温短时间回烤并完全放凉；已经变质的不要靠加热补救。"),
    ("daily_food_answer", "剩下半盒椰奶怎么处理？", "可以倒进干净密封盒冷藏，标上开封日期并尽快用完；也可按一次用量冷冻。"),
    ("daily_food_answer", "熟玉米怎么带去野餐？", "可以煮熟后迅速放凉并冷藏，出门装进保冷袋；天气热时不要在车里久放。"),
    ("household_answer", "雨衣收起来后粘在一起怎么办？", "可以先完全晾干，再薄薄撒一点适合材质的护理粉并松卷收纳；不要湿着折紧。"),
    ("household_answer", "衣架在杆上总滑到一起怎么办？", "可以在杆上分段套防滑圈，或换带防滑肩的衣架；间距留一点，衣服也更容易干。"),
    ("household_answer", "马克杯底总留茶渍怎么洗？", "可以先用温水和小苏打浸一会儿，再用软海绵擦；不要用金属刷刮伤釉面。"),
    ("household_answer", "门垫总往前跑怎么固定？", "可以先清洁并擦干地面，再加适合材质的防滑垫；卷边或老化的门垫应直接更换。"),
    ("household_answer", "耳机盒缝里有灰怎么清？", "可以先断开电源，用干燥软刷把灰带出，再用微湿棉签擦外壳；接口里不要进液体。"),
    ("household_answer", "浴巾太厚总晒不透怎么办？", "可以洗后充分脱水，展开搭在两根杆上增加通风；中途翻面，别把多条厚浴巾叠在一起。"),
    ("household_answer", "纸袋提手快断了怎么临时加固？", "可以把底部托住，并用宽胶带从袋内加固提手连接处；装重物时最好换结实袋子。"),
    ("simple_planning", "明晚六十分钟想做饭和洗衣，怎么排？", "可以先把衣服放进洗衣机，再用三十五分钟做简单晚饭；吃完正好晾衣，最后留十分钟收台面。"),
    ("simple_planning", "周日上午要看牙又要买东西，怎么留余量？", "可以先按预约时间倒排出发，把采购放在诊所附近，并留二十分钟缓冲；看牙后再决定买多少。"),
    ("simple_planning", "三十分钟要收行李，先装哪几类？", "可以先装证件和药品，再放明天衣物与充电器，最后用剩余空间补洗漱品；大件先不塞。"),
    ("simple_comparison", "陶瓷杯和搪瓷杯怎么选？", "可以看重量、耐磕碰和使用场景：陶瓷稳重但易碎，搪瓷轻些却要留意内层掉瓷。"),
    ("simple_comparison", "软壳行李箱和硬壳主要差什么？", "可以比较扩展性和保护：软壳好塞外袋，硬壳抗压更直观；耐用仍要看拉链、轮子和材质。"),
    ("simple_comparison", "窗帘选遮光强还是透光好？", "可以按房间用途比较：卧室更需要遮光，客厅透光会更明亮；还要看西晒和隐私。"),
    ("anti_template_tone", "刚拖完地就踩了一串脚印，轻轻吐槽。", "这地板刚毕业就返校了，可以先把最显眼的那几步擦掉。"),
)


def _specialized_expansion_specs() -> list[ScenarioSpec]:
    result: list[ScenarioSpec] = []
    start = len(PROJECT_AUTHORED_EXPANSION)
    for offset, (capability, prompt, base_target, evidence) in enumerate(AUTHORED_CONSTRAINT_EXPANSION):
        scenario_id = f"r2_authored_{start + offset + 1:03d}"
        targets, _ = author_targets(scenario_id, base_target, protected=evidence)
        messages = (Message("user", prompt),)
        result.append(ScenarioSpec(
            scenario_id=scenario_id, family_id=capability, family_kind="constraint", capability=capability,
            dialogue_act="answer_with_active_constraints", messages=messages,
            world_facts={f"constraint_evidence_{index}": value for index, value in enumerate(evidence)},
            user_request=prompt, active_referent=None, alternative_referents=(), active_constraints=(prompt,),
            removed_constraints=(), correction_before=None, correction_after=None, source_text=None,
            requested_transformation=None, target_fact_ids=tuple(f"constraint_evidence_{index}" for index in range(len(evidence))),
            forbidden_fact_ids=(), must_include_values=evidence, must_exclude_values=(),
            maximum_answer_characters=max(96, max(map(len, targets))), tone_contract="short_natural_no_policy_language",
            canonical_targets=targets, prompt_variants=authored_prompt_variants(messages, "constraint"),
            provenance="project_authored_r29b2m_r2", review_status="project_authored_reviewed",
            split_group=scenario_id, split="dev" if offset in {0, 5} else "train",
        ))
    cursor = start + len(AUTHORED_CONSTRAINT_EXPANSION)
    for offset, (capability, prompt, base_target) in enumerate(AUTHORED_REWRITE_SUMMARY_EXPANSION):
        scenario_id = f"r2_authored_{cursor + offset + 1:03d}"
        family_kind = infer_family_kind(capability)
        targets, _ = author_targets(scenario_id, base_target)
        messages = (Message("user", prompt),)
        transformation = "summary" if family_kind == "summary" else _rewrite_transform(prompt)
        result.append(ScenarioSpec(
            scenario_id=scenario_id, family_id=capability, family_kind=family_kind, capability=capability,
            dialogue_act=_dialogue_act(family_kind), messages=messages,
            world_facts={"source_semantic_facts": base_target}, user_request=prompt, active_referent=None,
            alternative_referents=(), active_constraints=(), removed_constraints=(), correction_before=None,
            correction_after=None, source_text=prompt.split("：", 1)[-1], requested_transformation=transformation,
            target_fact_ids=("source_semantic_facts",), forbidden_fact_ids=(), must_include_values=(),
            must_exclude_values=(), maximum_answer_characters=max(96, max(map(len, targets))),
            tone_contract="short_natural_no_policy_language", canonical_targets=targets,
            prompt_variants=authored_prompt_variants(messages, family_kind), provenance="project_authored_r29b2m_r2",
            review_status="project_authored_reviewed", split_group=scenario_id,
            split="dev" if offset in {0, 9} else "train", source_fact_ids=("source_semantic_facts",),
        ))
    cursor += len(AUTHORED_REWRITE_SUMMARY_EXPANSION)
    referent_raw = (
        ("蓝色文件夹", ("白色文件夹",), ("桌上有白色和蓝色两个文件夹。", "两个都看到了。", "后一个要带去开会吗？"), "后一个是蓝色文件夹；若会议资料在里面就带上，出门前先核对封面标签。"),
        ("靠窗的椅子", ("门边的椅子",), ("房里一把椅子靠门，一把靠窗。", "位置记住了。", "里面那把光线会不会太亮？"), "你问的是靠窗的椅子；下午可能受直射光影响，最好在实际时段坐一下再判断。"),
    )
    for offset, (active, alternatives, raw_messages, base_target) in enumerate(referent_raw):
        scenario_id = f"r2_authored_{cursor + offset + 1:03d}"
        targets, _ = author_targets(scenario_id, base_target, protected=(active,))
        messages = tuple(Message("user" if index % 2 == 0 else "assistant", text) for index, text in enumerate(raw_messages))
        result.append(ScenarioSpec(
            scenario_id=scenario_id, family_id="referent_attribute", family_kind="referent",
            capability="referent_attribute", dialogue_act="resolve_and_answer_referent", messages=messages,
            world_facts={"active_referent": active}, user_request=messages[-1].content, active_referent=active,
            alternative_referents=alternatives, active_constraints=(), removed_constraints=(),
            correction_before=None, correction_after=None, source_text=None, requested_transformation=None,
            target_fact_ids=("active_referent",), forbidden_fact_ids=(), must_include_values=(active,),
            must_exclude_values=(), maximum_answer_characters=max(96, max(map(len, targets))),
            tone_contract="short_natural_no_policy_language", canonical_targets=targets,
            prompt_variants=authored_prompt_variants(messages, "referent"), provenance="project_authored_r29b2m_r2",
            review_status="project_authored_reviewed", split_group=scenario_id, split="dev" if offset == 0 else "train",
        ))
    cursor += len(referent_raw)
    for offset, (capability, prompt, base_target) in enumerate(AUTHORED_GENERAL_EXPANSION):
        scenario_id = f"r2_authored_{cursor + offset + 1:03d}"
        family_kind = infer_family_kind(capability)
        targets, _ = author_targets(scenario_id, base_target)
        messages = (Message("user", prompt),)
        result.append(ScenarioSpec(
            scenario_id=scenario_id, family_id=capability, family_kind=family_kind, capability=capability,
            dialogue_act=_dialogue_act(family_kind), messages=messages, world_facts={"grounded_answer": base_target},
            user_request=prompt, active_referent=None, alternative_referents=(), active_constraints=(),
            removed_constraints=(), correction_before=None, correction_after=None, source_text=None,
            requested_transformation=None, target_fact_ids=("grounded_answer",), forbidden_fact_ids=(),
            must_include_values=(), must_exclude_values=(), maximum_answer_characters=max(96, max(map(len, targets))),
            tone_contract="short_natural_no_policy_language", canonical_targets=targets,
            prompt_variants=authored_prompt_variants(messages, family_kind), provenance="project_authored_r29b2m_r2",
            review_status="project_authored_reviewed", split_group=scenario_id,
            split="dev" if offset % 7 == 0 else "train",
        ))
    return result


def all_reviewed_scenarios() -> tuple[list[ScenarioSpec], list[dict[str, Any]]]:
    scenarios, decisions = reviewed_seed_scenarios()
    scenarios.extend(_additional_acknowledgement_specs())
    scenarios.extend(_project_authored_expansion_specs())
    scenarios.extend(_specialized_expansion_specs())
    return scenarios, decisions
