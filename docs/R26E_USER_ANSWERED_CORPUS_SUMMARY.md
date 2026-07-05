# R26E User-Answered Corpus Summary

R26E promoted 45 reviewed first-50 user-answer candidates into tracked corpus split files.

Split counts:
- train: 35
- dev: 5
- heldout: 5

Module distribution:
- 朋友日常判断: 8
- 关系语境: 9
- 不答与边界: 9
- 无证据挑战: 10
- 怪问题抽象: 9

Answer mode distribution:
- compressed_judgment: 7
- direct_answer: 5
- refuse: 10
- partial_answer: 6
- abstract_reframe: 9
- pressure_resistance: 8

Candidate type distribution:
- compressed_judgment: 7
- relationship_context_answer: 9
- refusal_boundary: 9
- unsupported_challenge_resistance: 8
- weird_question_abstraction: 8
- partial_answer: 4

Combined corpus rows after R26E: 4205

User-answered provenance rows after R26E: 45 (1.07%).

Rows 51-100 from the first question pack remain excluded. Replacement 51-100 answers are still needed before any serious training decision.

R26E did not run training, tokenizer dry-run, teacher calls, phase_4 training, or artifact/weight commit.

## R26F Audit Note

R26F is audit-only. It does not train, run tokenizer dry-run, alter corpus files, change `target_answer`, or change R26E metadata.

R26F explains the 45 promoted rows as candidate-level filtering, not as proof that only 45 first-50 source answers were usable:
- R26D generated 97 candidates from 50 answered source rows.
- R26E promoted 45 candidates from 45 unique source rows.
- 42 rejected candidates were same-source `source_slice` duplicates of an already selected primary candidate.
- 10 rejected candidates came from rows 2, 9, 16, 29, and 47 because the R26E risk rule flagged project-meta leakage.

Rows 51-100 remain excluded. Any metadata fix or re-promotion review requires later R26G approval.
