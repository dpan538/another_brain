#!/usr/bin/env python3
"""Build the on-screen keyboard's pinyin dictionary.

Inputs, both MIT licensed:
  - jieba's dict.txt        word and character frequencies
  - pypinyin                pinyin for words and characters
Output: public/ime/pinyin_dict.json
  { "v": 2, "s": ["a", "ai", …], "d": { "nihao": "q你好 拟好", "ni": "w你 呢 尼 …" } }
Keys are toneless pinyin with no separators. Each value starts with one letter,
a..z, the log-frequency bucket of its top candidate, which the sentence
composer uses as an edge weight; the candidates follow, ordered by frequency.
"s" lists every valid syllable so the input method can segment a buffer. Run inside a venv that has `pypinyin` and `jieba` installed.
"""
import json, math, os, re, sys, collections
import jieba
from pypinyin import lazy_pinyin, pinyin, Style

WORD_LIMIT = 60000
PER_KEY = 40
HAN = re.compile(r"^[一-鿿]+$")

dict_path = os.path.join(os.path.dirname(jieba.__file__), "dict.txt")
freq = {}
with open(dict_path, encoding="utf-8") as f:
    for line in f:
        parts = line.split()
        if len(parts) >= 2 and HAN.match(parts[0]):
            freq[parts[0]] = int(parts[1])

chars = {w: n for w, n in freq.items() if len(w) == 1 and n >= 30}   # drop rare and variant forms
words = sorted(((w, n) for w, n in freq.items() if 2 <= len(w) <= 4), key=lambda x: -x[1])[:WORD_LIMIT]

table = collections.defaultdict(list)

def norm(s):
    return s.replace("ü", "v").replace("u:", "v")

for ch, n in chars.items():
    readings = pinyin(ch, style=Style.NORMAL, heteronym=True)[0][:2]   # main readings only
    for i, r in enumerate(readings):
        r = norm(r)
        if r.isalpha():
            table[r].append((ch, n // (1 if i == 0 else 6)))

for w, n in words:
    key = norm("".join(lazy_pinyin(w)))
    if key.isalpha():
        table[key].append((w, n))

out = {}
syllables = set()
TOP = math.log(900000)
for key, cands in table.items():
    seen, ordered = set(), []
    ranked = sorted(cands, key=lambda x: -x[1])
    for w, _ in ranked:
        if w not in seen:
            seen.add(w); ordered.append(w)
    bucket = max(0, min(25, round(math.log(ranked[0][1] + 1) / TOP * 25)))
    out[key] = chr(97 + bucket) + " ".join(ordered[:PER_KEY])
    if any(len(w) == 1 for w in ordered):
        syllables.add(key)

dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "ime", "pinyin_dict.json")
with open(dest, "w", encoding="utf-8") as f:
    json.dump({"v": 2, "s": sorted(syllables), "d": out}, f, ensure_ascii=False, separators=(",", ":"))
size = os.path.getsize(dest)
print(f"keys={len(out)}  syllables={len(syllables)}  chars={len(chars)}  words={len(words)}  bytes={size:,}")
for probe in ["nihao", "ni", "shanghai", "eyu", "sheying", "jiaopian", "nantong", "lv", "zhongguo"]:
    print(f"  {probe:10} -> {out.get(probe, '')[:60]}")
