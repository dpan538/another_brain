import tempfile
import unittest
from pathlib import Path

from src.training.curriculum import r27a12_stream_builder as streams


class R27A12TrainingStreamsTests(unittest.TestCase):
    def test_reuses_preserved_streams_without_forbidden_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            for rel in streams.REQUIRED.values():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('{"text":"hello"}\n', encoding="utf-8")
            out = Path(tmp) / "repo"
            old = (streams.ROOT, streams.ART, streams.REPORTS, streams.PRIOR_ROOTS)
            try:
                streams.ROOT = out
                streams.ART = out / "artifacts/r27a12"
                streams.REPORTS = streams.ART / "reports"
                streams.PRIOR_ROOTS = [root]
                report = streams.build_or_reuse_streams()
            finally:
                streams.ROOT, streams.ART, streams.REPORTS, streams.PRIOR_ROOTS = old
        self.assertTrue(report["ok"])
        self.assertFalse(report["old_question_pack_51_100_used"])


if __name__ == "__main__":
    unittest.main()
