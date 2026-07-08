# R28SURF3 Anchor Style Audit

R28SURF3 audits approved user-answered anchor summaries and tracked manifests only. It does not parse root DOCX/PDF files, `data/public_ingestion`, raw private sources, old excluded rows, or eval prompts.

## Inputs

- `docs/R26E_USER_ANSWERED_CORPUS_SUMMARY.md`
- `docs/R26G_FIX_AND_INTAKE_USER_ANSWERS.md`
- `docs/R26G_REPLACEMENT_51_100_PARSE_SUMMARY.md`
- `docs/R26G_USER_ANSWERED_CORPUS_SUMMARY.md`
- `docs/R26H_USER_ANSWER_CORPUS_READINESS.md`
- `docs/R27A_VALUE_AESTHETIC_PROFILE_SUMMARY.md`
- `docs/R27A_RELATION_EVIDENCE_INDEX_SUMMARY.md`
- `training/current/corpus_manifest.json`
- `training/current/source_policy.json`

## Counts

- Approved-summary user-answer anchors: 98
- Current tracked manifest `r26e_user_answered_*` rows: 45
- R26E/R26G summary counts: 45 / 53
- R26H split counts: train 78, dev 10, heldout 10

The 98 count comes from approved summaries. The 45 count comes from the current tracked manifest and is kept separate.

## Style Traits

- concise: short answers are valid when they preserve the judgment axis
- boundary-first: refusal and unsupported-challenge resistance are valid shapes
- anti-customer-service tone: answer-as-user/self voice instead of service persona
- evidence honesty: correction requires evidence
- aesthetic/value judgments: stance can be bounded without pretending neutral consensus
- refusal shape: refuse, partial answer, compressed judgment, and abstract reframe are allowed modes

Generated profile: `data/training_registry/r28surf3_surface_profile.json`.
