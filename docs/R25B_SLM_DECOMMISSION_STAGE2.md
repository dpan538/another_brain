# R25B SLM Decommission Stage 2

R25B keeps the strategic correction explicit: Another Brain is a browser LLM
project, not an SLM product.

Allowed legacy surfaces:

- R24 recovery gates
- verifier and finalizer checks
- fallback firewall behavior
- tiny-router or micro-solver sanity paths when used as fallback only
- personal-200m and mini-web-LLM scripts as historical comparison or legacy
  profiling tools

Forbidden active product claims:

- personal-200m is the final product target
- mini-web-LLM is the final model
- SLM is the main intelligence layer
- 100M-200M encoder or SLM is the primary product model
- tiny router is the main answer path

The executable gate is:

```sh
npm run check:no-slm-product-target
```

The future main answer path remains:

```text
policy/routing precheck
  -> retrieval from local static shards
  -> static browser decoder LLM draft
  -> R24 verifier/finalizer/fallback firewall
  -> answer
```

R25B adds training-content scaffolding only. It does not run training, add
weights, or expand manual factual knowledge cards.
