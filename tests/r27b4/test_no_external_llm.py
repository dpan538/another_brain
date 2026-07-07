import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B4NoExternalLlmTests(unittest.TestCase):
    def test_chat_runtime_has_no_external_llm_endpoint(self):
        scanned = []
        for root in [ROOT / "web/another_brain_chat", ROOT / "src/browser_runtime"]:
            scanned.extend(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in {".js", ".ts"})
        text = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in scanned)
        self.assertNotRegex(
            text,
            r"api\.openai\.com|openai\.com/v1|anthropic\.com|replicate\.com|huggingface\.co|doubao|dashscope|volces",
        )
        self.assertNotRegex(text, r"pinecone|weaviate|qdrant\.cloud|@vercel/blob|upstash|supabase")


if __name__ == "__main__":
    unittest.main()
