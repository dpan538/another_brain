#!/usr/bin/env python3
"""Link optional local-only assets into web/ without exposing private artifacts."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Link optional local-only assets into web/.")
    parser.add_argument("--web-dir", default="web")
    parser.add_argument("--models-dir", default="models")
    args = parser.parse_args()

    web_dir = Path(args.web_dir)
    models_dir = Path(args.models_dir)
    link = web_dir / "models"
    if not models_dir.exists():
        raise SystemExit(f"Missing models directory: {models_dir}")
    if link.exists() or link.is_symlink():
        if link.is_symlink() and link.readlink() == Path("../models"):
            print(f"Already linked: {link} -> ../models")
            return 0
        raise SystemExit(f"Refusing to overwrite existing path: {link}")
    link.symlink_to(Path("../models"))
    print(f"Linked {link} -> ../models")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
