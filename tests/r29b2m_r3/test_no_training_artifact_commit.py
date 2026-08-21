import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_no_r3_weights_outputs_or_absolute_machine_paths_are_tracked():
    tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
    r3 = [path for path in tracked if "r29b2m_r3" in path]
    assert not any(path.endswith((".safetensors", ".bin")) or path.startswith("artifacts/") for path in r3)
    for relative in r3:
        text = (ROOT / relative).read_text(encoding="utf-8")
        assert ("/" + "Users/") not in text
