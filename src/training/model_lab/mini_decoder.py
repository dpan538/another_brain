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


def build_tiny_gpt(vocab_size, context_length=256, n_layer=3, n_head=4, n_embd=192, dropout=0.05):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    class CausalSelfAttention(nn.Module):
        def __init__(self):
            super().__init__()
            self.attn = nn.MultiheadAttention(n_embd, n_head, dropout=dropout, batch_first=True)
            self.register_buffer("mask", torch.triu(torch.ones(context_length, context_length, dtype=torch.bool), diagonal=1))

        def forward(self, x):
            t = x.size(1)
            y, _ = self.attn(x, x, x, attn_mask=self.mask[:t, :t])
            return y

    class Block(nn.Module):
        def __init__(self):
            super().__init__()
            self.ln1 = nn.LayerNorm(n_embd)
            self.attn = CausalSelfAttention()
            self.ln2 = nn.LayerNorm(n_embd)
            self.mlp = nn.Sequential(nn.Linear(n_embd, 4 * n_embd), nn.GELU(), nn.Linear(4 * n_embd, n_embd), nn.Dropout(dropout))

        def forward(self, x):
            x = x + self.attn(self.ln1(x))
            x = x + self.mlp(self.ln2(x))
            return x

    class TinyGPTLanguageModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.token_emb = nn.Embedding(vocab_size, n_embd)
            self.pos_emb = nn.Embedding(context_length, n_embd)
            self.drop = nn.Dropout(dropout)
            self.blocks = nn.Sequential(*[Block() for _ in range(n_layer)])
            self.ln_f = nn.LayerNorm(n_embd)
            self.lm_head = nn.Linear(n_embd, vocab_size, bias=False)
            self.context_length = context_length

        def forward(self, idx, targets=None):
            b, t = idx.shape
            pos = torch.arange(0, t, device=idx.device)
            x = self.drop(self.token_emb(idx) + self.pos_emb(pos)[None, :, :])
            x = self.blocks(x)
            logits = self.lm_head(self.ln_f(x))
            loss = None
            if targets is not None:
                loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), targets.reshape(-1))
            return logits, loss

    return TinyGPTLanguageModel()
