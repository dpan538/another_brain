import json


class CharTokenizer:
    def __init__(self, vocab):
        self.vocab = vocab
        self.inv = {v: k for k, v in vocab.items()}
        self.unk = vocab.get("<unk>", 1)
        self.bos = vocab.get("<bos>", 2)
        self.eos = vocab.get("<eos>", 3)

    @classmethod
    def from_file(cls, path):
        with open(path, "r", encoding="utf-8") as handle:
            return cls(json.load(handle)["vocab"])

    def encode(self, text):
        return [self.bos] + [self.vocab.get(ch, self.unk) for ch in str(text)] + [self.eos]

    def decode(self, ids):
        return "".join(self.inv.get(int(i), "") for i in ids if self.inv.get(int(i), "") not in {"<bos>", "<eos>", "<pad>"})


class BPETokenizerRuntime:
    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        self.bos = tokenizer.token_to_id("<bos>") or 2
        self.eos = tokenizer.token_to_id("<eos>") or 3

    @classmethod
    def from_file(cls, path):
        from tokenizers import Tokenizer
        return cls(Tokenizer.from_file(str(path)))

    def encode(self, text):
        return self.tokenizer.encode(str(text)).ids

    def decode(self, ids):
        return self.tokenizer.decode([int(i) for i in ids], skip_special_tokens=True)
