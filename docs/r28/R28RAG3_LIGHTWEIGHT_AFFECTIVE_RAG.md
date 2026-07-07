# R28RAG3 Lightweight Affective RAG

R28RAG3 upgrades the static RAG layer from demo-only evidence toward a small runtime profile pack. It does not train, use a hosted vector store, call a backend, call an external LLM API, call Doubao, read root DOCX/PDF files, read `data/public_ingestion`, or use eval prompts.

## Runtime Shape

- Static same-origin card assets live under `web/another_brain/static_rag/`.
- `src/browser_runtime/rag/profile_retriever.ts` validates cards and converts them to evidence records.
- `src/browser_runtime/rag/affective_rag.ts` builds a runtime-only evidence packet with tone hints and source display.
- `web/another_brain_chat/static_retriever.js` loads demo memory plus profile/style/boundary cards in the real static page.
- Process trace source display includes source title, kind, provenance, and tone hints.

## Card Packs

- `profile_cards.json`: identity, relation, capability.
- `style_cards.json`: compressed style, value stance, aesthetic judgment, affective tone.
- `boundary_cards.json`: insufficient evidence, conflict, injection refusal, non-product boundary.

These cards are hints/evidence only. They are not training data and not final answers.

## Retrieval

The retriever uses token overlap, character n-gram overlap, trust boost, and small kind-aware boosts for profile cards. This keeps ranking deterministic and local while improving matches for value, aesthetic, evidence, identity, and capability questions.

## Process Trace

The public process panel can show:

- `sources=R28RAG3 aesthetic card:aesthetic:approved_anchor_summary`
- `tone_hints=textured, specific`

No hidden prompt, chain-of-thought, private raw text, or eval prompt content is displayed.
