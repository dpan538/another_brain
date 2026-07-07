import tempfile
import unittest
from pathlib import Path

from src.browser_export.shard_writer import validate_shard_manifest, write_static_shards


class R27B1AShardManifestTests(unittest.TestCase):
    def test_static_shards_use_relative_same_origin_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = write_static_shards(
                output_dir=Path(tmp),
                tensors=[{"name": "w", "shape": [2, 2], "dtype": "float32", "numel": 4}],
                config={"vocab_size": 32},
                quantization={"quantization": "q4"},
            )
            self.assertEqual(validate_shard_manifest(manifest), [])
            self.assertEqual(len(manifest["tensor_shards"]), 1)
            self.assertFalse(manifest["tensor_shards"][0]["path"].startswith("/"))


if __name__ == "__main__":
    unittest.main()
