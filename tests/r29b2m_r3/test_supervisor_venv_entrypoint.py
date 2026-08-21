from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_supervisor_does_not_resolve_away_the_venv_entrypoint():
    source = (ROOT / "scripts" / "r29b2m_r3_run_supervisor.py").read_text(encoding="utf-8")
    property_body = source.split("def python(self)", 1)[1].split("@property", 1)[0]
    assert "venv_python.absolute()" in property_body
    assert "venv_python.resolve()" not in property_body
