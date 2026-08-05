import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.r29b1r_run_supervisor import Supervisor


class PhaseStartNotResetTests(unittest.TestCase):
    def test_heartbeat_write_keeps_original_phase_start(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(Supervisor, "get_sample_help", return_value={}):
                supervisor = Supervisor(artifact_root=root, prior_artifact_root=root)
            supervisor.write("TORCH_IMPORT_ONLY")
            first = json.loads((root / "campaign_state.json").read_text())["phase_started_at_utc"]
            supervisor.write("TORCH_IMPORT_ONLY")
            second = json.loads((root / "campaign_state.json").read_text())["phase_started_at_utc"]
            self.assertEqual(first, second)
