import json
from collections import Counter
from pathlib import Path


def train_char_tokenizer(texts, out_dir, vocab_limit=8192):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    counter = Counter()
    for text in texts:
        counter.update(str(text))
    chars = ["<pad>", "<unk>", "<bos>", "<eos>"] + [ch for ch, _ in counter.most_common(max(0, vocab_limit - 4))]
    vocab = {ch: i for i, ch in enumerate(chars)}
    path = out / "tokenizer.json"
    path.write_text(json.dumps({"type": "char_fallback", "vocab": vocab}, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    return {"tokenizer_path": str(path), "vocab_size": len(vocab), "type": "char_fallback"}
