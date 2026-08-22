from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]


def run_contract(name: str) -> None:
    result = subprocess.run(
        ["node", "--experimental-strip-types", "scripts/r29b2m_r4h_r3_test_driver.mjs", name],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
