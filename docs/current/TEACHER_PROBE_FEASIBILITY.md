# Teacher Probe Feasibility

R26B records feasibility only. It does not call Doubao or any external teacher.

A future teacher probe could be useful for comparing:

- weird abstract question handling;
- unsupported challenge resistance;
- evidence-bearing correction;
- non-answer boundaries;
- relationship-sensitive answer style.

Risks are high enough that teacher probing must stay separate from product runtime and training corpus admission. No private data may be sent, no chain-of-thought may be requested or stored, and no teacher answer may be promoted without review.
