# R30J1C Manual Owner Evidence Method

## Scope

R30J1C may accept a manually supplied, owner-attested conversational source as
high-information evidence for a later owner-correction workflow. This contract
does not turn a supplied chat into personal gold. It does not modify a prior
campaign state, reopen a heldout set, train a model, freeze a profile, implement
a persona mode, alter production behaviour, call an API, export q4 weights, or
deploy anything.

The source itself, its identifiers, raw assets, hashes, transcript, alias map,
derived hypotheses, correction questions, and owner review results remain under
ignored local artifacts. Tracked files contain only generic contracts, empty
templates, public-safe methodology, validators, aggregate receipts, and
synthetic tests.

## Evidence classes

Four evidence classes must remain distinct:

1. `CURRENT_EXPLICIT_OWNER_ASSERTION` records owner-attested provenance or
   context. High assertion confidence does not make a context fact a model
   feature or a global preference.
2. `OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE` is a direct message body attributed
   to the owner by an owner-supplied chat attestation. It is descriptive owner
   evidence after privacy and de-identification review. It is not automatically
   normative.
3. `PEER_RECEPTION_EVIDENCE` records how one or more peers received a behaviour.
   Convergence can increase confidence that the reception pattern occurred, but
   it has zero normative preference weight and is never owner-authored text.
4. `PEER_PLAYFUL_MYTHOLOGY` records group play or character mythology. It has
   zero owner-identity and preference weight. It may inform an anti-caricature
   review boundary, never an identity fact.

Authorship confidence, descriptive confidence, normative confidence, and
generalization confidence are separate quantities. A high-confidence owner
attribution can still support only a narrow descriptive hypothesis. A repeated
peer description can have high reception convergence while normative
confidence remains zero.

The existing `OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE` class is not reused. It
is tied to a different answer-intake process and attestation. Manual chat
evidence uses `OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE` with
`OWNER_SUPPLIED_CHAT_SCREENSHOT_RECORD`.

## Local artifact layout

A populated source may use this ignored layout:

```text
artifacts/r30j1c/manual_owner_evidence/current/
  raw/
    screenshots/
  provenance/
    source_manifest.json
    owner_assertions.jsonl
    alias_timeline.json
    speaker_map.private.json
  working/
    transcript_parsed.local.jsonl
  deidentified/
    transcript_v1.jsonl
  evidence/
    owner_utterance_index.jsonl
    peer_reception_ledger.jsonl
    hypothesis_candidates.jsonl
  split/
    source_family_manifest.json
  audit/
    privacy_deidentification.json
    authorship_quote_separation.json
```

The local source identifier may be human-readable because the whole directory
is ignored. Any envelope or cross-artifact reference uses an opaque local
reference. Raw paths and content hashes stay in the local provenance manifest
and never enter a tracked receipt.

Future correction items remain in the same ignored R30J1C source root:

```text
artifacts/r30j1c/manual_owner_evidence/current/correction/
  correction_items.jsonl
  review_export.local.json
```

The source is visible during contract and question design, so it is not an
independent blind heldout family. A future owner-reviewed heldout must come from
separate source families that did not shape the hypotheses or correction pack.

## Raw container and derived records

A screenshot set containing owner and peer messages is a mixed private
container. It is `ANALYSIS_ONLY`; the container itself is never classified as
owner-authored and is never optimizer eligible. Image privacy requires a manual
gate because a text-only sensitive-value scanner cannot prove that names,
avatars, timestamps, or other visual identifiers are absent.

Safe derivation creates separate message records. The deidentified record uses
`OWNER` or stable anonymous peer identifiers, a sequence index instead of an
exact timestamp, and no avatar or original username. Adjacent messages that
form one conversational burst share a turn-cluster reference, preventing an
isolated line from being mined as a catchphrase without its local interaction
shape.

Every parsed message distinguishes:

```text
speaker
body
quoted_speaker
quoted_body
```

Only a direct visible body whose speaker is the owner can be admitted as owner
writing. A quote block is context-only, even when its quoted speaker is the
owner. If the same text also appears as a direct visible owner message, the
direct message is the canonical attribution and the quote copy is excluded.
Peer message bodies are never optimizer input. If future training needs the
speech act that prompted an owner reply, it needs a separately reviewed,
public-safe reconstruction rather than the raw peer text.

Media-only rows are not text evidence. Privacy rejection, unresolved speaker
attribution, or a failed quote boundary makes the row inadmissible.

## Alias continuity

An owner-attested alias timeline is provenance disambiguation only. Each event
records an era code, a local alias value, and whether it refers to the same
owner. The actual aliases stay local. Aliases are not automatically separate
personas, are not model input, and cannot become identity labels or catchphrase
features.

## Hypothesis epistemics

This source creates a supplemental hypothesis delta; it does not rewrite the
frozen P2 catalog or terminal state. Each hypothesis must include:

- a generic opaque hypothesis and latent-family reference;
- an observable behaviour code;
- direct and negative boundaries;
- compatible and forbidden registers;
- opaque evidence references;
- separate authorship, descriptive, and normative confidence;
- a bounded generalization scope and optional topic-slice reference;
- `is_runtime_mode=false`;
- `is_owner_identity_truth=false`;
- `profile_frozen=false`;
- `owner_review_required=true`; and
- `allowed_for_training=false`.

Normative confidence remains zero until an owner-correction process establishes
an explicit preference. Multiple behavioural dimensions that appear related
remain a latent-family hypothesis, not multiple runtime modes. An epistemic
performance such as playful uncertainty must continue to use the existing P2
epistemic distinctions and cannot overwrite real uncertainty, factual stakes,
or a serious request.

A hobby or object-discussion context is a topic slice, not automatically a new
model register. This matters because topic and proper-noun shortcuts are not
evidence of a source-generalizing personal representation.

## One-family split contract

The complete conversation is one source family. Direct owner bodies, peer
annotations, controlled variants, contrast candidates, and later correction
items all share that family. The conservative initial representation may bind
document, idea, and family references to the same opaque value. No adjacent
message, quote, mutation, or correction derived from the conversation may
cross train, dev, or heldout boundaries.

This family is not heldout eligible because it is already used to formulate the
research hypotheses and correction questions.

## Owner correction contract

Correction questions test conditions and boundaries rather than asking the
owner to ratify a personality adjective. A local item records an information
goal, question family, register context, optional topic slice, opaque target and
evidence references, and a local question. The allowed actions are `ACCEPT`,
`REJECT`, `EDIT`, `DEPENDS`, and `UNSURE`; `DEPENDS` requires a condition.

The tracked correction template contains no question, target value, evidence
reference, decision, or owner answer. The populated item remains
`OWNER_REVIEW_REQUIRED`, `gold_admission=false`, `heldout_eligible=false`, and
`allowed_for_training=false`. Owner answers belong in a separate ignored
review export.

## Admission sequence

The fail-closed order is:

```text
ingest local raw assets
→ bind local provenance and hashes
→ parse direct bodies and quote blocks
→ de-identify and privacy review
→ audit authorship and quote separation
→ lock one source family
→ build descriptive hypotheses
→ create owner-correction items
→ collect owner confirmation
→ make an explicit gold-admission decision
→ run contamination and split checks
→ obtain a separate training authorization
```

Failure or incompleteness at any step leaves the material review-only. This
source alone never authorizes optimization.

## Public boundary

The following values are never tracked:

- the actual source identifier, filename, local path, or content hash;
- raw screenshots, avatars, usernames, timestamps, transcript bodies, quotes,
  or deidentified excerpts;
- actual alias values or the private speaker map;
- owner-specific context, object, purchase, or identity facts;
- actual hypothesis codes, confidence values, evidence references, or persona
  conclusions;
- actual correction questions, answers, review decisions, or gold labels; and
- any owner profile, private inventory, or personal heldout material.

A tracked engineering receipt may contain only aggregate counts and invariant
booleans: the number of manual sources and evidence classes, correction-item
count, quote/de-identification/single-family pass flags, zero third-party
optimizer rows, zero training tokens, and booleans confirming that raw values,
source identifiers, paths, and hashes were not emitted.
