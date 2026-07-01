# R25AA Phase 4 Static Envelope Review

R25AA adds a static capacity envelope review for possible future phase_4
architectures. This is planning only.

Candidate envelopes:

- `phase4_micro_plus`: low-to-moderate memory risk, small q4 footprint.
- `phase4_small_static_candidate`: moderate risk, Pro static profile target.
- `phase4_upper_static_candidate`: high memory risk, strict Pro static review
  required.

No candidate is selected. No phase_4 training is approved. No training command,
checkpoint, model weight, static release manifest, or browser artifact is
created.

The envelope evaluator compares q4 byte estimates against
`hobby_static_llm_lite` and `pro_static_llm_full`, estimates 32 MB shard counts,
and reports capacity review only. It does not claim real browser performance.

Any future phase_4 work still requires:

- fresh reviewer approval
- selected architecture design
- scaled capacity projection
- training hardware and runtime plan
- checkpoint provenance plan
- R25E/R25H static release admission after training, not before
