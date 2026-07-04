# R26D Question Pack Exclusion Guard

The R26D guard enforces the R26C/R26D boundary for `another_brain_question_pack_001`.

## Hard Boundary

- IDs 1-50: candidate_review_only
- IDs 51-100: excluded_from_training

The guard fails if rows 51-100 appear in R26D candidates, active training corpus files, current corpus manifests, tokenizer configs, teacher probe configs, future corpus expansion plans, or staged raw CSV/XLSX files.

Current result: pass.

R26E extends this guard to the promoted user-answer corpus files. Source rows 51-100 remain forbidden after promotion.
