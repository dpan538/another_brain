import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCAN_PATHS = [
    ROOT / "web/another_brain_chat",
    ROOT / "web/another_brain",
    ROOT / "src/browser_runtime",
    ROOT / "vercel.json",
]


class R27B4NoBackendInferenceTests(unittest.TestCase):
    def test_no_backend_inference_surfaces(self):
        text = "\n".join(
            path.read_text(encoding="utf-8", errors="ignore")
            for root in SCAN_PATHS
            for path in ([root] if root.is_file() else root.rglob("*"))
            if path.is_file() and path.suffix.lower() in {".html", ".js", ".json", ".ts"}
        )
        self.assertNotRegex(text, r"FastAPI|Flask|app\.post|pages/api|app/api|EdgeRuntime|runtime:\s*['\"]edge")
        self.assertIn("backend_inference", text)


if __name__ == "__main__":
    unittest.main()
