from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_supervisor_does_not_resolve_away_the_venv_entrypoint():
    source = (ROOT / "scripts" / "r29b2m_r3_run_supervisor.py").read_text(encoding="utf-8")
    property_body = source.split("def python(self)", 1)[1].split("@property", 1)[0]
    assert "venv_python.absolute()" in property_body
    assert "venv_python.resolve()" not in property_body


def test_source_revision_can_advance_only_before_training():
    source = (ROOT / "scripts" / "r29b2m_r3_run_supervisor.py").read_text(encoding="utf-8")
    assert "source_revision_changed_after_training_started" in source
    assert 'self.state["source_revision"] = current_revision' in source


def test_invalid_resume_proof_is_rerun_before_training():
    source = (ROOT / "scripts" / "r29b2m_r3_run_supervisor.py").read_text(encoding="utf-8")
    assert "def _valid_report(path: Path) -> bool:" in source
    assert "if not _valid_report(resume_proof):" in source
