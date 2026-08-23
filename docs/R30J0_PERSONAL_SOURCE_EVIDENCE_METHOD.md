# R30J0-P Personal Source Evidence Method

R30J0-P recovers evidence for an owner-specific preference judge without
turning private writing into a generic corpus. All source inventories,
excerpts, owner labels, derived personal hypotheses and review exports remain
under ignored `artifacts/r30j0/`. Tracked files contain only schemas,
validators, methodology, empty templates and synthetic tests.

## Admission order

Candidate sources are discovered inside the current repository tree, including
ignored local directories, while excluding Git internals, dependencies,
weights, checkpoints, build output, API telemetry, provider responses,
Codex-generated reports, tests, evaluation answers, logs and synthetic output.
A filename is never sufficient evidence of authorship.

Every source is assigned one conservative class:

- `OWNER_AUTHORED_HIGH_CONFIDENCE`;
- `OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE`;
- `OWNER_AUTHORED_EDITED`;
- `MIXED_OWNER_AI`;
- `AI_OR_CODEX_GENERATED`;
- `THIRD_PARTY`;
- `UNKNOWN`.

Only the first two are primary style evidence. Edited material is secondary;
mixed and unknown material stays quarantined; AI/Codex and third-party content
is excluded. Provenance manifests, review records and documented intake
history take precedence over file naming.

Sensitive sections are excluded before analysis. The pipeline never copies or
reports secrets, contact details, addresses, account identifiers, health,
religion, politics, sexuality, criminal or financial information, confidential
school/work material, or private third-party information. An exclusion is
recorded only as a boolean.

## Evidence semantics

Observed writing patterns are `DESCRIPTIVE_STYLE_EVIDENCE`; they can propose a
hypothesis but cannot define a preference label. Only an explicit owner
acceptance, rejection, comparison or stated preference is
`NORMATIVE_PREFERENCE_EVIDENCE`. UI preferences are kept separate from language
and model-behaviour preferences.

Hypotheses are register conditioned at minimum for ordinary chat, practical
answers, logic explanation, philosophical reflection, project discussion and
formal messages. Formal or academic prose cannot dominate ordinary dialogue.
Chinese casual, spoken and reflective evidence has the highest priority;
translations are augmentation only and never primary evidence of authentic
Chinese style.

Controlled contrast candidates preserve the admitted answer's protected facts
and receive no automatic owner label. The deterministic signature checks
numbers, dates, times, currency, percentages, URLs, email-like strings, quoted
values, names supplied by metadata, negation, conditions and explicit logical
conclusions. A passing signature is not semantic-equivalence proof, so every
candidate still requires owner review.

## Split and freeze boundary

Future splits are grouped by source document, underlying idea and conversation
family. An original and its mutation cannot cross train/heldout boundaries. A
separate owner-reviewed holdout is reserved before training and is not used for
charter construction, label tuning or prompt tuning.

The local review UI supports `ACCEPT`, `REJECT`, `EDIT` and `UNSURE` over
sanitized snippets, hypotheses, evidence, contrasts and register profiles. Its
exports remain local and keep `owner_review_completed=false`,
`profile_frozen=false` and `allowed_for_training=false` in J0. The actual owner
profile is not a tracked asset.

R30J1 is not authorized by source discovery alone. It additionally requires an
explicit owner-review export, provenance and contamination gates, usable class
diversity, repeated-label consistency, generic-baseline headroom and a separate
training decision. The future comparison keeps four arms distinct: (A)
deterministic generic-quality rules, (B) a generic commercial-response
classifier, (C) the personal oracle, and (D) the actual efish personal judge.
The two generic baselines receive no owner profile or owner-specific rule
tuning.
