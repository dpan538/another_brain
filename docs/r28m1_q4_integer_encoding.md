# R28M1 q4 integer encoding

R28M1 uses `signed_int4_offset_binary`. This document records the integer
serialization contract implemented by `src/product_prelaunch/r28m0_dryrun.py`.
It is an encoding-correctness contract, not browser, contextual-inference,
product, release, or model-quality admission.

## Contract

- Quantized signed range: `[-8, 7]`.
- Scale: `max(abs(values)) / 7` for a nonzero tensor, otherwise `1.0`.
- Quantization: `q_signed = round(value / scale).clamp(-8, 7)`.
- Stored nibble: `q_signed + 8`; the zero point is `8`.
- Decode integer: `stored_nibble - 8`; multiply by the per-tensor scale after
  integer decoding.
- Nibble order: low nibble first, then high nibble.
- Odd q4 tensors append one stored nibble `0`; `pad_nibbles = 1` removes it
  after decode. The padding nibble is storage only and would decode to `-8` if
  it were not removed.
- Boolean tensors are separate `bitpack_bool` records. Bits are packed little
  endian within each byte and `pad_bits` describes trailing storage padding.

## Worked bytes

| Signed integers | Stored nibbles | Packed byte | Decode |
| --- | --- | --- | --- |
| `[-8, -7]` | `[0, 1]` | `0x10` | `[0 - 8, 1 - 8] = [-8, -7]` |
| `[0, 7]` | `[8, 15]` | `0xF8` | `[8 - 8, 15 - 8] = [0, 7]` |

`0x10` therefore decodes low-then-high to `[-8, -7]`, and `0xF8` decodes to
`[0, 7]`. Two's-complement nibble decoding is incompatible with this package.
