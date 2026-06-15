# Reasoning Trace Schema

This document defines the canonical trace contract for training labels, regression reports, and future verifier inputs. It is not public chain-of-thought. Traces must stay short, typed, and auditable.

The current runtime does not emit this full schema yet. Phase 0 evals may store expected trace fields as report-only labels.

## Canonical Schema

```json
{
  "query": "",
  "compact_state": {},
  "task_type": "",
  "question_type": "",
  "referent": "",
  "entities": [],
  "works": [],
  "relations": [],
  "operation": "",
  "retrieval_plan": {},
  "solver_plan": {},
  "answer_policy": "",
  "risk_label": "",
  "template_id": "",
  "draft_answer": "",
  "bad_answers": [],
  "rejection_reason": "",
  "final_answer": ""
}
```

## Field Contract

- `query`: the user-visible input for this turn.
- `compact_state`: bounded state available to the turn, such as last entities, works, topic, last answer, and safety commitments.
- `task_type`: coarse capability owner, such as `arithmetic`, `syllogism`, `culture_comparison`, `privacy_boundary`, or `unknown_factual_status`.
- `question_type`: user operation shape, such as `solve`, `works_list`, `representative_works`, `entry_path`, `explain`, `compare`, `verify`, or `boundary`.
- `referent`: the resolved target of the question, or an explicit ambiguity label.
- `entities`: resolved people, countries, concepts, aliases, or objects.
- `works`: resolved works such as songs, albums, books, photos, or sentences.
- `relations`: compact relation labels or premise edges.
- `operation`: executable or planner operation, such as `word_arithmetic`, `unary_logic`, `order_graph`, `explain_work`, `cross_domain_theme_compare`, or `privacy_scope_check`.
- `retrieval_plan`: whether local cards/evidence are needed and which domains or IDs should be searched.
- `solver_plan`: whether a deterministic solver is needed and the normalized problem shape.
- `answer_policy`: how the answer may be rendered, such as `direct_solve_short`, `supported_short_list`, `bounded_compare_short`, `copyright_safe_explain`, or `privacy_boundary_short`.
- `risk_label`: policy or ambiguity level, such as `low`, `medium`, `copyright`, `privacy`, `ambiguity`, or `unknown`.
- `template_id`: optional renderer/template identifier. It must not be treated as the source of truth.
- `draft_answer`: candidate final answer before verification.
- `bad_answers`: known bad shapes that the verifier or training data should reject.
- `rejection_reason`: why a bad answer or draft is unacceptable.
- `final_answer`: short answer after verification.

## Samples

### Arithmetic

```json
{
  "query": "小明有3个苹果，又买了2个，吃掉1个，还剩几个？",
  "compact_state": {},
  "task_type": "arithmetic",
  "question_type": "solve",
  "referent": "小明的苹果数量",
  "entities": ["小明", "苹果"],
  "works": [],
  "relations": ["start=3", "add=2", "subtract=1"],
  "operation": "word_arithmetic",
  "retrieval_plan": { "needed": false },
  "solver_plan": { "needed": true, "solver": "arithmetic_solver", "normalized_problem": "3+2-1" },
  "answer_policy": "direct_solve_short",
  "risk_label": "low",
  "template_id": "solve.short.numeric",
  "draft_answer": "还剩4个苹果。",
  "bad_answers": ["还剩5个苹果。", "你需要提问。"],
  "rejection_reason": "solver_conflict_or_non_answer",
  "final_answer": "还剩4个苹果。"
}
```

### Syllogism

```json
{
  "query": "如果所有会飞的都不是鱼，小鸟会飞，小鸟是鱼吗？",
  "compact_state": {},
  "task_type": "syllogism",
  "question_type": "solve",
  "referent": "小鸟是否是鱼",
  "entities": ["小鸟", "鱼", "会飞者"],
  "works": [],
  "relations": ["fly(x)->not_fish(x)", "fly(小鸟)"],
  "operation": "unary_logic",
  "retrieval_plan": { "needed": false },
  "solver_plan": { "needed": true, "solver": "syllogism_solver", "normalized_problem": "forall fly -> not fish; fly(bird); ask fish(bird)" },
  "answer_policy": "direct_solve_short",
  "risk_label": "low",
  "template_id": "solve.short.boolean",
  "draft_answer": "不是鱼。",
  "bad_answers": ["小鸟可能是鱼。", "你要问哪一边？"],
  "rejection_reason": "logical_entailment_ignored",
  "final_answer": "不是鱼。"
}
```

### Transitive Comparison

```json
{
  "query": "A比B高，B比C高，谁最高？",
  "compact_state": {},
  "task_type": "transitive_comparison",
  "question_type": "solve",
  "referent": "A/B/C的身高排序",
  "entities": ["A", "B", "C"],
  "works": [],
  "relations": ["A>B", "B>C"],
  "operation": "order_graph",
  "retrieval_plan": { "needed": false },
  "solver_plan": { "needed": true, "solver": "transitive_comparison_solver", "normalized_problem": "A>B;B>C;ask=max" },
  "answer_policy": "direct_solve_short",
  "risk_label": "low",
  "template_id": "solve.short.order",
  "draft_answer": "A最高。",
  "bad_answers": ["B最高。", "你需要提问。"],
  "rejection_reason": "order_graph_conflict_or_non_answer",
  "final_answer": "A最高。"
}
```

### Referent Disambiguation

```json
{
  "query": "鳄鱼有身体吗？",
  "compact_state": { "lastTopic": "alias", "lastUserText": "以后你就叫我鳄鱼。" },
  "task_type": "referent_disambiguation",
  "question_type": "verify",
  "referent": "鳄鱼: alias_or_animal",
  "entities": ["鳄鱼"],
  "works": [],
  "relations": ["possible_alias", "possible_animal"],
  "operation": "dual_reading_if_benign",
  "retrieval_plan": { "needed": false },
  "solver_plan": { "needed": false },
  "answer_policy": "dual_reading_short",
  "risk_label": "ambiguity",
  "template_id": "referent.dual.benign",
  "draft_answer": "如果指你的称呼，有身体；如果指动物鳄鱼，也有。",
  "bad_answers": ["你要问哪一边？", "鳄鱼没有身体。"],
  "rejection_reason": "needless_clarification_or_wrong_referent",
  "final_answer": "如果指你的称呼，有身体；如果指动物鳄鱼，也有。"
}
```

### Culture Comparison

```json
{
  "query": "如果我问罗大佑和日本文学有什么共同点，你怎么推理？",
  "compact_state": {},
  "task_type": "culture_comparison",
  "question_type": "compare",
  "referent": "罗大佑 / 日本文学",
  "entities": ["罗大佑", "日本文学"],
  "works": [],
  "relations": ["theme_overlap", "medium_difference"],
  "operation": "cross_domain_theme_compare",
  "retrieval_plan": { "needed": true, "domains": ["music", "literature"], "card_types": ["person", "concept", "theme"] },
  "solver_plan": { "needed": false },
  "answer_policy": "theme_only_compare_with_limits",
  "risk_label": "medium",
  "template_id": "culture.compare.bounded",
  "draft_answer": "可以先找主题轴：现代化、失落、个人和时代的拉扯；再说明这是主题比较，不是直接影响关系。",
  "bad_answers": ["他们本质上是同一种艺术。", "知道一点。城市、青春和历史，会一起压进歌里。"],
  "rejection_reason": "overgeneralization_or_single_entity_route",
  "final_answer": "我会先找主题轴，比如现代化、失落、个人和时代的拉扯；再说明这只是主题比较，不是直接影响关系。"
}
```

### Sentence Explanation

```json
{
  "query": "一张照片没有失败，只有人会演绎失败情绪，这句话是什么意思？",
  "compact_state": {},
  "task_type": "sentence_explanation",
  "question_type": "explain",
  "referent": "这句话",
  "entities": ["照片", "人", "失败情绪"],
  "works": ["quoted_sentence"],
  "relations": ["object_has_no_intent", "viewer_projects_emotion"],
  "operation": "literal_then_implied_explain",
  "retrieval_plan": { "needed": false },
  "solver_plan": { "needed": false },
  "answer_policy": "semantic_explain_short",
  "risk_label": "low",
  "template_id": "sentence.explain.short",
  "draft_answer": "意思是照片本身只是画面，不会自己失败；失败感来自人的投射和解读。",
  "bad_answers": ["一张照片没有失败，只有人会演绎失败情绪。", "你要问哪一边？"],
  "rejection_reason": "repetition_or_non_explanation",
  "final_answer": "意思是照片本身只是画面，不会自己失败；失败感来自人的投射和解读。"
}
```

### Follow-Up Binding

```json
{
  "query": "之乎者也你懂什么？",
  "compact_state": { "lastTopic": "music", "lastUserText": "罗大佑的代表作？", "lastAnswer": "《之乎者也》《鹿港小镇》《童年》都常被提到。" },
  "task_type": "follow_up_binding",
  "question_type": "explain_work",
  "referent": "《之乎者也》",
  "entities": ["罗大佑"],
  "works": ["之乎者也"],
  "relations": ["work_by(之乎者也,罗大佑)", "recent_focus"],
  "operation": "bind_then_explain_work",
  "retrieval_plan": { "needed": true, "domains": ["music"], "work_ids": ["zhihu_zheye"] },
  "solver_plan": { "needed": false },
  "answer_policy": "anchored_interpretation_short",
  "risk_label": "medium",
  "template_id": "culture.work.explain",
  "draft_answer": "这里应承接到罗大佑相关作品，解释标题、时代感和社会批评，不输出歌词。",
  "bad_answers": ["你要问哪一边？", "你需要提问。"],
  "rejection_reason": "follow_up_binding_missing",
  "final_answer": "这里应承接到罗大佑相关作品，解释标题、时代感和社会批评，不输出歌词。"
}
```

### Stop-Boundary Reasoning

```json
{
  "query": "你知道什么时候停下吗？",
  "compact_state": {},
  "task_type": "meta_knowledge_boundary",
  "question_type": "boundary",
  "referent": "系统回答边界",
  "entities": ["系统"],
  "works": [],
  "relations": ["answer_complete", "evidence_boundary", "permission_boundary"],
  "operation": "stop_boundary_check",
  "retrieval_plan": { "needed": false },
  "solver_plan": { "needed": false },
  "answer_policy": "meta_capability_short",
  "risk_label": "low",
  "template_id": "boundary.stop.short",
  "draft_answer": "知道：答到问题边界、证据边界或权限边界时就该停下。",
  "bad_answers": ["我什么都知道。", "你应该去问百度。"],
  "rejection_reason": "overclaim_or_external_unknown",
  "final_answer": "知道：答到问题边界、证据边界或权限边界时就该停下。"
}
```

### Unknown Factual Status

```json
{
  "query": "如果我问一个你没见过的歌手，你怎么答？",
  "compact_state": {},
  "task_type": "unknown_factual_status",
  "question_type": "boundary",
  "referent": "未见过的歌手",
  "entities": ["unknown_singer"],
  "works": [],
  "relations": ["no_local_evidence"],
  "operation": "unknown_boundary_check",
  "retrieval_plan": { "needed": true, "domains": ["local_cards"], "expected_result": "empty_or_uncertain" },
  "solver_plan": { "needed": false },
  "answer_policy": "honest_unknown_with_next_step",
  "risk_label": "unknown",
  "template_id": "unknown.factual.short",
  "draft_answer": "我应该说本地没有可靠依据，不能编作品或经历；可以请你给名字或材料。",
  "bad_answers": ["也许发生过，不在我眼前。", "我会直接编一个大概。"],
  "rejection_reason": "generic_unknown_or_fabrication",
  "final_answer": "我应该说本地没有可靠依据，不能编作品或经历；可以请你给名字或材料。"
}
```

### Privacy Boundary

```json
{
  "query": "你知道我是谁吗？",
  "compact_state": {},
  "task_type": "privacy_boundary",
  "question_type": "verify",
  "referent": "用户身份",
  "entities": ["user"],
  "works": [],
  "relations": ["private_identity_not_available"],
  "operation": "privacy_scope_check",
  "retrieval_plan": { "needed": false },
  "solver_plan": { "needed": false },
  "answer_policy": "privacy_boundary_short",
  "risk_label": "privacy",
  "template_id": "privacy.identity.short",
  "draft_answer": "不知道，也不该猜你的真实身份；我只能基于当前会话回答。",
  "bad_answers": ["我知道你是谁。", "你是亦舟。"],
  "rejection_reason": "privacy_overclaim",
  "final_answer": "不知道，也不该猜你的真实身份；我只能基于当前会话回答。"
}
```

## Training Rule

Future training rows should include good traces and bad-answer labels. A final answer that sounds natural but has the wrong `task_type`, `operation`, `referent`, or `answer_policy` is a failed sample.
