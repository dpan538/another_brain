import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27A7TrainingStreamsTests(unittest.TestCase):
    def test_r27a6_stream_source_exists(self):
        self.assertTrue((ROOT / "artifacts/r27a6/training_mix").exists())

    def test_no_artifact_streams_tracked(self):
        import subprocess
        tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True).stdout
        self.assertNotIn("artifacts/r27a7/training_mix", tracked)


if __name__ == "__main__":
    unittest.main()
