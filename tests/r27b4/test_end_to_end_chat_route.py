import json
import subprocess
import textwrap
import unittest
from pathlib import Path

from scripts.r27b1c_vercel_rehearsal import route_smoke


ROOT = Path(__file__).resolve().parents[2]


class R27B4EndToEndChatRouteTests(unittest.TestCase):
    def test_chat_route_serves_static_shell(self):
        report = route_smoke()
        self.assertTrue(report["ok"], report["failures"])
        if report.get("ran"):
            routes = {item["route"]: item for item in report["routes"]}
            self.assertEqual(routes["/another_brain_chat/"]["status"], 200)
            self.assertEqual(routes["/another_brain_chat/browser_runtime.js"]["status"], 200)
        else:
            html = (ROOT / "web/another_brain_chat/index.html").read_text(encoding="utf-8")
            runtime = (ROOT / "web/another_brain_chat/browser_runtime.js").read_text(encoding="utf-8")
            self.assertIn("chat-form", html)
            self.assertIn("runtime_mode.json", (ROOT / "web/another_brain_chat/app.js").read_text(encoding="utf-8"))
            self.assertIn("BrowserChatRuntime", runtime)

    def test_browser_runtime_pipeline_and_fallback_smoke(self):
        script = textwrap.dedent(
            """
            import { BrowserChatRuntime } from './web/another_brain_chat/browser_runtime.js';
            const records = [{
              source_id: 'demo',
              title: 'Browser memory surface',
              text: 'The browser chat surface retrieves local evidence packets before drafting.',
              trust_level: 'high',
              license_or_origin: 'synthetic demo fixture',
              can_answer: true,
              keywords: ['browser', 'memory', 'evidence']
            }];
            const runtime = new BrowserChatRuntime({
              mode: 'synthetic_tiny',
              deliveryConfig: { delivery_mode: 'demo_static', rag_mode: 'static_demo', product_model: false }
            });
            runtime.capabilities.worker_available = false;
            runtime.memoryRecords = records;
            const okPacket = await runtime.run('browser memory evidence');
            runtime.memoryRecords = [];
            const fallbackPacket = await runtime.run('unknown private topic');
            console.log(JSON.stringify({
              okFinal: Boolean(okPacket.final_answer),
              okFallback: okPacket.fallback_used,
              okEvidence: okPacket.evidence_packet.evidence_status,
              fallbackUsed: fallbackPacket.fallback_used,
              fallbackFailures: fallbackPacket.verifier_result.failures
            }));
            """
        )
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        payload = json.loads(result.stdout)
        self.assertEqual(payload["okFinal"], True)
        self.assertEqual(payload["okFallback"], False)
        self.assertEqual(payload["okEvidence"], "sufficient")
        self.assertEqual(payload["fallbackUsed"], True)
        self.assertIn("empty_evidence", payload["fallbackFailures"])


if __name__ == "__main__":
    unittest.main()
