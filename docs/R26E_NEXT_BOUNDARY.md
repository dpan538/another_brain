# R26E Next Boundary

R26E added reviewed first-50 user-answer rows to the tracked corpus. R26F then audits the promotion trace only.

It does not authorize:
- decoder training
- small-pilot training
- tokenizer dry-run
- phase_4 scaled training
- corpus generation from rows 51-100
- teacher or Doubao calls
- raw CSV commit
- artifact or weight commit

R26F explains that the 45 promoted rows are 45 unique source rows after candidate-level filtering, not proof that only 45 source answers were usable. It keeps rows 51-100 excluded and does not alter R26E corpus metadata.

The next correction step is not automatic. R26G requires fresh explicit approval before any metadata-only `should_answer` fix or manual re-promotion review of omitted first-50 rows. Replacement 51-100 intake remains a separate later approval path.
