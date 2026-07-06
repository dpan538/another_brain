import os
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_SCAN_PATHS = [
    ROOT / "package.json",
    ROOT / "vercel.json",
    ROOT / "src/browser_runtime",
    ROOT / "web/another_brain_chat",
]
R27C0_RUNTIME_FILES = [
    ROOT / "src/browser_runtime/context_adapter.ts",
    ROOT / "src/browser_runtime/generation_loop.ts",
    ROOT / "src/browser_runtime/rag_packet.ts",
    ROOT / "web/another_brain_chat/context_bridge.js",
    ROOT / "web/another_brain_chat/app.js",
    ROOT / "web/another_brain_chat/browser_runtime.js",
]
TEXT_EXTENSIONS = {".html", ".js", ".json", ".mjs", ".ts"}


def iter_text_files(paths):
    for root in paths:
        if root.is_file() and root.suffix.lower() in TEXT_EXTENSIONS:
            yield root
        elif root.exists():
            for path in root.rglob("*"):
                if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS:
                    yield path


def read_production_text():
    parts = []
    for path in iter_text_files(PRODUCTION_SCAN_PATHS):
        parts.append(path.read_text(encoding="utf-8", errors="ignore"))
    return "\n".join(parts)


def read_r27c0_runtime_text():
    return "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in R27C0_RUNTIME_FILES)


class R27C0PrivacyBoundaryTests(unittest.TestCase):
    def test_no_oauth_or_google_service_config(self):
        text = read_production_text().lower()
        for forbidden in (
            "oauth",
            "googleapis",
            "gapi.",
            "gmail",
            "drive.file",
            "client_secret",
            "refresh_token",
        ):
            self.assertNotIn(forbidden, text)

    def test_no_backend_route_added(self):
        for rel in ("api", "pages/api", "app/api", "functions", "vercel/functions"):
            path = ROOT / rel
            self.assertFalse(path.exists(), f"backend route directory exists: {rel}")
        vercel = (ROOT / "vercel.json").read_text(encoding="utf-8")
        self.assertNotRegex(vercel, r'"functions"|"routes"')

    def test_local_bridge_does_not_write_repo_or_browser_storage(self):
        for rel in (
            "src/browser_runtime/context_adapter.ts",
            "web/another_brain_chat/context_bridge.js",
            "web/another_brain_chat/app.js",
            "web/another_brain_chat/browser_runtime.js",
        ):
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertNotRegex(text, r"\bwriteFile\b|\bappendFile\b|\bcreateWriteStream\b|\bfs\.")
            self.assertNotRegex(text, r"localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.storage")

    def test_no_remote_send_or_external_fetch_in_local_bridge(self):
        bridge = (ROOT / "web/another_brain_chat/context_bridge.js").read_text(encoding="utf-8")
        adapter = (ROOT / "src/browser_runtime/context_adapter.ts").read_text(encoding="utf-8")
        for text in (bridge, adapter):
            self.assertNotIn("fetch(", text)
            self.assertNotIn("XMLHttpRequest", text)
            self.assertNotIn("WebSocket", text)
            self.assertNotRegex(text, r"https?://(?!json-schema\.org)")

    def test_imported_text_is_not_promoted_to_training_or_private_raw_paths(self):
        text = read_r27c0_runtime_text()
        self.assertNotRegex(text, r"allowed_for_training\s*[:=]\s*true")
        self.assertNotRegex(text, r"training/current|data/public_ingestion|\.docx|\.pdf")
        self.assertNotRegex(text, r"promote.*training|training.*promotion.*true")

    def test_no_adapter_payloads_are_committed(self):
        forbidden = []
        for dirpath, dirnames, filenames in os.walk(ROOT):
            rel_dir = Path(dirpath).relative_to(ROOT).as_posix()
            dirnames[:] = [name for name in dirnames if name not in {".git", "node_modules"}]
            if re.search(r"(^|/)adapter_payloads($|/)|(^|/)context_payloads($|/)", rel_dir):
                forbidden.append(rel_dir)
            for filename in filenames:
                if re.search(r"\.(adapter|context|evidence|state)-packet\.json$", filename):
                    forbidden.append((Path(rel_dir) / filename).as_posix())
        self.assertEqual(forbidden, [])

    def test_gitignore_blocks_local_adapter_payloads(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        for required in (
            "adapter_payloads/",
            "context_payloads/",
            "*.adapter-packet.json",
            "*.evidence-packet.json",
            "*.state-packet.json",
        ):
            self.assertIn(required, gitignore)


if __name__ == "__main__":
    unittest.main()
