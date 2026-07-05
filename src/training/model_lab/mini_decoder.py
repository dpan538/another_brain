import math
from collections import defaultdict


class BigramEngineeringDecoder:
    """Tiny from-scratch causal next-token lab model for bounded engineering runs."""

    def __init__(self, vocab_size, smoothing=0.1):
        self.vocab_size = int(vocab_size)
        self.smoothing = float(smoothing)
        self.counts = defaultdict(lambda: defaultdict(float))

    def update(self, tokens):
        for a, b in zip(tokens, tokens[1:]):
            self.counts[int(a)][int(b)] += 1.0

    def loss(self, sequences):
        total = 0
        nll = 0.0
        for seq in sequences:
            for a, b in zip(seq, seq[1:]):
                row = self.counts.get(int(a), {})
                denom = sum(row.values()) + self.smoothing * self.vocab_size
                prob = (row.get(int(b), 0.0) + self.smoothing) / max(denom, 1e-9)
                nll -= math.log(prob)
                total += 1
        return nll / max(1, total)

    def generate(self, prompt_tokens, max_new_tokens=24):
        out = list(prompt_tokens)
        for _ in range(max_new_tokens):
            row = self.counts.get(int(out[-1]), {})
            nxt = max(row.items(), key=lambda kv: kv[1])[0] if row else 3
            out.append(nxt)
            if nxt == 3:
                break
        return out
