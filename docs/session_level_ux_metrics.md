# Session-Level UX Metrics

Single-prompt correctness is not enough. another_brain must avoid session-level mechanical feel: repeated templates, repair loops, affordance overtrigger, and repeated answer plans.

## Metrics

| metric | meaning |
| --- | --- |
| response_mode_entropy | Diversity of typed response modes across a mixed session. Very low entropy suggests mechanical collapse. |
| same_template_streak | Consecutive reuse of the same surface template or fallback frame. |
| fallback_streak | Consecutive illegal or generic fallback-like outputs. Target is 0. |
| repair_overtrigger_rate | Normal follow-ups/simplify/rewrite turns incorrectly routed to repair. |
| affordance_overtrigger_rate | Explicit questions, help, corrections, or hard boundaries incorrectly routed to UI affordance. |
| mobile_density_score | Fraction of mobile answers within max chars, sentence count, list item, and punctuation budgets. |
| contextual_binding_score | Fraction of contextual/elliptical turns bound to the correct active topic/referent. |
| user_frustration_proxy | Challenge/correction/repeated-restatement signals caused by poor grounding or bad response mode. |

## Release Targets

- same_template_streak_max <= 1 for generic fallback templates
- duplicate_answer_rate <= 0.02
- response_mode_entropy_avg >= 2.2 on mixed sessions
- fallback_streak_max = 0 illegal
- repair_overtrigger_rate <= 0.02
- affordance_overtrigger_rate <= 0.03
- contextual_binding_accuracy >= 0.92
- mobile_density_pass_rate >= 0.95

These metrics complement endpoint correctness. The goal is not just "answers are valid"; the goal is "short, concrete, contextual, non-repetitive, and safe across a session."

## Rejected Frontend Mock Cases

### 2026-06-17: Crocodile Halftone Standalone Mock

- Attempt: a standalone `artifacts/crocodile_halftone_mock.html` sample explored a visible pixel-crocodile background, orange/magenta halftone fields, breathing states, quiet affordance, and answer-state controls before touching the production frontend.
- Result: rejected. The mock made the crocodile symbol too literal and decorative, shifted the surface toward a poster layer, and weakened the existing minimal answer-machine feel. The background competed with the input instead of acting as a restrained responsive signal.
- Tooling note: direct `file://` preview was blocked by the in-app browser URL policy. A local `localhost` preview worked, but automated text entry failed because the browser virtual clipboard was unavailable. State-button clicks worked and no console errors were observed.
- Product lesson: future frontend exploration should start from the existing `web/` interaction grammar and test small state-layer changes first: subtle symbol fragments, restrained halftone only during thinking or quiet affordance, and mobile readability checks before any full-background identity mark.
- Action: do not integrate this mock. Delete the sample artifact after recording this log entry.
