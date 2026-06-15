# Culture Coverage Audit - 2026-06-15

This audit distinguishes runtime surface answers from typed-card and eval-backed coverage. A domain can answer something and still be fake or thin if it lacks person/work/period/relation nodes and eval diversity.

## Summary

- none: 7
- fake: 0
- thin: 5
- usable: 3
- strong: 0

## Domains

### music.mandopop

- coverage_level: usable
- cards: person 2, work 5, period 0, movement 0, genre 1, concept 0, relation 0, method 0
- eval_cases: 17
- blackbox_prompts: 0
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no periods or movements; no relation cards

### music.taiwan

- coverage_level: none
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 3
- structure: chronology=false, entry_paths=false, representative_works=false, compare_axes=false
- fake/thin reasons: no cards and no eval

### music.hongkong

- coverage_level: none
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 2
- structure: chronology=false, entry_paths=false, representative_works=false, compare_axes=false
- fake/thin reasons: no cards and no eval

### music.mainland_rock

- coverage_level: none
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 1
- structure: chronology=false, entry_paths=false, representative_works=false, compare_axes=false
- fake/thin reasons: no cards and no eval

### music.chinese_pop_general

- coverage_level: thin
- cards: person 2, work 5, period 0, movement 0, genre 1, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 14
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no periods or movements; no relation cards; low eval coverage

### literature.japanese

- coverage_level: usable
- cards: person 4, work 4, period 1, movement 0, genre 0, concept 2, relation 0, method 0
- eval_cases: 22
- blackbox_prompts: 18
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no relation cards

### literature.asian_general

- coverage_level: usable
- cards: person 4, work 4, period 1, movement 0, genre 0, concept 2, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 5
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no relation cards; low eval coverage

### literature.chinese_modern

- coverage_level: none
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 1
- structure: chronology=false, entry_paths=false, representative_works=false, compare_axes=false
- fake/thin reasons: no cards and no eval

### literature.korean_modern

- coverage_level: none
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 1
- structure: chronology=false, entry_paths=false, representative_works=false, compare_axes=false
- fake/thin reasons: no cards and no eval

### literature.western_modern

- coverage_level: none
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 12
- structure: chronology=false, entry_paths=false, representative_works=false, compare_axes=false
- fake/thin reasons: no cards and no eval

### philosophy

- coverage_level: thin
- cards: person 1, work 0, period 0, movement 0, genre 0, concept 8, relation 0, method 0
- eval_cases: 11
- blackbox_prompts: 0
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards; no periods or movements; no relation cards

### art_history

- coverage_level: thin
- cards: person 2, work 0, period 0, movement 1, genre 0, concept 5, relation 0, method 3
- eval_cases: 1
- blackbox_prompts: 9
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards; no relation cards; low eval coverage

### photography_history

- coverage_level: thin
- cards: person 2, work 0, period 0, movement 1, genre 0, concept 5, relation 0, method 3
- eval_cases: 3
- blackbox_prompts: 7
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards; no relation cards; low eval coverage

### design_history

- coverage_level: none
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 0
- blackbox_prompts: 4
- structure: chronology=false, entry_paths=false, representative_works=false, compare_axes=false
- fake/thin reasons: no cards and no eval

### poetry

- coverage_level: thin
- cards: person 2, work 0, period 0, movement 1, genre 0, concept 5, relation 0, method 3
- eval_cases: 5
- blackbox_prompts: 3
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards; no relation cards
