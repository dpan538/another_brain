# R26D First-50 Candidate Review Summary

R26D converted only rows 1-50 from `another_brain_question_pack_001` into ignored answer-as-user candidate artifacts. Rows 51-100 were not used and remain excluded from all training, tokenizer, teacher-probe, corpus-generation, corpus-promotion, eval-derived, and long-horizon paths.

## Candidate Counts

- candidate count: 97
- source rows used: 50
- source row range used: 1-50
- excluded row range: 51-100
- module counts: {"朋友日常判断":20,"关系语境":20,"不答与边界":19,"无证据挑战":19,"怪问题抽象":19}
- answer mode counts: {"compressed_judgment":14,"abstract_reframe":23,"partial_answer":12,"direct_answer":12,"refuse":21,"pressure_resistance":15}
- candidate type counts: {"compressed_judgment":7,"source_slice":47,"weird_question_abstraction":11,"partial_answer":4,"relationship_context_answer":10,"refusal_boundary":10,"unsupported_challenge_resistance":8}
- risk flags: {"project_meta_leakage":10}

Full user answers stay in ignored artifacts for review. This tracked summary intentionally does not include raw answers or row 51-100 text.
