import json
import unittest
from pathlib import Path

from src.training.reference.r29b1r_reference import ExactRuntimeTokenizer, wrapper_for_user


class RealFp32ReferenceTests(unittest.TestCase):
    def test_committed_runtime_tokenizer_round_trips_chinese_input(self):
        path = Path(__file__).resolve().parents[2] / "web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json"
        tokenizer = ExactRuntimeTokenizer.from_file(path)
        ids = tokenizer.encode("你好，今天怎么样？")
        self.assertEqual(ids[0], tokenizer.bos)
        self.assertTrue(tokenizer.decode(ids[1:]))

    def test_wrapper_has_explicit_user_and_answer_boundaries(self):
        wrapped = wrapper_for_user("你好")
        self.assertIn("用户：你好", wrapped)
        self.assertTrue(wrapped.endswith("回答："))
