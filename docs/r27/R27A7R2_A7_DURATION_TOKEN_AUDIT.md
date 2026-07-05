# R27A7R2 A7 Duration Token Audit

- Campaign id: `r27a7_mps_24h_large_decoder_v1`
- Stop reason: `dev_loss_no_improvement_three_segments`
- Segment count: `3`
- Wall clock seconds: `587.269`
- Planned tokens: `18000000`
- Streamed tokens: `18000000`
- Optimizer tokens: `5324800`
- Effective tokens: `5324800`
- Optimizer steps: `5200`
- Planned tokens/sec: `30650.34932884249`
- Optimizer tokens/sec: `9067.054450345582`
- Token accounting trust: `low`
- Suspected issue: `planned_token_count_used`
- A7 tokens are optimizer-consumed: `False`

A7's reported 18M train tokens are treated as planned/streamed, not trusted optimizer-consumed tokens. A8B must use `optimizer_tokens` as the primary budget metric.
