# R27A7R2 Safe Controller Repair

- R27A7R2 audits why R27A7 stopped early and repairs the controller policy for the next launch plan.
- `optimizer_tokens` is the primary future budget metric.
- Ordinary metric no-improvement is deferred until the minimum budget is met.
- Device probing is resource-safe and avoids repeated repair loops.
- Limited scale smoke uses at most five optimizer steps per candidate.
- A8B launch config is generated but not executed.
