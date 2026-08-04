"""Canonical pre-LN decoder reference with causal prefill and incremental KV.

The production 96M loader is intentionally separate: this module exposes the
architecture-exact calculation and tiny deterministic fixtures first, so no
single-token shortcut can be called contextual inference.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import math

def _add(a,b): return [x+y for x,y in zip(a,b)]
def _matvec(w,x,b=None): return [sum(row[j]*x[j] for j in range(len(x)))+(b[i] if b else 0.0) for i,row in enumerate(w)]
def _norm(x,w,b,eps=1e-5):
    mean=sum(x)/len(x); var=sum((v-mean)**2 for v in x)/len(x); inv=1/math.sqrt(var+eps)
    return [(v-mean)*inv*w[i]+b[i] for i,v in enumerate(x)]
def _gelu(x): return .5*x*(1+math.erf(x/math.sqrt(2)))
def _softmax(xs):
    top=max(xs); ex=[math.exp(x-top) for x in xs]; total=sum(ex); return [x/total for x in ex]

@dataclass
class KVCache:
    keys: list[list[list[float]]]
    values: list[list[list[float]]]
    sequence_length: int = 0
    position_index: int = 0
    dtype: str = "float32"
    device: str = "cpu"
    context_capacity: int = 256
    def reset(self): self.keys=[[] for _ in self.keys]; self.values=[[] for _ in self.values]; self.sequence_length=0; self.position_index=0

class ReferenceDecoder:
    """Exact forward order of `mini_decoder.py`: pre-LN, attention, residual, MLP."""
    def __init__(self, tensors:dict[str,Any], *, n_layer:int,n_head:int,context_length:int):
        self.t=tensors; self.n_layer=n_layer; self.n_head=n_head; self.context_length=context_length
        self.n_embd=len(tensors["ln_f.weight"]); assert self.n_embd % n_head == 0
    def empty_cache(self): return KVCache([[] for _ in range(self.n_layer)],[[] for _ in range(self.n_layer)],context_capacity=self.context_length)
    def _block(self,h,layer,cache):
        p=f"blocks.{layer}."; qkv=_matvec(self.t[p+"attn.attn.in_proj_weight"],_norm(h,self.t[p+"ln1.weight"],self.t[p+"ln1.bias"]),self.t[p+"attn.attn.in_proj_bias"])
        d=self.n_embd; head=d//self.n_head; q,k,v=qkv[:d],qkv[d:2*d],qkv[2*d:]
        cache.keys[layer].append(k); cache.values[layer].append(v); attended=[]
        for head_id in range(self.n_head):
            start=head_id*head; scores=[sum(q[start+i]*old[start+i] for i in range(head))/math.sqrt(head) for old in cache.keys[layer]]; weights=_softmax(scores)
            attended.extend([sum(weights[pos]*cache.values[layer][pos][start+i] for pos in range(len(weights))) for i in range(head)])
        h=_add(h,_matvec(self.t[p+"attn.attn.out_proj.weight"],attended,self.t[p+"attn.attn.out_proj.bias"]))
        m=_matvec(self.t[p+"mlp.0.weight"],_norm(h,self.t[p+"ln2.weight"],self.t[p+"ln2.bias"]),self.t[p+"mlp.0.bias"]); m=[_gelu(v) for v in m]
        return _add(h,_matvec(self.t[p+"mlp.2.weight"],m,self.t[p+"mlp.2.bias"]))
    def step(self, token_id:int, cache:KVCache):
        if cache.sequence_length >= self.context_length: raise ValueError("context_overflow")
        h=_add(self.t["token_emb.weight"][token_id],self.t["pos_emb.weight"][cache.position_index])
        for layer in range(self.n_layer): h=self._block(h,layer,cache)
        cache.sequence_length+=1; cache.position_index+=1
        return _matvec(self.t["lm_head.weight"],_norm(h,self.t["ln_f.weight"],self.t["ln_f.bias"]))
    def prefill(self, token_ids:list[int], cache:KVCache|None=None):
        cache=cache or self.empty_cache(); logits=None
        for token in token_ids: logits=self.step(token,cache)
        return logits,cache
    def full_recompute_logits(self, token_ids):
        return self.prefill(token_ids,self.empty_cache())[0]
