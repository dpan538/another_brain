# Mobile Answer Density Contract

Mobile answers must be short, concrete, and easy to scan. Short is not enough: answers must remain bound to the current topic, avoid repetition, and preserve required factual anchors.

```json
{
  "mobile_default": {
    "max_sentences": 2,
    "target_sentences": 1,
    "max_chinese_chars": 110,
    "target_chinese_chars": 70,
    "max_list_items": 3,
    "max_compare_axes": 2
  },
  "mobile_simplify": {
    "max_sentences": 1,
    "max_chinese_chars": 60
  },
  "mobile_followup": {
    "max_sentences": 2,
    "max_chinese_chars": 100
  },
  "mobile_list": {
    "max_items": 4,
    "max_chinese_chars": 140
  },
  "desktop_default": {
    "max_sentences": 4,
    "max_chinese_chars": 220
  }
}
```

Rules:

- Mobile default answers should not output more than three dense clauses.
- Mobile lists should stay within 3 to 4 anchors.
- If detail is needed, offer continuation instead of packing everything into one answer.
- Mobile answers give the core first, not a preface.
- `是否能简单一点？` must stay within 60 Chinese characters.
- Density is checked by verifier/finalizer gates.

