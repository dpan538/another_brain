import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B0StaticOnlyTests(unittest.TestCase):
    def test_chat_shell_contains_required_surface_controls(self):
        html = (ROOT / "web/another_brain_chat/index.html").read_text(encoding="utf-8")
        for required in (
            "message-list",
            "chat-input",
            "send-button",
            "local-indicator",
            "backend-badge",
            "model-status",
            "debug-toggle",
            "verifier-status",
            "fallback-status",
            "No backend inference",
        ):
            self.assertIn(required, html)

    def test_runtime_interfaces_are_present(self):
        runtime = (ROOT / "web/another_brain_chat/runtime_interfaces.js").read_text(encoding="utf-8")
        for required in (
            "BrowserModelRuntime",
            "TokenizerRuntime",
            "LocalRetrievalRuntime",
            "VerifierRuntime",
            "FinalizerRuntime",
            "FallbackRuntime",
            "input",
            "state_packet",
            "retrieved_evidence",
            "decoder_draft",
            "verifier_result",
            "final_answer",
            "fallback_used",
        ):
            self.assertIn(required, runtime)

    def test_mock_runtime_declares_no_external_calls(self):
        for rel in (
            "web/another_brain_chat/app.js",
            "web/another_brain_chat/mock_runtime.js",
            "web/another_brain_chat/runtime_interfaces.js",
        ):
            text = (ROOT / rel).read_text(encoding="utf-8")
            if rel.endswith("app.js"):
                self.assertIn("runtime_mode.json", text)
            else:
                self.assertNotIn("fetch(", text)
            self.assertNotIn("XMLHttpRequest", text)
            self.assertNotIn("WebSocket", text)
            self.assertNotRegex(text, r"https?://")

    def test_static_only_gate_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r27b0_check_static_only.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("passed", result.stdout)

    def test_manifest_has_empty_runtime_assets(self):
        manifest = json.loads((ROOT / "web/another_brain/asset_manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["model_assets"] + manifest["tokenizer_assets"], [])
        for item in manifest["rag_assets"] + manifest["gate_assets"]:
            self.assertFalse(item["path"].startswith(("http://", "https://", "//")))
            self.assertTrue((ROOT / "web" / item["path"]).exists())


if __name__ == "__main__":
    unittest.main()
