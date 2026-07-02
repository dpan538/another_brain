# R25AA Phase 3 Pause And Review

R25AA pauses phase 3 for review unless a later reviewer explicitly chooses a
new design. It does not rerun R25Y, R25V, R25S, R25P, R25M, or the toy sanity
run.

The reason for the pause is simple:

- the best pilot remains R25S
- the two-layer R25V ablation did not improve generalization
- the R25Y data-regularization run improved over R25P/R25V but did not beat R25S
- more pilot runs need a clearer reviewed hypothesis

Phase_4 readiness review can begin only as analysis and design. Phase_4 scaled
training is not approved, and no phase_4 run config is authorized.

Future work requires fresh reviewer approval before any training. R24/R25 gates
remain required before and after any approved future run.

R25AB keeps this pause intact and reframes the next possible cycle around a
Chinese-first personal model. That alignment is not a reset: all R24/R25 gates,
datasets, pilots, and decisions remain part of the project. R25AB runs no
training, commits no weights, and may only design R25AC as a future bounded
Chinese-personal micro-cycle that still requires fresh approval.

R25AC may later run exactly one such fresh-approved bounded micro-cycle, but it
does not lift the pause into phase_4. R25S remains the reference pilot until a
separate review decides otherwise, phase_4 scaled training remains unapproved,
and product/formal training progress remains `0%`.
