# R27A10 Route Decision

## Decision

- Decision: `NO_TRAIN_WRITE_BLOCKER`
- Candidate route: `no_go_loss_accounting_blocker`
- Selected model: `none`
- Selected device: `mps`
- Train allowed now: `False`
- Training required now: `False`
- 100M q4 route: `research_only`
- 100M q4 full-budget classification: `impossible_under_100mb`
- 60M q4 product-path fit: `True`

## Blockers

- `BLOCK_LOSS_ACCOUNTING`

## Reasons

- A8B train_loss is a last-batch proxy and is not comparable to dev/heldout loss.
- A8B dialogue readiness remained not_ready.
- A8B did not reach its optimizer-token minimum before wall-clock cap.
- A8B 100M q4 full-budget classification is impossible_under_100mb.

## Conclusion

A10 does not start a new 60M run while `BLOCK_LOSS_ACCOUNTING` is active. The budget direction is still clear: 60M q4 is the product-size path, while the A8B 100M q4 checkpoint is research-only under full static browser budget accounting.
