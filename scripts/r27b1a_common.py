from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_ROOT = ROOT / "artifacts" / "r27b1a"
CANDIDATE_ROOTS = [ROOT / "artifacts" / name for name in ("r27a7", "r27a6", "r27a5", "r27a4")]
CHECKPOINT_SUFFIXES = {".pt", ".pth", ".ckpt", ".safetensors"}


def repo_rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def find_candidate_checkpoints(prefer_latest: bool = False) -> list[Path]:
    candidates: list[Path] = []
    for root in CANDIDATE_ROOTS:
        if not root.exists():
            continue
        if prefer_latest:
            latest = read_json(root / "model_lab" / "latest_campaign.json", {})
            metrics_path = latest.get("metrics_path")
            if metrics_path:
                metrics = read_json(ROOT / metrics_path, {})
                checkpoint_path = metrics.get("checkpoint_path") or metrics.get("best_checkpoint_path")
                if checkpoint_path and (ROOT / checkpoint_path).exists():
                    candidates.append(ROOT / checkpoint_path)
        checkpoint_dir = root / "model_lab" / "checkpoints"
        if checkpoint_dir.exists():
            candidates.extend(path for path in checkpoint_dir.rglob("*") if path.suffix in CHECKPOINT_SUFFIXES)
    unique = []
    seen = set()
    for path in candidates:
        rel = repo_rel(path)
        if rel not in seen:
            seen.add(rel)
            unique.append(path)
    return sorted(unique, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=prefer_latest)


def load_checkpoint_state(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    if path.suffix == ".safetensors":
        raise RuntimeError("safetensors_inspection_not_available_without_optional_dependency")
    try:
        import torch
    except Exception as error:  # pragma: no cover - depends on local optional torch
        raise RuntimeError(f"torch_unavailable:{error}") from error
    checkpoint = torch.load(path, map_location="cpu")
    metadata = {}
    if isinstance(checkpoint, dict):
        for key in ("model_config", "config", "hparams", "meta"):
            if isinstance(checkpoint.get(key), dict):
                metadata.update(checkpoint[key])
        for key in ("model_state_dict", "state_dict", "model"):
            if isinstance(checkpoint.get(key), dict):
                return checkpoint[key], metadata
        tensor_like = {key: value for key, value in checkpoint.items() if hasattr(value, "shape")}
        if tensor_like:
            return tensor_like, metadata
    raise RuntimeError("unsupported_checkpoint_structure")


def ensure_no_export_assets_tracked() -> list[str]:
    import subprocess

    result = subprocess.run(["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True)
    tracked = result.stdout.splitlines()
    failures = []
    forbidden_prefixes = (
        "artifacts/r27b1a/exported_model/",
        "artifacts/r27b1a/quantized_model/",
        "artifacts/r27b1a/shards/",
    )
    forbidden_suffixes = (".onnx", ".safetensors", ".pt", ".pth", ".bin", ".gguf")
    for rel in tracked:
        if rel.startswith(forbidden_prefixes):
            failures.append(f"tracked_r27b1a_asset:{rel}")
        if rel.endswith(forbidden_suffixes) and not rel.startswith("static_llm/"):
            failures.append(f"tracked_model_artifact:{rel}")
        if rel.startswith("artifacts/") and rel != "artifacts/.gitkeep":
            failures.append(f"tracked_artifact:{rel}")
        if rel.startswith("artifacts/") and rel.endswith("tokenizer.json"):
            failures.append(f"tracked_tokenizer_artifact:{rel}")
    return failures


def safe_makedirs(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: dict[str, Any]) -> None:
    safe_makedirs(path.parent)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def mark_local_only_artifact_dir() -> None:
    safe_makedirs(ARTIFACT_ROOT)
    readme = ARTIFACT_ROOT / "README.local.txt"
    if not readme.exists():
        readme.write_text(
            "R27B1A export, quantization, shard, and ONNX experiment outputs are local ignored artifacts only.\n",
            encoding="utf-8",
        )


def env_no_gpu() -> None:
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
