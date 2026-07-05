#!/usr/bin/env python3
import json
from pathlib import Path

latest = Path("artifacts/r27a5/model_lab/latest_campaign.json")
print(json.dumps({"ok": latest.exists(), "resume_supported": True, "latest_campaign": json.loads(latest.read_text()) if latest.exists() else None}, indent=2))
