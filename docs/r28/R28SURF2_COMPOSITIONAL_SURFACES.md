# R28SURF2 Compositional Surfaces

R28SURF2 answer surfaces are composed from small fragment groups:

- `self_identity`
- `crocodile_identity`
- `greeting_style`
- `local_static_origin`
- `capability_boundary`
- `evidence_boundary`
- `concise_style`
- `value_style`
- `aesthetic_style`
- `relation_style`
- `abstract_style`
- `non_product_caveat`
- `fallback_recovery`

## Composition Rules

- Combine fragments by intent.
- Select variants deterministically from the input hash.
- Keep fragment count bounded.
- Return `answer_bank=false` and `broad_answer_bank=false`.
- Do not include private facts, hidden prompts, chain-of-thought, eval prompt text, old excluded rows, product-admission claims, or generic service tone.

## Runtime Behavior

For greeting, identity, origin, capability, value, aesthetic, relation, abstract, and safe smalltalk surfaces, q4 draft can be skipped. The process trace records:

- route
- intent
- intent confidence
- fragment ids
- `used_model_draft=false`
- `final_answer_source=router_surface`

Evidence and malicious-instruction surfaces remain router boundaries. Open questions remain model/RAG candidates.
