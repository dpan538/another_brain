# Response Mode Manager Contract

Repair is not a default response mode. Repair is only allowed when the previous assistant turn is known-bad, rejected, rewritten by a firewall, or explicitly challenged by the user.

中文：repair 不是默认回复模式。只有上一轮 assistant 明确是坏 fallback、被 verifier 标记为错误、被 firewall 改写，或用户明确指出答偏/错了时，才允许进入 repair。

## Response Modes

- `direct_answer`: answer a new explicit question.
- `followup_answer`: answer a continuation bound to the active entity, work, or domain.
- `rewrite_last_answer`: restate the previous answer under a user instruction.
- `simplify_last_answer`: make the previous answer shorter and clearer.
- `expand_last_answer`: add detail to the previous answer.
- `fallback_repair`: acknowledge and repair a known-bad previous fallback.
- `specific_clarification`: clarify only with named alternatives.
- `help_how_to_ask`: give examples for how to ask.
- `quiet_affordance`: hold space without creating an assistant message.
- `boundary_answer`: answer privacy, copyright, or safety boundaries.
- `bounded_unknown`: say what is unknown without pretending it is an event.
- `solver_answer`: use deterministic reasoning solvers.
- `culture_answer`: use culture cards, entity binding, question type, planner, and verifier.
- `persona_method_answer`: select method/style boundaries without overriding correctness.

## Priority

1. `hard_boundary`
2. `explicit_fallback_repair`
3. `explicit_rewrite_or_simplify`
4. `actionable_followup`
5. `question_like_new_or_continuing`
6. `help_how_to_ask`
7. `quiet_affordance`
8. `bounded_unknown`

## Rules

Normal follow-up must not trigger repair. If the user says "他的歌曲有什么代表性？" after a Luo Dayou answer, the mode is `followup_answer`, not `fallback_repair`.

Simplify/rewrite requests must not trigger repair. "是否能简单一点？" means `simplify_last_answer`.

`fallback_repair` is allowed only when `lastAnswerQuality` is `bad_fallback`, `verifier_rejected`, `firewall_rewritten`, or `accepted_but_too_generic`, or when the last assistant answer is a bare generic fallback and the user explicitly challenges it.

"我刚才没有接住问题" is legal only inside `fallback_repair`. It is forbidden for ordinary culture follow-ups, simplify requests, list requests, and known-domain answers.

Music answers must not leak visual-art or literature method phrases unless the user explicitly asks for cross-domain interpretation. Ordinary music questions should use works, themes, historical context, and style axes.
