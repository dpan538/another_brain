import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.r29b1r_run_supervisor import Supervisor


class TimeoutProcessGroupCleanupTests(unittest.TestCase):
    def test_termination_reaps_a_dedicated_process_group(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(Supervisor, "get_sample_help", return_value={}):
                supervisor = Supervisor(artifact_root=root, prior_artifact_root=root)
            process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True)
            outcome = supervisor.terminate_group(process)
            self.assertTrue(outcome["term_sent"] or outcome["exit_code"] is not None)
            self.assertIsNotNone(process.returncode)
            with self.assertRaises(ProcessLookupError):
                os.kill(process.pid, 0)
