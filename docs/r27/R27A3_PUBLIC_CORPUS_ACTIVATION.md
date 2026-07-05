# R27A3 Public Corpus Activation

R27A2 was insufficient because public downloaded bytes and public cleaned rows were `0`, so the training scaffold never exercised real public text.

R27A3 adds engineering-only license admission, bounded source sampling, public cleaning, and artifact-only storage. It does not approve product training, phase_4, release, raw corpus commit, tokenizer artifact commit, or weight commit.

Input rows: `5450`. Clean public rows: `4031`. Language counts: `{'en': 3045, 'zh': 647, 'mixed': 339}`. Source counts: `{'infinity_instruct': 0, 'baai_industry_corpus': 1359, 'fineweb_edu': 0, 'wanjuan_cc': 0, 'fineweb': 1685, 'skypile_150b': 0, 'wikipedia_zh': 987}`.
