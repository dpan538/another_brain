# Contextual Questioning Contract

A contextual question is a committed user turn whose intended answer is underdetermined in isolation but becomes recoverable by binding missing arguments to active session state.

中文：上下文提问，是一种已提交的用户轮次：它单看当前句子不足以确定目标答案，但只要把缺失参数绑定到当前会话中的活跃状态，就可以被正确解释。

## Turn Kinds

- `explicit_new_question`: a self-contained new question.
- `contextual_followup_question`: a question that binds to active entity, work, domain, list, pair, or last answer.
- `elliptical_question`: a short continuation such as "那这本呢？".
- `repair_question`: a challenge or repair request targeting the previous assistant answer.
- `rewrite_or_simplify_request`: a transform over the previous answer.
- `declaration_with_signal`: feedback, correction, or topic shift.
- `quiet_declaration`: pause, low-action affect, or unfinished thought.
- `hard_boundary_utterance`: privacy, copyright, source, self-harm, or safety boundary.

Rules:

- Explicit questions must not become quiet affordance.
- Normal follow-ups with active context must not trigger repair.
- Simplify/rewrite requests bind to the last answer.
- Clarification is allowed only after binding fails and named candidates remain.

