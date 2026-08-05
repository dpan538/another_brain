import unittest

from src.training.reference.r29b1r_q4 import validate_manifest


class Q4V2PackUnpackTests(unittest.TestCase):
    def test_malformed_manifest_is_rejected(self):
        # The public validator has no side effects and rejects absent shard data.
        from pathlib import Path
        import json
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps({"total_bytes": 1, "tensors": [{"name": "x", "offset": 1, "bytes": 1}], "shards": []}), encoding="utf-8")
            result = validate_manifest(path)
        self.assertFalse(result["ok"])
        self.assertIn("offset:x", result["errors"])
