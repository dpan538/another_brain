# R27A10 Budget-Aware Candidate Repair

R27A10 audits A8B/A9B, calibrates the train/dev loss gap, applies a full 100MB static browser bundle budget, and chooses the next route.

## Outcome

- Route decision: `NO_TRAIN_WRITE_BLOCKER`
- Candidate route: `no_go_loss_accounting_blocker`
- Loss calibration: `likely_accounting_bug`
- 100M q4 budget classification: `impossible_under_100mb`
- 60M q4 product-path fit: `True`
- Training ran: `False`

## Interpretation

The A8B/A9B 100M checkpoint remains a research reference only. It is not a product-path browser candidate because the full static bundle estimate exceeds the 100MB budget and the model is still dialogue-not-ready. A10 also blocks new training because the headline A8B train loss is a last-batch proxy rather than an eval-comparable aggregate.
