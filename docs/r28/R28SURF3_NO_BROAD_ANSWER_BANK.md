# R28SURF3 No Broad Answer Bank

R28SURF3 is not a broad answer bank.

## Scope

The new surfaces cover only daily entry questions:

- greeting
- identity/name/crocodile
- origin
- capability
- model-status boundary
- evidence boundary
- light acknowledgements

They do not answer arbitrary factual, philosophical, technical, or personal questions. Those remain routed through q4/RAG/finalizer when evidence and model draft are available, or through existing boundary routes when not.

## Guardrails

- small finite intent set
- short variant lists
- deterministic hash variation
- `answer_bank: false`
- `broad_answer_bank: false`
- no eval prompt fragments
- no old excluded question-pack rows
- no private raw text
- no hidden chain-of-thought
