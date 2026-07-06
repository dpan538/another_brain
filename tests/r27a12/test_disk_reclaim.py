import subprocess
import tempfile
import unittest
from pathlib import Path

from src.training.campaign import disk_reclaim


class R27A12DiskReclaimTests(unittest.TestCase):
    def test_plan_only_selects_ignored_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            repo = base / "another_brain_train_r27a12_test"
            repo.mkdir()
            subprocess.run(["git", "init"], cwd=repo, check=True, stdout=subprocess.DEVNULL)
            (repo / ".gitignore").write_text("artifacts/\n", encoding="utf-8")
            target = repo / "artifacts/r27a8b/model_lab/checkpoints/old.pt"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"x" * 1024)
            old = (disk_reclaim.DESKTOP, disk_reclaim.ROOT, disk_reclaim.ART, disk_reclaim.REPORTS)
            try:
                disk_reclaim.DESKTOP = base
                disk_reclaim.ROOT = repo
                disk_reclaim.ART = repo / "artifacts/r27a12"
                disk_reclaim.REPORTS = disk_reclaim.ART / "reports"
                plan = disk_reclaim.build_reclaim_plan(target_free_gb=999999)
                paths = [row["path"] for row in plan["selected_for_delete"]]
                self.assertIn(str(target), paths)
                self.assertFalse(any(".docx" in path for path in paths))
            finally:
                disk_reclaim.DESKTOP, disk_reclaim.ROOT, disk_reclaim.ART, disk_reclaim.REPORTS = old


if __name__ == "__main__":
    unittest.main()
