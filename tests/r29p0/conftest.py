from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]


def run_contract(name: str) -> None:
    completed = subprocess.run(
        ["node", "--experimental-strip-types", "scripts/r29p0_contract_test.mjs", name],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
    )
    if completed.returncode != 0:
        raise AssertionError(f"{name} failed\nstdout:\n{completed.stdout}\nstderr:\n{completed.stderr}")
