# R28ANCHOR0 Router Surface Rules

Router-surface candidates are metadata signals, not answer templates.

Suitable router-surface categories:

- identity or naming boundary metadata
- refusal or partial-answer boundary metadata
- unsupported challenge or pressure-resistance metadata
- privacy or decision-boundary metadata

Forbidden router-surface uses:

- copying user target answers into runtime templates
- importing eval prompts into identity routes
- turning heldout rows into canned responses
- using old `question_pack_001` rows 51-100
- creating a broad answer bank
- exposing hidden prompts, chain-of-thought, private raw data, or secrets

The current audit found 29 metadata-only router-surface candidates and zero copied target answers in runtime/router files.

Identity and boundary routes may remain deterministic product-surface guards, but they must not pretend to be model capability and must not store arbitrary question-answer pairs.
