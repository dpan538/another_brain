from __future__ import annotations

import json
from pathlib import Path
import random
import subprocess

import numpy as np

from src.training.mlx.r29b2m_q4_source import (
    decode_offset_binary_int4_mlx,
    decode_offset_binary_int4_numpy,
)


ROOT = Path(__file__).resolve().parents[2]
JS_DECODER = ROOT / "web" / "another_brain_chat" / "q4_integer_encoding.js"


def pack_exporter_compatible(signed_values: list[int]) -> tuple[bytes, int]:
    """Mirror r28m0 `_pack_float_q4` after rounding/clamping."""
    stored = [max(-8, min(7, int(value))) + 8 for value in signed_values]
    pad_nibbles = len(stored) % 2
    if pad_nibbles:
        stored.append(0)
    return bytes(stored[i] | (stored[i + 1] << 4) for i in range(0, len(stored), 2)), pad_nibbles


def decode_javascript(raw: bytes, *, count: int, scale: float) -> list[float]:
    program = """
import { unpackOffsetBinaryQ4 } from %s;
const bytes = Uint8Array.from(%s);
const decoded = unpackOffsetBinaryQ4(bytes, {scale: %s, padNibbles: bytes.length * 2 - %s});
console.log(JSON.stringify(Array.from(decoded)));
""" % (json.dumps(JS_DECODER.as_uri()), json.dumps(list(raw)), json.dumps(scale), count)
    result = subprocess.run(["node", "--input-type=module", "-e", program], cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def assert_parity(signed: list[int], scale: float) -> None:
    raw, _ = pack_exporter_compatible(signed)
    numpy_ints = decode_offset_binary_int4_numpy(raw, len(signed))
    mlx_ints = np.asarray(decode_offset_binary_int4_mlx(raw, len(signed)))
    javascript_values = np.asarray(decode_javascript(raw, count=len(signed), scale=scale), dtype=np.float32)
    assert np.array_equal(numpy_ints, np.asarray(signed, dtype=np.int8))
    assert np.array_equal(mlx_ints, numpy_ints)
    assert np.allclose(javascript_values, numpy_ints.astype(np.float32) * np.float32(scale), rtol=0, atol=1e-6)


def test_fixed_encoding_vectors_and_all_nibbles():
    assert pack_exporter_compatible([-8, -7])[0] == bytes([0x10])
    assert pack_exporter_compatible([0, 7])[0] == bytes([0xF8])
    assert decode_offset_binary_int4_numpy(bytes([0x10]), 2).tolist() == [-8, -7]
    assert decode_offset_binary_int4_numpy(bytes([0xF8]), 2).tolist() == [0, 7]
    assert_parity(list(range(-8, 8)), 0.25)


def test_random_packed_values_odd_padding_order_and_scale():
    rng = random.Random(290201)
    for count in (1, 3, 17, 128):
        values = [rng.randint(-8, 7) for _ in range(count)]
        assert_parity(values, 0.03125)
