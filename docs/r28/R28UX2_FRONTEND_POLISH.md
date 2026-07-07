# R28UX2 Frontend Polish

R28UX2 makes the static chat shell easier to demo without changing the runtime boundary. It stays local-first, static-only, and non-admitted.

## UX changes

- Chinese-first header, status labels, composer placeholder, adapter copy, fallback copy, and initial assistant message.
- Clear local/static badges for no backend inference and no external LLM calls.
- Visible prelaunch warning that the shell is an engineering candidate, not a product model.
- Runtime route display for `synthetic_demo`, `metadata_bound_candidate`, and `product_path_candidate_not_admitted`.
- Budget, model mode, RAG mode, cache, asset verification, offline, adapter, handoff, and blocker statuses remain visible.

## Message controls

- Streaming placeholder while the local runtime is generating.
- Answer status live region for pending, completed, copied, cleared, and fallback states.
- Retry-last-turn button after the first submit.
- Clear conversation button that resets transient conversation state.
- Copy-answer button on assistant messages.
- Fallback reason surfaced in Chinese when guards or verifier paths block an answer.

## Evidence drawer

- Collapsible evidence panel with an evidence count.
- Evidence records render as escaped text nodes, not HTML.
- Packet debug output remains visible inside the drawer for engineering inspection.
- The drawer explicitly says evidence is supporting material, not an answer bank.

## Adapter import

- Plain text and JSON packet tabs.
- Validation result live region.
- Session-only privacy note.
- Import success summary with packet and evidence counts.
- Clear imported context button.

## Accessibility and mobile

- `zh-CN` document language.
- `aria-live` status regions for runtime and adapter feedback.
- Keyboard submit with Cmd/Ctrl + Enter.
- Focus returns to the composer after import, clear, and generation flows.
- Narrow-screen grids collapse to avoid horizontal overflow.
- Reduced-motion media query disables long-running animation.

## Tests

R28UX2 adds:

- `tests/r28ux2/test_chinese_copy_markers.ts`
- `tests/r28ux2/test_message_state_ui.ts`
- `tests/r28ux2/test_adapter_import_ui.ts`
- `tests/r28ux2/test_fallback_reason_ui.ts`
- `tests/r28ux2/test_evidence_drawer_ui.ts`
- `tests/r28ux2/test_mobile_layout.ts`
- `tests/r28ux2/test_accessibility_markers.ts`
- `tests/r28ux2/test_no_product_claim.ts`

Run with:

```bash
npm run test:r28ux2
```
