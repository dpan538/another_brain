import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_old_generator_default_execution_is_denied_before_path_reads(tmp_path):
    result = subprocess.run(
        [sys.executable, "scripts/r29b2m_r1_prepare_dataset.py", "--artifact-root", str(tmp_path), "--tokenizer", str(tmp_path / "missing")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 3
    assert "REJECTED_GENERATOR_DO_NOT_USE_FOR_TRAINING" in result.stderr
    assert not (tmp_path / "dataset").exists()
