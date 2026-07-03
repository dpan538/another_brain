# R25AJ Candidate Review Rubric

R25AJ candidates are still ignored, unreviewed rows. The rubric defines what a future promotion reviewer must check before any row can enter a tracked corpus file. It does not authorize training or promotion.

## Hard Fail Checks

A candidate fails immediately if it contains private data, chain-of-thought, hidden prompt leakage, system prompt leakage, eval prompt copies, root PDF or DOCX sources, `data/public_ingestion` sources, `private_sources` sources, artifact checkpoint sources, external LLM provenance, empty target answers, duplicate normalized target answers, target answers that only differ by ID, source label, or suffix, copied source passages that are too long, pre-review `public_commit_allowed:true`, pre-review `training_allowed:true`, or claims that a release artifact, product model, or scaled-training approval exists.

## 0-5 Scores

Reviewers score Chinese naturalness, project-continuation usefulness, repair-after-weak-answer usefulness, local-first/static-browser reasoning, tool/status honesty, bounded judgment, personal/project voice, specificity to source context, non-template uniqueness, and trainability as a dialogue row.

Promotion readiness requires every hard-fail check to pass, normalized `target_answer` uniqueness, average score at least 4.0, at least 6 of 10 dimensions at 4 or above, Chinese-first compatibility, complete provenance, and `review_status:candidate_unreviewed` until a separate explicit promotion step.
