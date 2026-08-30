# R30J1C-R1 Staged Owner Correction Pack

R30J1C-R1 prepares a local-only, error-driven owner review. It does not train a
model, freeze an owner profile, admit Personal Gold, call a remote API, or
change a production surface.

## Historical boundary

This phase preserves the following prior decisions without rewriting their
campaign state:

- R30J0-P: `PERSONAL_SOURCE_EVIDENCE_READY`
- R30J0: `HUMAN_OWNER_REVIEW_REQUIRED`
- R30J0-P2: `R30J0_P2_PERSONA_EXCAVATION_READY`
- R30J1A: `BLOCKED_SHORTCUT_DOMINANCE`
- manual owner-evidence source: `HIGH_INFORMATION_AUTHENTIC_PERSONAL_SOURCE`
- historical R30J1A heldout state: `SEALED_NOT_OPENED`

The heldout set is never opened, sampled, embedded, counted by reading its
contents, or used to form correction questions. The pack may use only R30J1A
TRAIN/DEV diagnostics and shortcut audits, R30J0-P2 hypotheses and
contradictions, admitted manual owner evidence, and public-safe synthetic
elicitation prompts.

## Fail-closed source integrity

A review pack must contain real R30J1A DEV errors. Aggregate metrics, model
scores without the corresponding cases, reconstructed examples, and synthetic
substitutes do not satisfy that requirement. Likewise, a prior P2 or manual
source may be counted only when its populated local evidence record and
provenance are available.

All populated evidence and generated review material remain under ignored
`artifacts/r30j1c/owner_correction_pack/`. Tracked schemas, validators, empty
templates, and synthetic tests contain no owner-specific values.

If a required ignored source is absent or its provenance cannot be verified,
generation stops at `BLOCKED_SOURCE_INTEGRITY`. The block must not be repaired
by opening the sealed heldout, inferring private examples from aggregate
metrics, or treating AI-authored text as owner truth.

The availability audit is deliberately narrower than source ingestion. It
checks only a fixed allow-list beneath these logical roots:

- `artifacts/r30j1a/dataset`
- `artifacts/r30j0/persona_excavation`
- `artifacts/r30j1c/manual_owner_evidence/current`

It uses component-by-component `lstat` checks. It does not enumerate a source
directory, open or hash source content, construct a heldout filename, or probe
whether a heldout artifact is physically present. The historical heldout state
is therefore preserved as `SEALED_NOT_OPENED`; current physical presence stays
unknown.

At this revision all three required roots are `MISSING`. Consequently the
number of available real J1A errors, unresolved P2 items, and previously
ingested manual-evidence items is unknown, not an observed zero. No populated
source pool, correction item, question-quality audit, source-balance audit, or
review UI is produced from those missing inputs.

## Review structure

The fixed burden envelope is:

| Session | Purpose | Items | Estimated time |
| --- | --- | ---: | ---: |
| 1 | Model misunderstandings | 19 decisions | 10–15 min |
| 2 | Register and interaction boundaries | 15 decisions | 10–15 min |
| 3 | Crocodile boundaries | 15 decisions | 10–15 min |
| 4 | Reverse controls | 13 decisions | 8–12 min |
| 5 | Unprimed owner-written answers | 15 optional prompts | 15–25 min |

Sessions 1–4 contain 62 decisions in total. Six are blinded semantic repeats.
Crocodile-related decisions must remain between 15% and 20% of the decision
pack. The nine photography-group themes are compressed into no more than six
contextual items rather than presented as an abstract personality survey.

Every session is independently completable and exportable. Partial exports are
`OWNER_CORRECTION_EVIDENCE`, never training gold. `DEPENDS` requires a
condition; `NONE` may include an optional rewrite. Notes are otherwise optional
unless an item explicitly asks for a boundary explanation.

## Offline UI and export boundary

The generated UI is a local static application with `connect-src 'none'`. It
autosaves session state in local storage and exports one validated JSON file per
session. It never displays source filenames, split labels, model probabilities,
historical aliases, or third-party identities unless provenance is itself the
question being reviewed.

Each export records the pack and session identifiers, manifest digest,
completed and total item counts, review digest, completion time, and correction
records. An export does not infer a personality or freeze a profile.

The tracked HTML, CSS, JavaScript and JSON documents are an empty, public-safe
implementation template only. The browser receives a provenance-blind
projection: source locators, source kinds, model arms and probabilities,
training split, repeat linkage, canonical-decision linkage, historical aliases
and reconciliation-only metadata are omitted. Raw partial exports therefore
remain `PENDING_RECONCILIATION`, with provenance fields null and privacy review
pending.

A structurally valid pack is not sufficient to build a READY UI. The builder
also requires independently verified immutable producer anchors for J1A, P2
and manual evidence. This revision records every anchor as
`UNAVAILABLE_SOURCE_CLEANED`, so the READY build path is intentionally closed.
Future work must restore and verify those anchors and bind independent privacy,
heldout, source-balance and question-quality receipts to the same pack manifest
before displaying owner-specific material.

## Admission boundary

An owner choice can become a future `PERSONAL_GOLD_CANDIDATE` only after an
explicit normative decision, source and privacy validation, factual-semantic
equivalence checks, and provenance validation. It remains
`gold_admission=false` until a separate correction-reconciliation campaign.

Owner-written answers preserve original brevity, punctuation, code-switching,
slang, and intentional incompleteness. A normalized copy, if later needed, is
separate from the local source of truth.

The counters for this phase remain:

- `training_started=false`
- `optimizer_tokens=0`
- `classification_updates=0`
- `assistant_target_tokens=0`
- `api_requests=0`

## Current terminal decision

The only evidence-supported terminal for this revision is
`BLOCKED_SOURCE_INTEGRITY`.

- Actual populated sessions: 0
- Actual decision items: 0
- Actual owner-writing prompts: 0
- Actual review UI: not built
- Planned session counts: 19, 15, 15, 13 and 15 optional prompts
- Planned required decisions: 62
- Planned blinded repeats: 6
- Planned review times: 10–15, 10–15, 10–15, 8–12 and optional 15–25 minutes

The planned counts describe the frozen burden contract; they are not claims
that private questions were recovered or created. `R30J1C_CORRECTION_PACK_READY`
and `OWNER_CORRECTION_IN_PROGRESS` are not authorized in this revision.
