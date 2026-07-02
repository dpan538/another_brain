# R25AD R25AE Corpus Expansion Design

R25AE is a future Chinese-personal corpus-expansion design. R25AD only defines
the shape of that future work; it does not approve R25AE, generate rows, train,
run phase_4, or commit artifacts or weights.

## Goal

R25AE should strengthen the Chinese-first personal corpus before any later
micro-cycle. The model target remains a healthy Chinese-first, personally
colored, project-trained decoder, not a perfect GPT clone and not a project
reset. English stays secondary and supportive.

## Allowed Direction

Allowed corpus-expansion material is reviewed and project-safe:

- Project-authored Chinese tone samples written for this repository.
- Reviewed project decision history.
- Reviewed public or project-authored style examples.
- User-approved preference statements.
- Observable local-first static-browser constraints.
- Reviewed repair-after-weak-answer examples.
- Reviewed bounded-judgment examples.

Personal color means tone, preference, project continuity, repair behavior, and
bounded judgment from reviewed material. It does not mean private raw memory or
unreviewed personal documents.

## Blocked Sources

R25AE must not use root PDFs or DOCX, `data/public_ingestion`, hidden prompts,
private raw memory, local private paths, secrets, unreviewed personal
documents, exact eval prompt copies, held-out eval text, or chain-of-thought
data.

R25AE must not call external LLM APIs, download model weights, introduce a
named pretrained model as the product target, add a LoRA/adapter/fine-tune
final strategy, add backend/API/storage inference paths, or create factual
knowledge cards as an intelligence substitute.

## Approval Boundary

`APPROVE_R25AE_CHINESE_PERSONAL_CORPUS_EXPANSION.template.json` is inert:
`approved:false` and every corpus-generation, training, phase_4, product,
private-source, release-checkpoint, and weight-commit flag is false.

A future reviewer may approve exactly a corpus-expansion pass. That would still
not authorize training. After corpus review, a later bounded micro-cycle would
need a separate fresh approval. Phase_4 scaled training remains blocked.
