# R28LIVEFIX0 Product Chat Extension

## Scope

This extension keeps the R28LIVEFIX0 runtime branch static-only while separating the customer Chat surface from Dashboard diagnostics.

The public-facing package is now `efishother` / `efishother.com`. `efish` is the user-facing nickname layer, while `another_brain` remains an internal engineering codename used by routes, static assets, and diagnostics.

Chat now shows concise user-facing answers and the model loading progress bar only. Runtime source labels, fallback reasons, q4 quality blockers, shard URLs, tokenizer status, and process traces remain Dashboard concerns.

## UI Contract

- Desktop Chat is a fixed one-page surface with no body scroll.
- Desktop keeps the Chat/Dashboard switch.
- Mobile defaults to Chat and hides the Dashboard switch.
- Chat uses `efishother` branding; Dashboard keeps engineering markers.
- Chat composer shows one full-width input and only one visible action: Send.
- Chat uses a flat linework visual style with cream paper, deep navy lines, bright green and blue accents, and no gradients.
- The conversation region and composer are constrained near a 2.5:1 height ratio.

## Runtime Answer Contract

Chat renders a customer-facing short answer derived from the runtime packet, while Dashboard keeps the original packet diagnostics.

Covered short-answer branches include:

- greeting and identity fast paths
- natural-world commonsense questions
- life/death and why-live questions
- relationship, trust, and boundary questions
- language and meaning questions
- aesthetic and design judgment questions
- evidence-insufficient boundaries

## Static RAG Extension

`web/another_brain/static_rag/brand_cards.json` adds runtime hints for efishother branding, efish nickname identity, and Chat/Dashboard layer separation.

`web/another_brain/static_rag/logic_cards.json` adds runtime hints for commonsense, logic, philosophy, relation, language, and aesthetics.

`web/another_brain/static_rag/knowledge_cards.json` adds more runtime hints for natural commonsense, correlation/causation, justice, loneliness, memory, and color/material judgment.

These packs are not answer banks. They contain no `answer`, `final_answer`, or `answer_text` fields, are not allowed for training, and contain no private raw data, eval prompts, old question-pack rows, corpus artifacts, or hidden prompts.

## Non-Claims

- not product model admission
- not product admission
- not browser admission
- not release checkpoint admission
- no training
- no new model weights or q4 shards
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
