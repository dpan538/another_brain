# R28LIVEFIX0 Merge Readiness

Decision label:

- `preview_ready_not_merge_ready`

Reason:

- Local/static gates can verify the branch marker, static assets, probe contract, and no-training/no-backend boundaries.
- They cannot prove that a specific Vercel preview is serving this branch or that live q4 forward ran in that browser.
- Fixture-only QA is not allowed to set `merge_ready`.

Upgrade to `merge_ready` requires a live diagnostics payload from the actual preview:

```js
await window.__anotherBrainDiagnostics()
```

Required live diagnostics:

- `branch_marker=R28LIVEFIX0`.
- five q4 shard entries.
- every shard has `ok=true` and `bytes_read > 0`.
- tokenizer `ok=true`.
- `q4_forward.q4_forward_ran=true`.
- `q4_forward.tokens_generated > 0`.
- `merge_runtime_ready=true`.

Blocking labels:

- `blocked_branch_mismatch` if the preview lacks the marker.
- `blocked_live_q4_mount` if shard bytes are not readable or q4 forward is not confirmed.
- `preview_ready_not_merge_ready` if local gates pass but live diagnostics are not yet supplied.
