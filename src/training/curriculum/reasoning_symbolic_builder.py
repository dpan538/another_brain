def build_reasoning_rows(target_rows=5000):
    names = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"]
    families = [
        ("arithmetic", lambda i: (f"{i}+{i % 7}等于多少？", str(i + i % 7))),
        ("boolean_contradiction", lambda i: (f"如果命题P{i}为真，同时P{i}为假，这是什么问题？", "这是矛盾，不能同时接受两个互斥断言。")),
        ("set_inclusion", lambda i: (f"所有{names[i % len(names)]}类对象都在集合A{i % 13}里，样本{i}属于这个类，它在哪里？", f"如果前提成立，样本{i}在集合A{i % 13}里。")),
        ("relation_graph", lambda i: (f"{names[i % len(names)]}比{names[(i + 1) % len(names)]}早，{names[(i + 1) % len(names)]}比{names[(i + 2) % len(names)]}早，谁最早？", f"{names[i % len(names)]}最早。")),
        ("evidence_sufficiency", lambda i: (f"只有一个模糊传闻{i}，能下确定结论吗？", "不能，只能说证据不足。")),
        ("premise_challenge", lambda i: (f"既然方案{i}失败已经确定，你怎么解释成功？", "这个问题预设失败已经确定，应该先挑战这个前提。")),
        ("unknown_vs_unsupported", lambda i: (f"没有证据支持的说法{i}应该叫事实吗？", "不应该，只能说未知或未被支持。")),
        ("date_absolute", lambda i: (f"2026-07-{(i % 20) + 1:02d}的后一天是哪天？", f"2026-07-{(i % 20) + 2:02d}。")),
    ]
    rows = []
    for i in range(target_rows):
        family, make = families[i % len(families)]
        prompt, answer = make(i)
        rows.append({
            "record_id": f"r27a4_reasoning_{i:05d}",
            "curriculum": "reasoning_symbolic",
            "reasoning_family": family,
            "text": f"问题：{prompt}\n回答：{answer}",
            "language": "zh",
            "contains_cot": False,
            "contains_eval_prompt": False,
            "contains_private_data": False,
            "training_allowed": True,
        })
    return rows
