# R26F should_answer Semantics Audit

R26F is audit-only. It does not change `should_answer`, `target_answer`, corpus files, or R26E metadata. Rows 51-100 remain excluded. Any metadata correction requires later R26G approval.

## Result

- raw CSV `是否回答` values for rows 1-50: {"[blank]":50}
- raw blank/null count: 50
- promoted `should_answer` counts: {"false":45}
- promoted non-empty `target_answer` count: 45
- rows where `should_answer=false` but `target_answer` is non-empty: 45

The likely parser issue is that blank optional `是否回答` values were mapped to boolean `false`. In R26E this makes all promoted rows report `should_answer=false` despite non-empty user-authored target answers.

## Answer Mode Counts

| answer_mode | count |
| --- | --- |
| compressed_judgment | 7 |
| direct_answer | 5 |
| refuse | 10 |
| partial_answer | 6 |
| abstract_reframe | 9 |
| pressure_resistance | 8 |

## Recommendation

- no R26F corpus or metadata change
- R26G should perform a metadata-only fix or schema reinterpretation after explicit approval
- do not rewrite target answers into generic assistant answers
