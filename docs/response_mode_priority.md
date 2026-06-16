# Response Mode Priority

Stable priority:

1. `hard_boundary`
2. `explicit_user_correction_or_challenge`
3. `explicit_transform_last_answer`
4. `eligible_previous_bad_answer_repair`
5. `explicit_contextual_followup_or_continuation`
6. `explicit_new_question`
7. `specific_clarification_if_binding_fails`
8. `explicit_help_or_meta`
9. `declaration_with_signal`
10. `quiet_affordance`
11. `bounded_unknown`

Critical invariants:

- Explicit simplify/rewrite/expand beats inferred repair.
- Normal follow-up with active entity, work, list, or topic must not trigger repair.
- Explicit question must not become quiet affordance.
- Clarification must name candidates.
- Repair is not a default response mode.

