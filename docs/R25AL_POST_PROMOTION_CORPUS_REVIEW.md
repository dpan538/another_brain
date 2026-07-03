# R25AL Post-Promotion Corpus Review

R25AL reviews the R25AK-promoted corpus and tokenizer readiness for a later bounded Chinese-personal micro-cycle review. It may run a tokenizer dry-run only; it does not run decoder training, small-pilot training, long-term training, product-scale training, or phase_4.

The R25AL review keeps tokenizer artifacts ignored under `artifacts/training_os/tokenizer_dryrun/r25al/`. No tokenizer artifacts, weights, root PDFs/DOCX, `data/public_ingestion/`, `private_sources/`, or unrelated local files are committed.

R25AK improved the Chinese-first direction of the tracked corpus, but the combined corpus can still remain below the future `zh >= 70%` target unless a later approved micro-cycle uses Chinese-first sampling. R25AM requires fresh explicit approval and remains inert by default.
