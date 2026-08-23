from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "r30j1c_ingest_manual_owner_evidence.py"
SPEC = importlib.util.spec_from_file_location("r30j1c_ingestion", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def synthetic_png() -> bytes:
    return (
        MODULE.PNG_SIGNATURE
        + struct.pack(">I", 13)
        + b"IHDR"
        + struct.pack(">II", 1, 1)
        + b"\x08\x06\x00\x00\x00"
    )


def synthetic_payload() -> dict:
    return {
        "version": "manual-owner-evidence.input.v1",
        "source_id": "synthetic-source-001",
        "source_family_id": "synthetic-family-001",
        "source_class": "HIGH_INFORMATION_AUTHENTIC_PERSONAL_SOURCE",
        "source_scope": "EVIDENCE_BEARING_MESSAGES_ONLY",
        "owner_review_completed": False,
        "gold_admission_status": "PENDING_OWNER_CORRECTION",
        "allowed_for_training": False,
        "training_authorized": False,
        "privacy_review": {
            "manual_review_completed": True,
            "direct_owner_sensitive_content_detected": False,
            "third_party_identifiers_removed": True,
            "avatars_removed_from_derived": True,
            "exact_timestamps_removed": True,
            "quote_blocks_separated": True,
            "sensitive_sections_excluded_count": 0,
        },
        "screenshot_ids": ["shot-001"],
        "owner_assertions": [
            {
                "assertion_id": "assertion-001",
                "assertion_kind": "synthetic_context",
                "value": "synthetic-value",
                "evidence_class": "CURRENT_EXPLICIT_OWNER_ASSERTION",
                "assertion_scope": "CONTEXT_FACT",
                "generalization_scope": "synthetic_context_only",
                "authorship_confidence": 1.0,
                "descriptive_confidence": 1.0,
            }
        ],
        "alias_timeline": [
            {"period": "synthetic-period", "alias": "synthetic-alias", "local_provenance_only": True}
        ],
        "messages": [
            {
                "message_id": "message-001",
                "sequence_index": 1,
                "turn_cluster_id": "owner-burst-001",
                "speaker_role": "OWNER",
                "body": "synthetic direct body",
                "quote": {
                    "speaker_role": "PEER_ANONYMOUS",
                    "speaker_id": "PEER_001",
                    "body": "synthetic peer quote",
                },
                "screenshot_ids": ["shot-001"],
                "evidence_class": "OWNER_CHAT_TRANSCRIPT_HIGH_CONFIDENCE",
            }
        ],
        "non_text_owner_events": [
            {
                "event_id": "event-001",
                "speaker_role": "OWNER",
                "event_type": "NON_TEXT_MEDIA",
                "owner_style_admissible": False,
                "screenshot_ids": ["shot-001"],
            }
        ],
        "quoted_owner_attributions": [
            {
                "attribution_id": "attribution-001",
                "evidence_class": "QUOTED_OWNER_ATTRIBUTION_UNVERIFIED",
                "quoting_peer_id": "PEER_001",
                "quoted_body": "synthetic unverified owner quote",
                "screenshot_ids": ["shot-001"],
            }
        ],
        "peer_reception": [
            {
                "evidence_id": "peer-evidence-001",
                "evidence_class": "PEER_RECEPTION_EVIDENCE",
                "peer_speaker_id": "PEER_001",
                "body": "synthetic descriptive reception",
                "claim_code": "synthetic_reception",
                "convergence_cluster_id": "reception-cluster-001",
                "independent_speaker_count": 1,
                "descriptive_confidence": 0.7,
                "turn_cluster_id": "peer-burst-001",
                "screenshot_ids": ["shot-001"],
            }
        ],
        "peer_playful_mythology": [
            {
                "evidence_id": "mythology-001",
                "evidence_class": "PEER_PLAYFUL_MYTHOLOGY",
                "peer_speaker_id": "PEER_002",
                "body": "synthetic playful mythology",
                "claim_code": "synthetic_mythology",
                "convergence_cluster_id": "mythology-cluster-001",
                "independent_speaker_count": 1,
                "descriptive_confidence": 0.4,
                "turn_cluster_id": "peer-burst-002",
                "screenshot_ids": ["shot-001"],
            }
        ],
        "hypotheses": [
            {
                "hypothesis_id": "hypothesis-001",
                "dimension": "synthetic_dimension",
                "definition": "synthetic descriptive definition",
                "evidence_strength": "MEDIUM_DESCRIPTIVE",
                "behaviour_code": "synthetic_dimension",
                "claim_status": "DESCRIPTIVE_HYPOTHESIS_ONLY",
                "evidence_basis": "MIXED_DESCRIPTIVE",
                "evidence_ids": ["message-001", "peer-evidence-001"],
                "authorship_confidence": 0.8,
                "descriptive_confidence": 0.7,
                "generalization_scope": "synthetic_topic_only",
                "positive_boundary": ["synthetic positive boundary"],
                "negative_boundary": ["synthetic negative boundary"],
                "compatible_registers": ["casual_banter"],
                "forbidden_registers": ["formal_message"],
                "epistemic_category": None,
            }
        ],
        "correction_questions": [
            {
                "question_id": "question-001",
                "question": "Which synthetic boundary applies?",
                "owner_answer": None,
                "target_hypothesis_ids": ["hypothesis-001"],
                "evidence_ids": ["message-001", "peer-evidence-001"],
                "information_goal": "boundary_calibration",
                "question_family": "synthetic_boundary",
                "register_context": "casual_banter",
            }
        ],
        "crocodile_hypothesis_family": {
            "dimensions": ["synthetic_dimension"],
            "runtime_mode_count": 0,
            "final_persona_truth": False,
            "faux_naive_supported_by_source": False,
        },
        "humour_mechanisms": ["synthetic_mechanism"],
        "register_slice": {
            "register": "synthetic_topic_slice",
            "cross_domain_generalization_authorized": False,
        },
    }


class R30J1CIngestionTests(unittest.TestCase):
    def setUp(self) -> None:
        MODULE.LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="r30j1c-synthetic-", dir=MODULE.LOCAL_ROOT)
        self.root = Path(self.temporary.name)
        self.input_path = self.root / "source_record.input.json"
        self.image_map_path = self.root / "screenshot_source_map.json"
        self.output = self.root / "output"
        self.image_path = self.root / "synthetic.png"
        self.image_path.write_bytes(synthetic_png())
        self.image_map_path.write_text(
            json.dumps(
                {
                    "version": "manual-owner-evidence.image-map.v1",
                    "images": [{"image_id": "shot-001", "source_path": str(self.image_path)}],
                }
            ),
            encoding="utf-8",
        )
        self.payload = synthetic_payload()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_input(self) -> None:
        self.input_path.write_text(json.dumps(self.payload), encoding="utf-8")

    def read_jsonl(self, name: str) -> list[dict]:
        return [
            json.loads(line)
            for line in (self.output / name).read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    def test_ingest_separates_owner_body_quote_and_peer_evidence(self) -> None:
        self.write_input()
        receipt = MODULE.ingest(self.input_path, self.image_map_path, self.output)
        self.assertEqual(receipt["screenshot_count"], 1)
        self.assertEqual(receipt["direct_owner_message_count"], 1)
        self.assertEqual(receipt["owner_quote_block_count"], 1)
        self.assertFalse(receipt["allowed_for_training"])

        message = self.read_jsonl("messages.jsonl")[0]
        owner = self.read_jsonl("owner_utterance_index.jsonl")[0]
        self.assertEqual(message["body"], "synthetic direct body")
        self.assertEqual(message["quoted_body"], "synthetic peer quote")
        self.assertEqual(owner["body"], "synthetic direct body")
        self.assertNotIn("quoted_body", owner)

        peer = self.read_jsonl("peer_reception_evidence.jsonl")[0]
        mythology = self.read_jsonl("peer_playful_mythology.jsonl")[0]
        self.assertFalse(peer["normative_preference"])
        self.assertFalse(peer["allowed_for_training"])
        self.assertFalse(mythology["owner_identity_truth"])
        self.assertTrue(mythology["rejected_from_persona_truth"])

        correction = self.read_jsonl("correction_items.jsonl")[0]
        self.assertEqual(correction["status"], "OWNER_REVIEW_REQUIRED")
        self.assertFalse(correction["owner_response_present"])
        self.assertFalse(correction["gold_admission"])
        self.assertFalse(correction["allowed_for_training"])

        envelope = json.loads((self.output / "source_envelope.json").read_text(encoding="utf-8"))
        self.assertEqual(envelope["evidence_class_counts"]["owner_chat_direct"], 1)
        self.assertFalse(envelope["training_state"]["training_started"])
        self.assertEqual(envelope["training_state"]["optimizer_tokens"], 0)

    def test_files_are_private_and_artifact_root_is_ignored(self) -> None:
        self.write_input()
        MODULE.ingest(self.input_path, self.image_map_path, self.output)
        for path in self.output.rglob("*"):
            mode = stat.S_IMODE(path.stat().st_mode)
            self.assertEqual(mode, 0o700 if path.is_dir() else 0o600, path)
        result = subprocess.run(
            ["git", "check-ignore", "-q", str(self.output.relative_to(ROOT))],
            cwd=ROOT,
            check=False,
        )
        self.assertEqual(result.returncode, 0)

    def test_rejects_any_training_authorization(self) -> None:
        self.payload["training_authorized"] = True
        self.write_input()
        with self.assertRaisesRegex(MODULE.IntakeError, "training_authorized"):
            MODULE.ingest(self.input_path, self.image_map_path, self.output)

    def test_rejects_unreviewed_deidentification(self) -> None:
        self.payload["privacy_review"]["manual_review_completed"] = False
        self.write_input()
        with self.assertRaisesRegex(MODULE.IntakeError, "manual_review_completed"):
            MODULE.ingest(self.input_path, self.image_map_path, self.output)

    def test_rejects_owner_quote_as_direct_owner_prose(self) -> None:
        self.payload["messages"][0]["quote"]["speaker_role"] = "OWNER"
        self.write_input()
        with self.assertRaisesRegex(MODULE.IntakeError, "quote_speaker_must_be_peer"):
            MODULE.ingest(self.input_path, self.image_map_path, self.output)

    def test_rejects_output_outside_ignored_campaign_root(self) -> None:
        self.write_input()
        with self.assertRaisesRegex(MODULE.IntakeError, "output_must_be_below"):
            MODULE.ingest(self.input_path, self.image_map_path, Path("/tmp/not-r30j1c-output"))

    def test_turn_clusters_are_explicit_not_screenshot_derived(self) -> None:
        second = dict(self.payload["messages"][0])
        second["message_id"] = "message-002"
        second["sequence_index"] = 2
        second["body"] = "second body in same burst"
        second["quote"] = None
        self.payload["messages"].append(second)
        self.write_input()
        MODULE.ingest(self.input_path, self.image_map_path, self.output)
        rows = self.read_jsonl("deidentified_messages.jsonl")
        owner = [row for row in rows if row["speaker_role"] == "OWNER"]
        self.assertEqual(owner[0]["turn_cluster_ref"], owner[1]["turn_cluster_ref"])
        self.assertNotEqual(owner[0]["turn_cluster_ref"], rows[2]["turn_cluster_ref"])


if __name__ == "__main__":
    unittest.main()
