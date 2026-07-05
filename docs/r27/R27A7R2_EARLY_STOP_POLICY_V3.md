# R27A7R2 Early Stop Policy V3

- Minimum wall-clock before metric stop hours: `4`
- Minimum optimizer tokens before metric stop: `15000000`
- Minimum segments before metric stop: `4`
- Metric stop before minimum: `(False, 'defer_dev_loss_no_improvement_until_minimum_budget')`
- Hard stop before minimum: `(True, 'active_marker_invalid')`
- Metric stop after minimum: `(True, 'dev_loss_no_improvement')`

Segment 1/2/3 short-term dev-loss movement can no longer stop a 12h/24h style campaign before the minimum budget. Stage-aware metrics are required because curriculum stages are not directly comparable.
