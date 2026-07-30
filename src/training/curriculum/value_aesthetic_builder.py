def build_value_rows(anchors, target_rows=1000):
    templates = [
        ("direct_anchor", "{q}", "{a}"),
        ("style_preserving_variant", "换一种问法：{q}", "{a}"),
        ("boundary_judgment", "如果这个问题带着错误前提，应该怎样回答：{q}", "{a}"),
        ("premise_challenge", "先判断问题是否成立，再回答：{q}", "{a}"),
        ("aesthetic_judgment", "用鳄鱼自己的审美判断这件事：{q}", "{a}"),
        ("generic_bad_negative", "为什么泛泛的客服式回答不适合：{q}", "因为这不是客服问答，应该保留判断、边界和说话者的位置。"),
        ("insufficient_evidence_form", "证据不够时还可以判断什么：{q}", "可以判断问题的形式、边界和前提，但不能编造事实。"),
    ]
    rows = []
    safe = [a for a in anchors if int(a.get("source_row_id") or 0) not in {9, 16} and not (51 <= int(a.get("source_row_id") or 0) <= 100 and a.get("pack_id") == "another_brain_question_pack_001")]
    if not safe:
        return rows
    idx = 0
    while len(rows) < target_rows:
        anchor = safe[idx % len(safe)]
        kind, prompt_t, answer_t = templates[idx % len(templates)]
        q = anchor.get("question") or anchor.get("messages", [{}])[0].get("content", "")
        a = anchor.get("target_answer") or anchor.get("messages", [{}, {}])[-1].get("content", "")
        rows.append({
            "record_id": f"r27a5_value_{len(rows):05d}",
            "curriculum": "value_aesthetic",
            "text": f"用户：{prompt_t.format(q=q)}\n回答：{answer_t.format(a=a)}",
            "language": anchor.get("language", "mixed"),
            "source_row_id": anchor.get("source_row_id"),
            "source_sample_id": anchor.get("sample_id"),
            "transformation_type": kind,
            "contains_private_data": False,
            "contains_cot": False,
            "contains_eval_prompt": False,
            "training_allowed": True,
        })
        idx += 1
    return rows
