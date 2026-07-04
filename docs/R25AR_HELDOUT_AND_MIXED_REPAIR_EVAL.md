# R25AR Heldout And Mixed-Repair Eval

R25AR heldout replay used the ignored JSON checkpoint and heldout sequences only. It did not train.

Aggregate heldout:

- Heldout loss: 6.8565
- Heldout sequences: 96
- Replayable checkpoint used: yes, ignored artifact only

Language bucket heldout loss:

- zh: 6.0836 across 63 sequences
- mixed: 8.0400 across 24 sequences
- en: 8.1583 across 9 sequences

Bucket gaps:

- mixed minus zh: 1.9564
- en minus zh: 2.0747

Compared with R25AO, R25AR did not improve the mixed or English gap, and total heldout loss regressed by about 1.0746. The repaired sampler succeeded structurally by increasing mixed coverage to 25%, but quality did not improve in this pilot.

Risk-focus coverage was present in train:

- mixed: 96 rows
- repair_after_weak_answer: 202 rows
- tool_status_honesty: 123 rows
- bounded_judgment: 247 rows
- local_first_static_browser_reasoning: 91 rows

R25AR therefore points to a quality/content or optimization issue, not simply a missing mixed-row sampling issue.
