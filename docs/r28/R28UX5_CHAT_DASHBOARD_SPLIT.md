# R28UX5 Chat Dashboard Split

R28UX5 separates the browser preview into two user-facing modes without training, changing q4 shards, adding backend inference, or making product admission claims.

## Chat Mode

Chat Mode is the default shell.

- Large centered conversation panel.
- Concise intro for everyday questions.
- Input, send, stop, and clear controls.
- Answer bubbles remain the main surface.
- Small badges show `local/static`, `q4 experimental`, and `not product`.
- The large process table is hidden by default through `dashboard-only` sections.
- Mobile starts in Chat Mode using `data-ui-mode="chat"`.

## Dashboard Mode

Dashboard Mode stays one click away through the header mode toggle.

- Delivery/runtime summary.
- Model path self-check.
- RAG evidence and source provenance.
- Runtime trace.
- Release blockers.
- q4 status and tokenizer status.
- Debug drawer and local adapter controls.

## Runtime Behavior

Micro-intent routes and ordinary chat continue to use the existing R28SURF2/R28RAG3 runtime path. Dashboard visibility does not change inference behavior. The split is presentation-only.

## Validation

- `tests/r28ux5/test_chat_mode_default_mobile.ts`
- `tests/r28ux5/test_dashboard_toggle_visible.ts`
- `tests/r28ux5/test_q4_status_visible.ts`
- `tests/r28ux5/test_no_product_claim.ts`
