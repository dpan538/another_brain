import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
R27A4_ART = ROOT / "artifacts/r27a4"


def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_r27a4_lineage():
    tokenizer_path = R27A4_ART / "model_lab/tokenizer/tokenizer.json"
    tokenizer_report_path = R27A4_ART / "model_lab/tokenizer/tokenizer_report.json"
    checkpoint_dir = R27A4_ART / "model_lab/checkpoints"
    checkpoints = sorted(checkpoint_dir.glob("*.pt"), key=lambda p: p.stat().st_mtime if p.exists() else 0)
    checkpoint_path = checkpoints[-1] if checkpoints else None
    tokenizer_report = {}
    if tokenizer_report_path.exists():
        tokenizer_report = json.loads(tokenizer_report_path.read_text(encoding="utf-8"))
    model_config = {}
    if checkpoint_path:
        try:
            import torch

            payload = torch.load(checkpoint_path, map_location="cpu")
            model_config = payload.get("config") or {}
        except Exception as exc:
            model_config = {"load_error": repr(exc)}
    vocab_size = int(tokenizer_report.get("vocab_size") or model_config.get("vocab_size") or 0)
    compatible = bool(
        checkpoint_path
        and tokenizer_path.exists()
        and vocab_size == 16000
        and model_config.get("model_size") == "mini_8m"
        and int(model_config.get("context_length", 0)) == 256
        and int(model_config.get("vocab_size", 0)) == vocab_size
    )
    reason = (
        "compatible_r27a4_mini8m_checkpoint_and_tokenizer_found"
        if compatible
        else "r27a4_checkpoint_or_tokenizer_missing_or_incompatible"
    )
    return {
        "r27a4_checkpoint_found": checkpoint_path is not None,
        "r27a4_tokenizer_found": tokenizer_path.exists(),
        "checkpoint_path": str(checkpoint_path.relative_to(ROOT)) if checkpoint_path else "",
        "tokenizer_path": str(tokenizer_path.relative_to(ROOT)) if tokenizer_path.exists() else "",
        "checkpoint_sha256": sha256_file(checkpoint_path) if checkpoint_path else "",
        "tokenizer_sha256": sha256_file(tokenizer_path) if tokenizer_path.exists() else "",
        "model_config": model_config,
        "vocab_size": vocab_size,
        "compatible_for_resume": compatible,
        "lineage_decision": "resume_r27a4_mini8m" if compatible else "new_r27a5_lineage",
        "decision_reason": reason,
        "tokenizer_reused": compatible,
        "tokenizer_must_not_change_on_resume": compatible,
    }
