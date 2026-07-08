import tempfile
import unittest
from pathlib import Path

from src.training.model_lab.tokenizer_runtime import BPETokenizerRuntime


class R28A13TokenizerDecodeTests(unittest.TestCase):
    def test_bytelevel_bpe_without_decoder_round_trips_chinese(self):
        from tokenizers import Tokenizer, models, normalizers, pre_tokenizers, trainers

        tokenizer = Tokenizer(models.BPE(unk_token="<unk>"))
        tokenizer.normalizer = normalizers.NFKC()
        tokenizer.pre_tokenizer = pre_tokenizers.Sequence(
            [
                pre_tokenizers.Split("([\u4e00-\u9fff])", "isolated"),
                pre_tokenizers.ByteLevel(add_prefix_space=False, trim_offsets=True),
            ]
        )
        trainer = trainers.BpeTrainer(vocab_size=80, special_tokens=["<pad>", "<unk>", "<bos>", "<eos>"])
        tokenizer.train_from_iterator(["你好，什么是美？", "材料不足就停住。"], trainer)

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tokenizer.json"
            tokenizer.save(str(path))
            runtime = BPETokenizerRuntime.from_file(path)
            decoded = runtime.decode(runtime.encode("你好，什么是美？"))

        self.assertIn("你好", decoded)
        self.assertIn("美", decoded)
        self.assertNotIn("ä½", decoded)


if __name__ == "__main__":
    unittest.main()
