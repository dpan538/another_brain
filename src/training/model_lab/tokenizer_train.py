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


def train_bpe_tokenizer(texts, out_dir, vocab_size=8000, min_frequency=2):
    from tokenizers import Tokenizer
    from tokenizers.models import BPE
    from tokenizers.pre_tokenizers import ByteLevel
    from tokenizers.processors import TemplateProcessing
    from tokenizers.trainers import BpeTrainer

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    special_tokens = ["<pad>", "<unk>", "<bos>", "<eos>"]
    tokenizer = Tokenizer(BPE(unk_token="<unk>"))
    tokenizer.pre_tokenizer = ByteLevel(add_prefix_space=False)
    trainer = BpeTrainer(vocab_size=int(vocab_size), min_frequency=int(min_frequency), special_tokens=special_tokens)
    tokenizer.train_from_iterator((str(text) for text in texts if str(text).strip()), trainer=trainer)
    tokenizer.post_processor = TemplateProcessing(
        single="<bos> $A <eos>",
        special_tokens=[("<bos>", tokenizer.token_to_id("<bos>")), ("<eos>", tokenizer.token_to_id("<eos>"))],
    )
    path = out / "tokenizer.json"
    tokenizer.save(str(path))
    return {
        "tokenizer_path": str(path),
        "vocab_size": tokenizer.get_vocab_size(),
        "type": "bytelevel_bpe",
        "min_frequency": int(min_frequency),
        "requested_vocab_size": int(vocab_size),
    }


def train_chinese_aware_bpe_tokenizer(texts, out_dir, vocab_size=16000, min_frequency=2):
    from tokenizers import Tokenizer
    from tokenizers.models import BPE
    from tokenizers.normalizers import NFKC
    from tokenizers.pre_tokenizers import Sequence, Split, ByteLevel
    from tokenizers.processors import TemplateProcessing
    from tokenizers.trainers import BpeTrainer

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    special_tokens = ["<pad>", "<unk>", "<bos>", "<eos>"]
    tokenizer = Tokenizer(BPE(unk_token="<unk>"))
    tokenizer.normalizer = NFKC()
    tokenizer.pre_tokenizer = Sequence([
        Split(pattern=r"([\u4e00-\u9fff])", behavior="isolated"),
        ByteLevel(add_prefix_space=False),
    ])
    trainer = BpeTrainer(vocab_size=int(vocab_size), min_frequency=int(min_frequency), special_tokens=special_tokens)
    tokenizer.train_from_iterator((str(text) for text in texts if str(text).strip()), trainer=trainer)
    tokenizer.post_processor = TemplateProcessing(
        single="<bos> $A <eos>",
        special_tokens=[("<bos>", tokenizer.token_to_id("<bos>")), ("<eos>", tokenizer.token_to_id("<eos>"))],
    )
    path = out / "tokenizer.json"
    tokenizer.save(str(path))
    return {
        "tokenizer_path": str(path),
        "vocab_size": tokenizer.get_vocab_size(),
        "type": "chinese_aware_bpe",
        "min_frequency": int(min_frequency),
        "requested_vocab_size": int(vocab_size),
    }
