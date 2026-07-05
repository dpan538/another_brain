import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B1CChatRouteTests(unittest.TestCase):
    def test_chat_route_exists_and_uses_static_runtime(self):
        html = (ROOT / "web/another_brain_chat/index.html").read_text(encoding="utf-8")
        app = (ROOT / "web/another_brain_chat/app.js").read_text(encoding="utf-8")
        runtime = (ROOT / "web/another_brain_chat/browser_runtime.js").read_text(encoding="utf-8")
        self.assertIn("chat-form", html)
        self.assertIn("No backend inference", html)
        self.assertIn("./app.js", html)
        self.assertIn("./browser_runtime.js", app)
        self.assertIn("BrowserChatRuntime", runtime)
        self.assertIn("backend_inference: false", runtime)


if __name__ == "__main__":
    unittest.main()
