# Culture Coverage Audit - 2026-06-15

This audit distinguishes runtime surface answers from typed-card and eval-backed coverage. A domain can answer something and still be fake or thin if it lacks person/work/period/relation nodes and eval diversity.

## Summary

- none: 0
- fake: 1
- thin: 0
- usable: 11
- strong: 3

## Domains

### music.mandopop

- coverage_level: usable
- cards: person 2, work 5, period 0, movement 0, genre 1, concept 0, relation 0, method 0
- eval_cases: 17
- blackbox_prompts: 0
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no periods or movements; no relation cards

### music.taiwan

- coverage_level: usable
- cards: person 3, work 4, period 1, movement 1, genre 0, concept 0, relation 0, method 0
- eval_cases: 15
- blackbox_prompts: 3
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no relation cards

### music.hongkong

- coverage_level: usable
- cards: person 3, work 2, period 1, movement 0, genre 0, concept 0, relation 4, method 0
- eval_cases: 9
- blackbox_prompts: 2
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: none

### music.mainland_rock

- coverage_level: usable
- cards: person 1, work 1, period 1, movement 0, genre 0, concept 0, relation 0, method 0
- eval_cases: 4
- blackbox_prompts: 1
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no relation cards; low eval coverage

### music.chinese_pop_general

- coverage_level: strong
- cards: person 10, work 14, period 4, movement 1, genre 1, concept 4, relation 16, method 3
- eval_cases: 22
- blackbox_prompts: 14
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: none

### literature.japanese

- coverage_level: strong
- cards: person 13, work 16, period 6, movement 0, genre 0, concept 2, relation 20, method 0
- eval_cases: 52
- blackbox_prompts: 18
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: none

### literature.asian_general

- coverage_level: strong
- cards: person 20, work 23, period 7, movement 1, genre 0, concept 6, relation 28, method 1
- eval_cases: 20
- blackbox_prompts: 5
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: none

### literature.chinese_modern

- coverage_level: usable
- cards: person 7, work 7, period 1, movement 1, genre 0, concept 1, relation 0, method 0
- eval_cases: 25
- blackbox_prompts: 1
- structure: chronology=true, entry_paths=true, representative_works=true, compare_axes=true
- fake/thin reasons: no relation cards

### literature.korean_modern

- coverage_level: fake
- cards: person 0, work 0, period 0, movement 0, genre 0, concept 1, relation 0, method 0
- eval_cases: 3
- blackbox_prompts: 1
- structure: chronology=false, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: one generic card only; no work cards; no person cards; no periods or movements; no relation cards; low eval coverage

### literature.western_modern

- coverage_level: usable
- cards: person 4, work 0, period 1, movement 0, genre 0, concept 2, relation 4, method 1
- eval_cases: 3
- blackbox_prompts: 12
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards; low eval coverage

### philosophy

- coverage_level: usable
- cards: person 14, work 0, period 0, movement 5, genre 0, concept 10, relation 6, method 1
- eval_cases: 32
- blackbox_prompts: 0
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards

### art_history

- coverage_level: usable
- cards: person 8, work 1, period 0, movement 10, genre 0, concept 8, relation 6, method 5
- eval_cases: 14
- blackbox_prompts: 9
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: none

### photography_history

- coverage_level: usable
- cards: person 4, work 2, period 0, movement 1, genre 0, concept 6, relation 0, method 4
- eval_cases: 13
- blackbox_prompts: 7
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no relation cards

### design_history

- coverage_level: usable
- cards: person 1, work 0, period 0, movement 1, genre 0, concept 0, relation 2, method 0
- eval_cases: 4
- blackbox_prompts: 4
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards; low eval coverage

### poetry

- coverage_level: usable
- cards: person 3, work 0, period 0, movement 1, genre 0, concept 5, relation 2, method 3
- eval_cases: 6
- blackbox_prompts: 3
- structure: chronology=true, entry_paths=true, representative_works=false, compare_axes=true
- fake/thin reasons: no work cards
