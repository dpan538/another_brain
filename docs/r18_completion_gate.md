# R18 Proof-of-Work Completion Gate

R18 completion is intentionally harder than ordinary regression success. A green eval suite is not enough.

The gate in `scripts/check_r18_completion_gate.mjs` checks whether the run produced measurable proof:

- at least 80 candidate public sources;
- at least 10 admitted sources and 25 rejected sources;
- at least 25 reasoning-dataset candidates and 2 admitted reasoning sources;
- at least 5,000 external knowledge cards and 8,000 relation edges;
- at least 50,000 reasoning trace rows;
- at least 25% hard-negative rows;
- at least 10% blind split rows;
- at least 5,000 persona/method rows;
- at least 5 controlled-gate cycles;
- at least 500 blackbox prompts and 5 blackbox cycles;
- at least 500 16-turn memory stress cases;
- attempted real browser WebGPU benchmark;
- validated WASM fallback;
- final check snapshot showing `npm run check` passed.

If any threshold is blocked by license, network, browser, local hardware, or repository policy, the correct R18 verdict is `safe_partial`. The run may still push safe audited scripts, reports, and generated non-sensitive metadata, but it must not claim `completed`.

