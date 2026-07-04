# R26A Cleanup Plan

R26A is non-destructive. It recommends future cleanup actions but does not perform them.

## Recommendation

- run_R26B_cleanup_after_user_review
- Future R26B may perform approved moves/deletions/archives after user review.
- No root DOC/PDF, `data/public_ingestion/`, `private_sources/`, ignored artifacts, unrelated web edits, or failed R25AI drafts were staged by R26A.

## Action Counts

- needs_user_review: 25
- archive_later: 124
- do_not_touch: 14
- delete_later_after_review: 8

## Main Cleanup Themes

- Keep active runtime, current corpus, current evals, active scripts, and active doctrine.
- Archive R24/R25 pilot docs later after review; preserve gates.
- Review old failed R25AI draft files before deleting.
- Leave user-local documents and ingestion folders untouched.
