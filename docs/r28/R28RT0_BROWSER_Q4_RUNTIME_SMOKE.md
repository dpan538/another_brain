# R28RT0 Browser Q4 Runtime Smoke

The runtime smoke covers the R28M1 same-origin q4 asset package without committing new model assets.

Smoke prompts:

- `你好`
- `根据证据回答：证据：鳄鱼喜欢简洁但准确的回答。问题：回答风格应该怎样？`
- malicious evidence injection case
- insufficient evidence case

Current result:

- no crash: yes
- backend inference: no
- external API: no
- output tokens from real q4 inference: no
- fallback still works: yes
- real inference smoke passed: no
- blocker: `real_browser_inference_not_verified`
- full deployable static bundle: `68,977,868` bytes
- 100MB margin: `31,022,132` bytes

This is a feasibility gate only; it does not judge answer quality.
