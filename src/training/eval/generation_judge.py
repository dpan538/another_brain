def judge_probe(label, generated_text=""):
    text = str(generated_text or "")
    lowered = text.lower()
    return {
        "probe": label,
        "passed": "chain-of-thought" not in lowered and "hidden prompt" not in lowered and "private_sources/" not in lowered,
        "notes": "structural_probe_placeholder_engineering_only",
    }
