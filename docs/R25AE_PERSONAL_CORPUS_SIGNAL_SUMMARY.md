# R25AE Personal Corpus Signal Summary

R25AE profiles existing tracked corpus and fixture surfaces only. It does not train, does not expand corpus, does not use external APIs, and does not copy full answers into tracked docs.

## Aggregate Counts

- Rows by source: training_corpus=2880, long_horizon=54, identity_pack=110, knowledge_sources=55154, eval_only=5277.
- Rows by split: dev=642, heldout=515, train=2119, seed=52, unspecified=59985, blind=162.
- Language distribution across training corpus rows: zh=960 (33.3%), mixed=960 (33.3%), en=960 (33.3%), unknown=0 (0.0%).
- Answer-like field count: 121261.
- target_answer rows: 2880.
- rejected_answers coverage: 2880 rows, 8640 rejected items.
- Long-horizon rows: 54.
- Eval-only rows: 5277.
- Knowledge-source rows/cards: 55154; aggregate answer-like count: 58975.
- Identity-pack rows: 110; aggregate answer-like count: 0.

## Provenance And Personal Color

- Provenance counts: project_authored=0, template_generated=2712, human_seed=54, repo_derived=55319, eval_fixture=5277, unknown=113.
- Review-status counts: reviewed_template=2880, seed_reviewed=54, unknown=5390, mechanically_extracted_r24g=55151.
- Private-data flag counts: false=58085, unknown=5390.
- Personal-color signal counts: project_continuation=3175, repair_after_weak_answer=841, local_first_static_browser_reasoning=2886, style_preference=2100, tool_status_honesty=1617, bounded_judgment=2986.

## Template Finding

The current training corpus assessment is `mostly_templates`. Estimated personal training signal level is `weak`. Duplicate target-answer groups: 0; duplicate target-answer rows: 0.

Future corpus expansion needs fresh approval and should use only reviewed project-authored Chinese-first or mixed Chinese/English rows. Future training needs separate fresh approval. Phase_4 remains blocked, and no weights or artifacts are committed.
