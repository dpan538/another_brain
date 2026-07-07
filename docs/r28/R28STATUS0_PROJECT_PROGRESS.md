# R28STATUS0 Project Progress

Generated: `2026-07-07T14:53:58.444492+00:00`

R28STATUS0 is a local-only progress ledger. It did not train, parse root DOCX/PDF, parse `data/public_ingestion`, call external LLMs, call Doubao, connect backend inference, or approve product/browser/release admission.

## Required Answers

- Current model has LoRA: `False`.
- Current model is from-scratch q4 static decoder: `True`.
- Static q4 assets present: `True`.
- Frontend calls q4 model path on `origin/main`: `False`.
- Self-check/q4 forward/tokens: `main self-check=blocking_or_unverified_r28ux4; hotfix2 branch adds nonblocking quick/deep split with abort/timeout`.
- RAG progress: `demo/static`.
- 100 questions/user_answered anchors usable for approved training: `98` tracked user_answered split rows; training is not approved by this task.
- Answer bank/hard router: hard router boundary exists; broad answer bank is `False`.
- Vercel preview/production: `not_live_checked_in_R28STATUS0` / `not_live_checked_in_R28STATUS0`.
- Release readiness label: `prelaunch_hotfix_pending_not_admitted`.

## Module Progress Map

| Module | Current State | Evidence |
| --- | --- | --- |
| model_training | from-scratch project-trained decoder lineage; no LoRA/adapters as current model path | LoRA=False; source=r27a12_new_96m |
| q4_static_assets | present | shards=5/5; bytes=48267968 |
| browser_runtime | not confirmed | runtime_forward=True; hotfix2_branch=True |
| tokenizer | exact | runtime_asset=True; decode=exact_runtime_tokenizer |
| RAG_runtime | static_demo | records=4; answer_bank=False |
| RAG_training | architecture and static/demo retrieval exist; product RAG training/admission is not done | teacher/browser/vector-store disabled |
| distillation | training-data/promotion architecture only; runtime does not run a teacher and this task does not call external LLMs | teacher_probe_pack=True |
| user_answered_anchors | tracked splits exist; no training approved | allowed_count=98; old_rows_blocked=True |
| answer_surface_router | boundary/fallback/router layer, not a broad FAQ answer bank | hard_router=True; answer_bank=False |
| frontend_UI | main marker R28UX4 | process_panel=True; hotfix2_ui_branch=True |
| deployment | local evidence only | production=not_live_checked_in_R28STATUS0; preview=not_live_checked_in_R28STATUS0 |
| blockers | prelaunch_hotfix_pending_not_admitted | 7 open blockers |

## Branch Reality

- `origin/main`: `68e9503748d3`, UI marker `R28UX4`.
- `origin/r28hotfix2-nonblocking-selfcheck`: present=`True`, sha=`7a446e9a3d2a`, nonblocking self-check=`True`, identity route=`True`.
- HOTFIX2 merged to main: `False`.

## Non-Claims

- not product model
- not product admission
- not browser admission
- not release checkpoint
- no training
- no new model assets
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
