# R28QA1 Static Q4 QA

Base: `origin/r28rt2-readable-q4-runtime`.

Static q4 QA status:

- q4 asset checksums are verified from the committed R28M1 manifest.
- RT2 readable generation smoke is included when RT2 metadata declares `readable_generation_smoke_passed=true`.
- Runtime mode remains `static_q4_experimental`.
- The browser UI keeps fallback available and displays fallback reason when the static UI worker cannot embed the TS q4 runtime package.
- Output quality remains `quality_not_ready`; QA1 is runtime/manual QA, not quality admission.

The QA matrix is intentionally static/local. It does not train, does not submit new model assets, does not add backend inference, and does not call an external model service.
