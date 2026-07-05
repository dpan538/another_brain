# R26F Project-Meta Rejection Audit

R26F is audit-only. It does not train, run tokenizer dry-run, alter corpus rows, change R26E metadata, or promote any omitted row. Rows 51-100 remain excluded.

## Result

- project-meta rejected candidates: 10
- affected source rows: 2, 9, 16, 29, 47
- rejection fully justified rows: 16
- likely keep/review rows: 2, 9, 29, 47

R26E's project-meta rule was intentionally conservative but overbroad for some first-50 user answers. Questions about phase, next training step, Codex, Vercel, or implementation details should remain excluded. Questions about what another_brain is, what kind of model it is, why it is not generic客服 behavior, or product success boundaries are product-identity/boundary material and should not be automatically discarded.

## Row Classification

| row | module | candidate count | classification | rejection justified | rationale |
| --- | --- | --- | --- | --- | --- |
| 2 | 朋友日常判断 | 2 | project_identity_answer_keep_candidate | false | The prompt asks what another_brain is; it is product identity material, not a phase or implementation-control row. |
| 9 | 朋友日常判断 | 2 | needs_user_review | partial | The prompt uses training/model language, but the answer expresses the user's model-purpose stance rather than a concrete next-step instruction. |
| 16 | 关系语境 | 2 | true_training_meta_exclude | true | The prompt is explicitly from Codex about whether to continue training, so exclusion as training-control metadata is justified. |
| 29 | 不答与边界 | 2 | product_boundary_answer_keep_candidate | false | The prompt asks for a success guarantee and the answer sets a product/life boundary; it is not a concrete training-meta instruction. |
| 47 | 怪问题抽象 | 2 | product_boundary_answer_keep_candidate | false | The prompt asks how a model avoids客服-like behavior; it is a product boundary and behavior answer, not phase or deployment metadata. |

## Recommendation

- Keep row 16 excluded unless a later approval explicitly wants training-control answers in a separate non-product corpus.
- Review rows 2, 9, 29, and 47 under R26G before any re-promotion; they look like product identity or boundary material rather than unsafe training-meta rows.
- Do not re-promote anything during R26F.
