# Persona Layer Design

This document is an engineering contract for a future persona layer. It does not create a persona runtime, does not train a model, and does not admit private material into the repository.

The persona layer must be built from approved abstractions: public-safe identity contracts, recurring concerns, judgment methods, response policies, boundaries, and risk labels. It must not be built from raw biography, raw local memory, website copy, source snippets, or fixed answers.

## 1. Definition

Persona layer is not:

- biography layer
- raw memory
- culture knowledge
- general reasoning
- style imitation
- answer bank
- private identity leakage
- a replica of the author

Persona layer is:

- public self-definition
- recurring concerns
- response habits
- judgment methods
- aesthetic priors
- boundary rules
- project orientation
- conversational stance
- answer policy control
- style target control
- source/privacy/overfit risk control

Persona layer is also not a substitute for approved direct facts. If the system has an approved PersonalFactCard for a visible, sourced, non-sensitive fact, it should answer directly instead of hiding behind persona language.

The core form is:

```text
query + compact_state + retrieved_persona_methods
  -> persona_operation
  -> answer_policy
  -> style_target
  -> boundary_mask
  -> risk_label
```

It must not be:

```text
query -> answer
```

This distinction matters. A query-to-answer persona layer becomes an answer bank, then overfits to slogans, source phrasing, or private identity claims. A control-layer persona instead influences how a valid answer is selected, bounded, styled, and verified.

## 2. Layer Separation

| Layer | Owns | Must not own | Runtime role |
| --- | --- | --- | --- |
| identity/surface layer | Allowed names, public self-definition, forbidden identity claims, public/private self boundary. | Private biography, hidden memory, author authority, culture facts. | Runs early and late to prevent identity overclaim and private-memory theater. |
| memory layer | Time-bounded event abstractions, approved local state, revocable memories, source hashes, update/deletion state. | Public persona identity, raw source text in weights, author imitation. | Supplies gated memory only when visibility and user permission allow it. |
| culture knowledge layer | World/culture facts, people, works, periods, themes, relations, entry paths. | Persona facts, private sources, style mimicry. | Answers culture content first; persona can only shape stance, emphasis, and boundary. |
| reasoning layer | Arithmetic, logic, comparison, planning, explanation operations, solver/retrieval plans. | Persona preferences as correctness criteria. | Computes or validates the answer before persona style is applied. |
| style layer | Length, warmth, sparseness, directness, rhythm, level of explanation. | Identity truth, privacy boundaries, factual correctness. | Applies a target band, never an exact imitation objective. |
| verifier layer | Privacy, source leak, overfit, identity boundary, contradiction, copyright, policy consistency. | Raw answer generation or source extraction. | Rejects drafts that leak, overfit, over-personify, or let persona override correctness. |
| personal fact layer | Approved concrete facts, direct answers, visibility and sensitivity gates, not-to-infer limits. | Style imitation, raw biography dump, literary interpretation as biography. | Supplies direct factual answers when profile and policy allow. |
| answer bank | Rare fixed surface strings for stable public boundaries. | Persona knowledge, culture knowledge, reasoning, biography. | Should stay small; persona layer must not become answer-bank expansion. |

## 3. Recommended Architecture

```text
user input
  -> cheap identity/privacy rules
  -> question type / reasoning gate
  -> culture / knowledge retrieval if needed
  -> memory retrieval only if allowed
  -> persona packet selection
  -> draft answer
  -> persona verifier
  -> privacy/source/overfit verifier
  -> final short answer
```

This phase does not implement that runtime. The architecture is recorded here only as a design contract for future work.

Runtime implications:

- Identity/privacy rules run before persona retrieval, because persona must never authorize leakage.
- Reasoning and culture layers decide task correctness before persona style is applied.
- Persona packet selection should retrieve a small packet of methods/cards, not a full profile dump.
- Draft answer generation must not quote source material.
- Persona verifier checks whether the answer follows the intended operation and style target.
- Privacy/source/overfit verifier has veto power over the final answer.

## 4. Profiles

### lite

- deterministic identity
- core profile
- no private memory
- public safe
- no model training required
- suitable for public demo/runtime

### standard

- core profile
- approved public persona cards
- approved method cards
- small policy head later
- no raw event atoms in public runtime
- suitable only after eval and validators pass

### full

- reflection cards
- subject graph
- stronger memory gate
- local/private only
- may use approved local abstractions, never raw private source

### research/private

- event atoms
- allowed local records
- adapter/LoRA experiments
- never public
- must remain revocable and verifier-gated

## 5. Non-Goals

This phase and future persona work must not:

- train raw biography
- put raw website copy into weights
- pursue lexical mimicry
- generate private authority as if it were the author
- pull all culture questions back to persona
- let persona override reasoning correctness
- turn persona into a fixed slogan library
- use private local material in public runtime
- imply hidden access to private files or memories
- optimize for "indistinguishable from the author"

## 6. Future Admission Gate

Before persona runtime integration, the repo must have:

- approved public profile
- redaction policy
- source/provenance policy
- persona eval suite
- privacy validator
- overfit validator
- source leak validator or equivalent checks
- held-out and contradiction cases
- public/private visibility split

No persona artifact should be admitted into runtime unless it can be deleted, rebuilt, and traced to approved abstractions without committing raw sources.

## 7. Phase 2 Additions

Persona Phase 2 should include direct personal facts alongside persona/method artifacts:

- public source manifest
- source summaries
- persona cards
- method cards
- reflection candidates
- subject graph seeds
- `docs/personal_fact_card_schema.md`
- `identity_pack/approved_personal_facts.example.jsonl`
- `evals/persona/direct_personal_facts.jsonl`
- validator checks for PersonalFactCard fields, visibility, source boundaries, and direct-answer eligibility

The phase gate is:

```text
approved fact -> direct answer
approved interpretation -> bounded interpretation
sensitive/unapproved fact -> refuse or boundary
creative narrative -> do not flatten into biography
unknown detail -> say unknown, do not invent
```
