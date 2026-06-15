# Personal Fact Card Schema

This document defines direct personal fact cards. PersonalFactCard is separate from PersonaCard. It exists to prevent the opposite failure mode from persona overfit: over-defensive vagueness.

A direct answer is not a privacy failure when the fact is approved, visible, sourced, and non-sensitive for the active runtime profile. A vague answer is a failure when it dodges an approved factual question.

The system should be precise without becoming invasive, and bounded without becoming evasive.

## Purpose

PersonalFactCard answers:

```text
What approved fact can I answer directly?
```

It should not answer:

```text
How should I sound?
```

That remains the job of PersonaCard, MethodCard, and answer policy.

## Schema

```json
{
  "id": "",
  "fact_type": "education | project | work | writing_collection | location_phase | exhibition | award | domain | public_identity | chronology | relation | other",
  "claim": "",
  "direct_answer": "",
  "source_ids": [],
  "source_summary": "",
  "visibility": "public | local | private | forbidden",
  "approved_for_direct_answer": true,
  "approved_for_public_runtime": false,
  "sensitivity": "low | medium | high",
  "confidence": 0.0,
  "time_scope": "",
  "literal_or_interpretive": "literal | interpretive | mixed",
  "not_to_infer": [],
  "must_not_include": [],
  "answer_style": "direct_short | direct_with_boundary | refuse | clarify",
  "eval_tags": []
}
```

## Field Contract

- `id`: stable card ID.
- `fact_type`: the kind of concrete fact.
- `claim`: structured factual statement.
- `direct_answer`: short answer the system may give when policy allows.
- `source_ids`: reviewed source IDs, placeholders, or hashes; never raw paths.
- `source_summary`: abstract evidence summary, not a quote.
- `visibility`: where the card may be used.
- `approved_for_direct_answer`: if true, the system should not dodge the fact.
- `approved_for_public_runtime`: whether public runtime may answer from the card.
- `sensitivity`: risk level for active profile gating.
- `confidence`: confidence score; direct answers require a high enough threshold.
- `time_scope`: time range or source version where the fact applies.
- `literal_or_interpretive`: prevents creative or literary material from being flattened into biography.
- `not_to_infer`: forbidden extrapolations.
- `must_not_include`: output guards such as no source framing, no raw quote, no private path.
- `answer_style`: expected style/policy for direct use.
- `eval_tags`: regression tags.

## Direct Fact Policy

If a query asks for a factual attribute of the user, project, work, or background and a matching PersonalFactCard exists with:

- `approved_for_direct_answer = true`
- visibility allowed by current runtime profile
- `confidence >= 0.75`
- sensitivity allowed by current mode
- no privacy, copyright, or source-leak violation

then the answer should be direct.

The system should not replace it with:

- a metaphor
- a counterquestion
- a generic boundary statement
- "I don't know"
- "ask somewhere else"
- an abstract persona sentence

If no matching approved card exists, or the card is local/private while runtime is public, then answer with a boundary or uncertainty.

## Runtime-Facing Distinction

| Artifact | Runtime question | Example responsibility |
| --- | --- | --- |
| PersonaCard | How should I answer? | Answer briefly, avoid source framing, do not over-explain. |
| PersonalFactCard | What approved fact can I answer directly? | Collection written 2024 to spring 2025; BFA at SVA 2021-2025. |
| MethodCard | How should I judge this kind of question? | When asked about a work, separate work structure from biography. |
| ReflectionCard | What recurring pattern is visible across works/materials? | Displacement turns home into an abstract constellation. |
| EventAtom | What happened, when, in what medium, with what confidence? | Writing collection produced during a New York final-year period. |

Do not collapse these into one persona card type.

## Approved Fact Categories

- approved concrete fact: direct answer if profile allows.
- approved creative interpretation: bounded interpretation, not biography.
- public background fact: direct answer in public runtime if non-sensitive.
- local/private fact: answer only in local/private mode if approved.
- sensitive-but-allowed fact: direct with boundary if mode allows.
- unapproved private fact: refuse or state unavailable.
- literary/narrative material: do not flatten into biography.
- unknown or unsupported claim: state unknown; do not invent.

## Bad and Good Behavior

Bad:

```text
Q: This collection was written when?
A: Time is not a fixed place.
```

Good:

```text
Q: This collection was written when?
A: It was written between 2024 and spring 2025.
```

Bad:

```text
Q: Where did Dai Pan study BFA?
A: Education is a way of migrating through institutions.
```

Good:

```text
Q: Where did Dai Pan study BFA?
A: Dai Pan studied BFA in Design at SVA from 2021 to 2025.
```

## Prohibitions

Direct facts must still not:

- expose unapproved private facts
- reveal local paths, email, phone, address, ID, GPS, or hidden metadata
- flatten creative writing into biography
- reproduce long source text
- use source-framing in the final answer
- fabricate details without support
- rank, diagnose, or infer beyond the card
