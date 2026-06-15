# Persona Ingestion Policy

This document defines what may enter persona training, retrieval, memory graph, and public runtime. It is a policy contract, not an ingestion implementation.

The default rule is simple: raw material does not become persona. Raw material may only produce reviewed, redacted, provenance-bearing abstractions.

This policy must not make the system evasive. A direct answer is not a privacy failure when the fact is approved, visible, sourced, and non-sensitive for the active runtime profile. A vague answer is a failure when it dodges an approved factual question.

The system should be precise without becoming invasive, and bounded without becoming evasive.

## 1. Source Classes

| Source class | Can enter training | Can enter retrieval | Can enter memory graph | Can enter persona layer | Needs redaction | Needs provenance | Needs approval | Public runtime allowed | Can enter weights |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| public stable materials | Yes, after abstraction | Yes, after abstraction | Yes, as approved nodes/edges | Yes, as approved cards | Low | Yes | Recommended | Yes, if public-safe | Only abstract labels/policy, not raw text |
| public creative works | Limited, after abstraction | Yes, metadata/summary level | Yes, as work/theme nodes | Yes, as methods/themes/boundaries | Medium | Yes | Required | Only approved abstractions | No raw creative text |
| public technical projects | Yes, after abstraction | Yes | Yes | Yes, as project/method cards | Low | Yes | Recommended | Yes, if public-safe | Only abstract policy/method labels |
| semi-private notes | Not directly | Local only, gated | Local only, gated | Only reviewed abstraction | High | Yes | Required | No | No |
| private local materials | No public training | Private/local gated only | Private/local gated only | Private/full profile only after review | High | Yes | Required | No | No |
| calibration answers | Yes, as policy examples | Yes, if visibility allows | Optional | Yes, with visibility/provenance | Medium | Yes | Required | Public subset only | Policy head only, no private facts |
| user-confirmed corrections | Yes, after review | Yes | Yes | Yes, if visibility allows | Depends on content | Yes | Already confirmed plus review | Depends on visibility | Policy head only, with confidence |
| rejected / forbidden materials | No | No | No | No | If temporarily cached, yes | Yes | Marked rejected | No | No |
| noisy materials | No or low-weight reviewed abstraction | Maybe low-confidence local retrieval | Low-confidence local only | Rarely, reviewed only | Medium | Yes | Recommended | No by default | No |
| copyright-sensitive materials | No raw training | Metadata/abstract claim only | Work node only | Abstract claim only | High | Yes | Required | Only metadata/summary | No dense text |

Rules:

- Public material still must not enter weights as raw text. It may produce abstract claims, methods, policy labels, and eval guards.
- Private local materials must not be used by public runtime.
- Copyright-sensitive material may produce metadata or abstract claims; it must not be rewritten, memorized, or reproduced as dense expression.
- Rejected or forbidden materials must not enter training, retrieval, memory graph, or persona layer.
- Calibration answers may train a future policy head only when visibility, provenance, and approval are recorded.
- User corrections must carry confidence, review state, time scope, contradiction handling, and deletion/update rules.

## 2. Visibility Labels

### public

- Meaning: safe for public repo/runtime after review.
- Allowed storage: committed examples, approved public cards, public-safe evals, hashed source refs.
- Allowed runtime: public runtime may use approved abstractions.
- Allowed training: policy/style/risk labels may train future small heads; raw source text still excluded.
- Commit policy: allowed if redacted, abstracted, and not source-copy.
- Deletion/update rule: card-level deletion and rebuild from reviewed source manifest.

### local

- Meaning: available on the local machine but not public-safe by default.
- Allowed storage: local uncommitted manifests, private artifacts, local cache.
- Allowed runtime: desktop/local runtime only, behind a memory gate.
- Allowed training: local/private experiments only; no public release.
- Commit policy: do not commit local manifests, raw snippets, local source metadata, or local-derived private prompts.
- Deletion/update rule: delete local artifacts and rebuild derived cards.

### private

- Meaning: sensitive personal, unpublished, or user-restricted material.
- Allowed storage: private local store only.
- Allowed runtime: private mode only, explicit permission required.
- Allowed training: no public training; private experiments require approval and revocation plan.
- Commit policy: never commit identifiable private content or private prompts.
- Deletion/update rule: immediate removal from retrieval, graph, eval, and future training rebuilds.

### forbidden

- Meaning: rejected, disallowed, unsafe, illegally obtained, over-sensitive, or explicitly withdrawn.
- Allowed storage: only minimal rejection metadata if needed, with no raw content.
- Allowed runtime: never.
- Allowed training: never.
- Commit policy: only synthetic rejected examples without raw content may be committed.
- Deletion/update rule: remove from all stores; keep only non-identifying audit reason if required.

## 3. Redaction Policy

The following must be redacted before any reviewed abstraction is created:

- phone
- email
- address
- passport / visa / ID
- account number
- bank info
- raw local path
- source path
- local timestamp
- GPS / precise coordinates
- hidden metadata
- private names unless approved
- unpublished private titles
- dense copyrighted text
- source snippets that can be memorized

Redaction must happen before segmentation, extraction, training-example generation, and review. Redaction is not optional just because a material is public; public material can still contain metadata or source phrasing that should not be memorized.

## 4. Provenance Policy

- `source_hash` is required for real approved artifacts.
- No raw path may appear in committed artifacts.
- No raw text cache may be committed.
- `evidence_summary` is allowed when it is abstract, short, and non-identifying.
- `source_refs` may be placeholder IDs or hashes in public examples.
- Every approved card must be traceable enough for deletion and rebuild.
- The public repo should contain examples/placeholders, not private manifests.
- Real source manifests belong in local/private storage unless explicitly reviewed for public release.

## 5. Commit Policy

Never commit:

- raw local files
- raw notes
- source paths
- sensitive metadata
- training prompts linked to private material
- unapproved corrections
- private manifests with identifiable metadata
- raw text caches
- extracted local snippets
- private eval prompts containing private facts

Allowed to commit:

- schema files
- public profile example
- placeholder manifests
- example cards
- redaction policy
- rejected-card reason examples without raw content
- public-safe eval skeleton

## 6. Approval Gate

An approved persona card must have:

- stable ID
- card type
- abstract claim
- evidence summary
- source refs or placeholder refs
- confidence
- visibility
- stability
- answer policy
- overfit risk
- eval tags

Any card lacking visibility, provenance, or deletion path must be treated as unapproved.

## 7. Direct Personal Fact Policy

PersonalFactCard is the artifact for approved direct facts. It is separate from PersonaCard.

If a query asks for a factual attribute of the user, project, work, or background and a matching PersonalFactCard exists with:

- `approved_for_direct_answer = true`
- visibility allowed by the current runtime profile
- `confidence >= 0.75`
- sensitivity allowed by the current mode
- no privacy, copyright, or source-leak violation

then the answer should be direct.

The system should not replace an approved factual answer with:

- metaphor
- counterquestion
- generic boundary statement
- unknown fallback
- external search hint
- abstract persona sentence

If no matching approved card exists, or the card is local/private while the runtime profile is public, the system should answer with a boundary or uncertainty.

### Artifact Distinctions

| Artifact | Owns | Does not own |
| --- | --- | --- |
| PersonaCard | response habit, style target, judgment tendency, boundary preference | concrete biography or direct factual answer |
| PersonalFactCard | approved concrete facts and direct answers | style imitation or broad persona |
| MethodCard | how to judge a question type | whether a fact occurred |
| ReflectionCard | recurring patterns across approved materials | raw memory or exact source text |
| EventAtom | time-bounded occurrence with confidence and visibility | public persona identity |

Do not collapse these artifacts into one card type.

### Creative and Literary Boundary

Creative writing may yield:

- literal collection facts
- section structure
- approved abstract themes
- interpretive methods

Creative writing must not automatically yield:

- private family biography
- medical or psychological claims
- exact address/current status
- immigration or visa inference
- supernatural or narrative events as literal fact
- long source quotes or memorized lines
