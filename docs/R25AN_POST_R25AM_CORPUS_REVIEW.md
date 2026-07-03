# R25AN Post-R25AM Corpus Review

R25AN is a review step for the R25AM-expanded corpus. It may run one tokenizer dry-run readiness pass and may evaluate whether a future sampler can produce zh >= 70%, mixed around 20%, and en <= 10% for a bounded micro-cycle.

R25AN does not train a decoder, does not run a small pilot, does not run phase_4, does not commit tokenizer artifacts, and does not commit weights. It does not read private sources, root PDFs/DOCX, or `data/public_ingestion/`.

The expected output is a corpus quality report, sampler feasibility report, tokenizer readiness report, and next-step decision. R25AO remains a future approval-only micro-cycle design path, not an automatic training step.
