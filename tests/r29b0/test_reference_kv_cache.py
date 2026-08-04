import unittest
from src.training.reference.r29b0_reference_inference import ReferenceDecoder

def fixture():
 d=4; tensors={"token_emb.weight":[[.1*(i+j+1) for j in range(d)] for i in range(6)],"pos_emb.weight":[[.01*(i+j) for j in range(d)] for i in range(8)],"ln_f.weight":[1]*d,"ln_f.bias":[0]*d,"lm_head.weight":[[.05*(i+j+1) for j in range(d)] for i in range(6)]}
 for l in range(1):
  p=f"blocks.{l}."; tensors.update({p+"ln1.weight":[1]*d,p+"ln1.bias":[0]*d,p+"attn.attn.in_proj_weight":[[.03*(i+j+1) for j in range(d)] for i in range(3*d)],p+"attn.attn.in_proj_bias":[0]*(3*d),p+"attn.attn.out_proj.weight":[[.02*(i+j+1) for j in range(d)] for i in range(d)],p+"attn.attn.out_proj.bias":[0]*d,p+"ln2.weight":[1]*d,p+"ln2.bias":[0]*d,p+"mlp.0.weight":[[.01*(i+j+1) for j in range(d)] for i in range(4*d)],p+"mlp.0.bias":[0]*(4*d),p+"mlp.2.weight":[[.01*(i+j+1) for j in range(4*d)] for i in range(d)],p+"mlp.2.bias":[0]*d})
 return ReferenceDecoder(tensors,n_layer=1,n_head=2,context_length=8)
class KVParity(unittest.TestCase):
 def test_prefill_incremental_matches_recompute(self):
  m=fixture(); _,cache=m.prefill([1,2]); inc=m.step(3,cache); full=m.full_recompute_logits([1,2,3]); self.assertEqual(inc,full)
 def test_overflow_is_explicit(self):
  m=fixture(); cache=m.empty_cache(); m.prefill(list(range(6)),cache)
  with self.assertRaises(ValueError): m.prefill([1,2,3],cache)
