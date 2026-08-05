#!/usr/bin/env python3
"""Foreground, process-group-safe R29B1R probe supervisor.

This deliberately does not reuse the R29B1 supervisor or its combined
torch/MPS expression.  Every potentially native operation is a separate child
process with flushed markers and durable evidence.
"""
from __future__ import annotations

import argparse
import json
import os
import selectors
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.reference.r29b1r_campaign import CAMPAIGN_ID, atomic_json, state_payload, utc_now


@dataclass(frozen=True)
class Environment:
    label: str
    python: Path
    install_report: Path
    torch_version: str


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def marker_from_line(line: str) -> str | None:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return None
    if payload.get("event") == "marker":
        return str(payload.get("stage"))
    return None


def clean_environment(*, python: Path, inherited: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    """Return a minimal child environment and the removed inherited variables."""
    retained: dict[str, str] = {}
    for key in ("HOME", "TMPDIR", "LANG", "LC_ALL"):
        if inherited.get(key):
            retained[key] = inherited[key]
    retained["PATH"] = os.pathsep.join([str(python.parent), "/usr/bin", "/bin", "/usr/sbin", "/sbin"])
    retained["PYTHONNOUSERSITE"] = "1"
    retained["OMP_NUM_THREADS"] = "1"
    retained["MKL_NUM_THREADS"] = "1"
    retained["VECLIB_MAXIMUM_THREADS"] = "1"
    removed = {
        key: value
        for key, value in inherited.items()
        if key == "PYTHONPATH" or key.startswith("DYLD_") or key.startswith("PYTHONHOME")
    }
    return retained, removed


class Supervisor:
    def __init__(self, *, artifact_root: Path, prior_artifact_root: Path, reuse_existing_probe_matrix: bool = False):
        self.artifact_root = artifact_root
        self.prior_artifact_root = prior_artifact_root
        self.reuse_existing_probe_matrix = reuse_existing_probe_matrix
        self.state_path = artifact_root / "campaign_state.json"
        self.heartbeat_path = artifact_root / "heartbeat_latest.json"
        self.log_path = artifact_root / "logs" / "foreground.log"
        self.phase: str | None = None
        self.phase_started_at: str | None = None
        self.current_child: subprocess.Popen[str] | None = None
        self.current_command: list[str] | None = None
        self.last_marker: str | None = None
        self.last_output_at = utc_now()
        self.sample_help = self.get_sample_help()

    def get_sample_help(self) -> dict[str, Any]:
        try:
            completed = subprocess.run(["/usr/bin/sample", "-h"], text=True, capture_output=True, timeout=15, check=False)
            return {"exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr}
        except (OSError, subprocess.TimeoutExpired) as error:
            return {"error": str(error)}

    def write(self, state: str, **extra: Any) -> None:
        if state != self.phase:
            self.phase = state
            self.phase_started_at = utc_now()
        payload = state_payload(
            state=state,
            artifact_root=self.artifact_root,
            child_pid=self.current_child.pid if self.current_child else None,
            child_command=self.current_command,
            phase_started_at_utc=self.phase_started_at,
            last_marker=self.last_marker,
            last_output_at_utc=self.last_output_at,
            **extra,
        )
        atomic_json(self.state_path, payload)
        atomic_json(
            self.heartbeat_path,
            {
                "campaign_id": CAMPAIGN_ID,
                "phase": state,
                "updated_at_utc": utc_now(),
                "phase_started_at_utc": self.phase_started_at,
                "child_pid": payload["child_pid"],
                "last_marker": self.last_marker,
                "last_output_at_utc": self.last_output_at,
            },
        )

    def record_line(self, handle: Any, line: str) -> None:
        self.last_output_at = utc_now()
        possible_marker = marker_from_line(line)
        if possible_marker:
            self.last_marker = possible_marker
        print(line, end="", flush=True)
        handle.write(line)
        handle.flush()

    def collect_process_snapshot(self, pid: int, directory: Path) -> dict[str, Any]:
        directory.mkdir(parents=True, exist_ok=True)
        results: dict[str, Any] = {"pid": pid, "at_utc": utc_now()}
        for name, command in {
            "ps": ["/bin/ps", "-p", str(pid), "-o", "pid=,ppid=,pgid=,etime=,state=,%cpu=,rss=,command="],
            "threads": ["/bin/ps", "-M", "-p", str(pid), "-o", "pid=,tid=,state=,%cpu=,command="],
            "loaded_files": ["/usr/sbin/lsof", "-p", str(pid)],
            "vmmap": ["/usr/bin/vmmap", "-summary", str(pid)],
        }.items():
            try:
                completed = subprocess.run(command, text=True, capture_output=True, timeout=15, check=False)
                results[name] = {"exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr}
                if name == "loaded_files":
                    (directory / "loaded_files.txt").write_text(completed.stdout + completed.stderr, encoding="utf-8")
            except (OSError, subprocess.TimeoutExpired) as error:
                results[name] = {"error": str(error)}
        atomic_json(directory / "process_snapshot.json", results)
        return results

    def collect_sample(self, pid: int, directory: Path, seconds: int) -> dict[str, Any]:
        target = directory / f"sample_{seconds}s.txt"
        command = ["/usr/bin/sample", str(pid), "1", "-file", str(target)]
        try:
            completed = subprocess.run(command, text=True, capture_output=True, timeout=20, check=False)
            return {"command": command, "exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr, "file": str(target)}
        except (OSError, subprocess.TimeoutExpired) as error:
            return {"command": command, "error": str(error), "file": str(target)}

    def terminate_group(self, process: subprocess.Popen[str]) -> dict[str, Any]:
        result: dict[str, Any] = {"pid": process.pid, "term_sent": False, "kill_sent": False}
        if process.poll() is not None:
            result["exit_code"] = process.returncode
            return result
        try:
            os.killpg(process.pid, signal.SIGTERM)
            result["term_sent"] = True
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 3.0
        while process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.1)
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
                result["kill_sent"] = True
            except ProcessLookupError:
                pass
        try:
            result["exit_code"] = process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            result["reap_timeout"] = True
        return result

    def run_probe(
        self,
        *,
        phase: str,
        environment: Environment,
        mode: str,
        action: str,
        timeout: int,
        diagnostics: bool = False,
        script: Path | None = None,
        extra_args: list[str] | None = None,
        python_arguments: list[str] | None = None,
        environment_overrides: dict[str, str] | None = None,
        evidence_name: str | None = None,
    ) -> dict[str, Any]:
        inherited = dict(os.environ)
        env = inherited if mode == "inherited" else clean_environment(python=environment.python, inherited=inherited)[0]
        removed = {} if mode == "inherited" else clean_environment(python=environment.python, inherited=inherited)[1]
        if environment_overrides:
            env = dict(env)
            env.update(environment_overrides)
        directory = self.artifact_root / "diagnostics" / environment.label / action / mode
        if evidence_name:
            directory = directory / evidence_name
        directory.mkdir(parents=True, exist_ok=True)
        command = [str(environment.python), "-I", "-u", "-X", "faulthandler", str(script or (ROOT / "scripts/r29b1r_probe_torch.py")), action]
        if python_arguments:
            command[5:5] = python_arguments
        if action == "snapshot":
            command.extend(["--install-report", str(environment.install_report)])
        if extra_args:
            command.extend(extra_args)
        stdout_path = directory / "stdout.log"
        stderr_path = directory / "stderr.log"
        self.current_command = command
        self.write(phase, environment=environment.label, environment_mode=mode, probe_action=action)
        started = time.monotonic()
        samples: dict[str, Any] = {}
        snapshots: dict[str, Any] = {}
        process = subprocess.Popen(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1,
            env=env,
            cwd=ROOT,
            start_new_session=True,
        )
        self.current_child = process
        selector = selectors.DefaultSelector()
        assert process.stdout is not None and process.stderr is not None
        selector.register(process.stdout, selectors.EVENT_READ, "stdout")
        selector.register(process.stderr, selectors.EVENT_READ, "stderr")
        last_heartbeat = time.monotonic()
        observed = set()
        timed_out = False
        with self.log_path.open("a", encoding="utf-8") as foreground, stdout_path.open("w", encoding="utf-8") as stdout_log, stderr_path.open("w", encoding="utf-8") as stderr_log:
            while process.poll() is None:
                elapsed = time.monotonic() - started
                for key, _ in selector.select(timeout=0.25):
                    line = key.fileobj.readline()
                    if not line:
                        continue
                    self.record_line(foreground, line)
                    (stdout_log if key.data == "stdout" else stderr_log).write(line)
                    (stdout_log if key.data == "stdout" else stderr_log).flush()
                if diagnostics and elapsed >= 15 and 15 not in observed:
                    snapshots["15s"] = self.collect_process_snapshot(process.pid, directory)
                    observed.add(15)
                if diagnostics and elapsed >= 30 and 30 not in observed:
                    samples["30s"] = self.collect_sample(process.pid, directory, 30)
                    observed.add(30)
                if diagnostics and elapsed >= 60 and 60 not in observed:
                    samples["60s"] = self.collect_sample(process.pid, directory, 60)
                    observed.add(60)
                if time.monotonic() - last_heartbeat >= 30:
                    self.write(phase, environment=environment.label, environment_mode=mode, probe_action=action)
                    last_heartbeat = time.monotonic()
                if elapsed >= timeout:
                    timed_out = True
                    snapshots["timeout"] = self.collect_process_snapshot(process.pid, directory)
                    cleanup = self.terminate_group(process)
                    timeout_payload = {
                        "timeout_seconds": timeout,
                        "elapsed_seconds": round(time.monotonic() - started, 3),
                        "sample_help": self.sample_help,
                        "samples": samples,
                        "snapshots": snapshots,
                        "cleanup": cleanup,
                    }
                    atomic_json(directory / "timeout.json", timeout_payload)
                    break
            for key, target in ((process.stdout, stdout_log), (process.stderr, stderr_log)):
                for line in key:
                    self.record_line(foreground, line)
                    target.write(line)
        result = {
            "environment": environment.label,
            "environment_mode": mode,
            "action": action,
            "command": command,
            "exit_code": process.returncode,
            "timed_out": timed_out,
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "last_marker": self.last_marker,
            "stdout_log": str(stdout_path),
            "stderr_log": str(stderr_path),
            "removed_environment_variables": sorted(removed),
            "diagnostic_directory": str(directory),
            "sample_help": self.sample_help if diagnostics else None,
        }
        atomic_json(self.artifact_root / "reports" / environment.label / f"{mode}_{action}.json", result)
        self.current_child = None
        self.current_command = None
        return result

    def environments(self) -> list[Environment]:
        result = []
        for label, version in (("primary", "2.13.0"), ("fallback", "2.12.0")):
            report = self.prior_artifact_root / "environment" / f"{label}_install.json"
            if not report.exists():
                raise RuntimeError(f"missing_prior_install_report:{label}")
            install = read_json(report)
            python = Path(str(install.get("venv_python", "")))
            if not python.exists():
                raise RuntimeError(f"missing_existing_venv_python:{label}:{python}")
            result.append(Environment(label=label, python=python, install_report=report, torch_version=version))
        return result

    def run_environment(self, environment: Environment) -> dict[str, Any]:
        snapshots = [self.run_probe(phase="PYTHON_BASELINE", environment=environment, mode="inherited", action="snapshot", timeout=30)]
        results: dict[str, Any] = {"snapshot": snapshots[0], "modes": {}}
        for mode in ("inherited", "clean"):
            baseline = self.run_probe(phase="PYTHON_BASELINE", environment=environment, mode=mode, action="python-baseline", timeout=30)
            package = self.run_probe(phase="TORCH_PACKAGE_INSPECTION", environment=environment, mode=mode, action="package-discovery", timeout=30)
            imports = [
                self.run_probe(
                    phase="TORCH_IMPORT_ONLY",
                    environment=environment,
                    mode=mode,
                    action="import-only",
                    timeout=120,
                    diagnostics=True,
                    evidence_name=f"attempt_{attempt:02d}",
                )
                for attempt in range(1, 6)
            ]
            imports_passed = all(item["exit_code"] == 0 and not item["timed_out"] and item["last_marker"] == "probe_complete" for item in imports)
            cpu = None
            if imports_passed:
                cpu = self.run_probe(phase="CPU_SMOKE", environment=environment, mode=mode, action="cpu-smoke", timeout=120)
            results["modes"][mode] = {"python_baseline": baseline, "package_discovery": package, "imports": imports, "imports_passed": imports_passed, "cpu_smoke": cpu, "cpu_passed": bool(cpu and cpu["exit_code"] == 0 and not cpu["timed_out"])}
        atomic_json(self.artifact_root / "reports" / f"{environment.label}_probe_matrix.json", results)
        return results

    def verified_existing_matrix(self, environment: Environment) -> dict[str, Any]:
        """Reuse only complete, staged R29B1R evidence after supervisor repair.

        The first R29B1R foreground process already executed the required
        5x import-only process-group matrix for both modes.  Its erroneous
        terminal classification does not invalidate the separated markers.
        We do not manufacture a pass or infer CPU health from it.
        """
        path = self.artifact_root / "reports" / f"{environment.label}_probe_matrix.json"
        if not path.exists():
            raise RuntimeError(f"missing_existing_probe_matrix:{environment.label}")
        matrix = read_json(path)
        for mode in ("inherited", "clean"):
            details = matrix.get("modes", {}).get(mode)
            if not isinstance(details, dict):
                raise RuntimeError(f"incomplete_existing_probe_matrix:{environment.label}:{mode}")
            imports = details.get("imports")
            if not isinstance(imports, list) or len(imports) != 5:
                raise RuntimeError(f"missing_five_import_attempts:{environment.label}:{mode}")
            for attempt in imports:
                if attempt.get("last_marker") != "before_torch_import" or not attempt.get("timed_out"):
                    raise RuntimeError(f"unexpected_existing_import_evidence:{environment.label}:{mode}")
            if details.get("cpu_smoke") is not None or details.get("cpu_passed"):
                raise RuntimeError(f"unexpected_cpu_claim_in_existing_matrix:{environment.label}:{mode}")
        matrix["reused_after_supervisor_repair"] = True
        matrix["reuse_reason"] = "complete_separated_import_only_matrix_preceded_terminal_classification_fix"
        return matrix

    def run_dynamic_loader_diagnostics(self, environment: Environment) -> dict[str, Any]:
        """Run one native-loader diagnostic at a time after import-only fails."""
        result: dict[str, Any] = {
            "environment": environment.label,
            "trigger": "import_only_failed_clean_and_inherited",
            "probes": {},
        }
        result["probes"]["native_file_inspection"] = self.run_probe(
            phase="SANDBOX_ATTRIBUTION",
            environment=environment,
            mode="clean",
            action="dynamic-loader-inspection",
            timeout=90,
            evidence_name="native_file_inspection",
        )
        for name, python_arguments, overrides in (
            ("dyld_print_libraries", [], {"DYLD_PRINT_LIBRARIES": "1"}),
            ("importtime", ["-X", "importtime"], {}),
            ("verbose_import", ["-v"], {}),
        ):
            result["probes"][name] = self.run_probe(
                phase="SANDBOX_ATTRIBUTION",
                environment=environment,
                mode="clean",
                action="import-only",
                timeout=120,
                diagnostics=True,
                python_arguments=python_arguments,
                environment_overrides=overrides,
                evidence_name=name,
            )
        atomic_json(self.artifact_root / "reports" / f"{environment.label}_dynamic_loader_diagnostics.json", result)
        return result

    def mps_status(self, environment: Environment) -> dict[str, Any]:
        built = self.run_probe(phase="MPS_PROBE", environment=environment, mode="inherited", action="mps-built", timeout=60)
        available = self.run_probe(phase="MPS_PROBE", environment=environment, mode="inherited", action="mps-available", timeout=60)
        allocation = None
        available_log = Path(available["stdout_log"])
        available_true = '"mps_available": true' in available_log.read_text(encoding="utf-8") if available_log.exists() else False
        if available["exit_code"] == 0 and not available["timed_out"] and available_true:
            allocation = self.run_probe(phase="MPS_PROBE", environment=environment, mode="inherited", action="mps-allocation", timeout=60)
        result = {"built": built, "available": available, "allocation": allocation}
        atomic_json(self.artifact_root / "reports" / f"{environment.label}_mps_status.json", result)
        return result

    def write_host_probe_bundle(self, environment: Environment, diagnostics: dict[str, Any]) -> dict[str, Any]:
        """Write a normal-host handoff that uses the existing isolated venv only."""
        directory = self.artifact_root / "host_probe"
        directory.mkdir(parents=True, exist_ok=True)
        script = '''#!/usr/bin/env python3
import argparse, hashlib, json, os, sys, tempfile, time
from pathlib import Path

def stage(name, operation):
    started = time.monotonic()
    try:
        value = operation()
        return {"stage": name, "ok": True, "elapsed_seconds": round(time.monotonic() - started, 6), "result": value}
    except BaseException as error:
        return {"stage": name, "ok": False, "elapsed_seconds": round(time.monotonic() - started, 6), "error_type": type(error).__name__, "error": str(error)}

def import_only():
    import torch
    return {"torch_version": torch.__version__, "torch_file": torch.__file__}

def cpu_smoke():
    import torch
    x = torch.arange(12, dtype=torch.float32).reshape(3, 4); y = x @ x.T
    z = torch.nn.functional.softmax(y, dim=-1); n = torch.nn.LayerNorm(3)(y)
    descriptor, path = tempfile.mkstemp(suffix=".pt"); os.close(descriptor)
    try:
        torch.save({"x": x}, path); restored = torch.load(path, map_location="cpu", weights_only=True)
    finally:
        Path(path).unlink(missing_ok=True)
    return {"finite": bool(torch.isfinite(z).all() and torch.isfinite(n).all()), "shape": list(restored["x"].shape)}

def mps():
    import torch
    built = bool(torch.backends.mps.is_built()); available = bool(torch.backends.mps.is_available())
    result = {"built": built, "available": available}
    if available:
        x = torch.ones(1, device="mps"); torch.mps.synchronize(); result["value"] = float(x.cpu().item())
    return result

parser = argparse.ArgumentParser(); parser.add_argument("--output", type=Path, required=True); args = parser.parse_args()
payload = {"schema_version": 1, "python": sys.executable, "stages": [stage("import_only", import_only), stage("cpu_smoke", cpu_smoke), stage("mps", mps)]}
canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
payload["content_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
temporary = args.output.with_suffix(args.output.suffix + ".tmp"); temporary.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\\n"); temporary.replace(args.output)
'''
        script_path = directory / "run_host_probe.py"
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o755)
        command_path = directory / "run_host_probe.command"
        command_path.write_text(
            "#!/bin/sh\\nset -eu\\n"
            f"{environment.python} -I -u -X faulthandler \"$(dirname \"$0\")/run_host_probe.py\" --output \"$(dirname \"$0\")/host_probe_result.json\"\\n",
            encoding="utf-8",
        )
        command_path.chmod(0o755)
        atomic_json(
            directory / "expected_output.schema.json",
            {"type": "object", "required": ["schema_version", "python", "stages", "content_sha256"], "properties": {"stages": {"type": "array"}, "content_sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"}}},
        )
        (directory / "README.txt").write_text(
            "Run this bundle from a normal macOS Terminal by double-clicking run_host_probe.command or executing it directly. "
            "It uses the existing isolated R29B1 primary venv, installs nothing, accesses no checkpoint, and performs import-only, CPU smoke, then MPS as independent stages. "
            "Return host_probe_result.json for comparison.\\n",
            encoding="utf-8",
        )
        result = {"directory": str(directory), "python": str(environment.python), "diagnostic_environment": environment.label, "diagnostics_report": diagnostics}
        atomic_json(directory / "bundle_manifest.json", result)
        return result

    def record_preexisting_weight_gate(self) -> dict[str, Any]:
        """Record, but never waive, the known R28M1 admission-gate baseline."""
        changed = subprocess.run(
            ["git", "diff", "--name-status", "origin/main"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        weight_suffixes = (".bin", ".pt", ".pth", ".safetensors", ".onnx")
        weight_changes = []
        for line in changed.stdout.splitlines():
            fields = line.split("\t")
            if len(fields) >= 2 and fields[-1].endswith(weight_suffixes):
                weight_changes.append({"status": fields[0], "path": fields[-1]})
        gate = subprocess.run(
            ["npm", "run", "check:no-unapproved-model-weights"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=180,
            check=False,
        )
        counts = {
            "added": sum(item["status"].startswith("A") for item in weight_changes),
            "modified": sum(item["status"].startswith("M") for item in weight_changes),
            "deleted": sum(item["status"].startswith("D") for item in weight_changes),
        }
        report = {
            "campaign_id": CAMPAIGN_ID,
            "gate": "check:no-unapproved-model-weights",
            "exit_code": gate.returncode,
            "stdout": gate.stdout,
            "stderr": gate.stderr,
            "classification": "preexisting_r28m1_baseline_not_modified_by_r29b1r",
            "weight_file_changes": weight_changes,
            **counts,
            "training_started": False,
            "optimizer_tokens": 0,
            "assistant_target_tokens": 0,
        }
        if counts != {"added": 0, "modified": 0, "deleted": 0}:
            raise RuntimeError(f"r29b1r_weight_file_mutation_detected:{counts}")
        atomic_json(self.artifact_root / "reports" / "preexisting_gate_baseline.json", report)
        return report

    def run(self) -> int:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.write("ORIENTATION", prior_blocker_reclassification="COMBINED_TORCH_MPS_PROBE_TIMEOUT")
        self.write("PROBE_REPAIR", repair="torch_import_only_and_mps_queries_are_separate_processes")
        environments = self.environments()
        matrices = {
            environment.label: (
                self.verified_existing_matrix(environment)
                if self.reuse_existing_probe_matrix
                else self.run_environment(environment)
            )
            for environment in environments
        }
        selected: Environment | None = None
        for environment in environments:
            if any(mode["cpu_passed"] for mode in matrices[environment.label]["modes"].values()):
                selected = environment
                break
        if selected is None:
            self.write("SANDBOX_ATTRIBUTION", probe_matrices=matrices)
            dynamic: dict[str, Any] = {}
            for environment in environments:
                modes = matrices[environment.label]["modes"]
                if not any(mode["imports_passed"] for mode in modes.values()):
                    dynamic[environment.label] = self.run_dynamic_loader_diagnostics(environment)
            preexisting_gate = self.record_preexisting_weight_gate()
            self.write(
                "BLOCKED_WITH_DIAGNOSTIC_EVIDENCE",
                reason="import_only_failed_in_clean_and_inherited_matrix_during_libtorch_cpu_initializer_diagnostics",
                probe_matrices=matrices,
                dynamic_loader_diagnostics=dynamic,
                preexisting_weight_gate=preexisting_gate,
            )
            return 2
        mps = self.mps_status(selected)
        self.write("CHECKPOINT_INVENTORY", selected_environment=selected.label, selected_python=str(selected.python), mps_status=mps, probe_matrices=matrices)
        # The CPU reference pipeline is imported lazily so that the diagnostic
        # code can be unit-tested with no Torch installation at all.
        from scripts.r29b1r_run_reference_pipeline import run_reference_pipeline

        return run_reference_pipeline(supervisor=self, environment=selected, mps_status=mps)

    def interrupt(self, signum: int, _frame: Any) -> None:
        if self.current_child and self.current_child.poll() is None:
            self.terminate_group(self.current_child)
        self.write("ABORTED_SAFELY", reason=f"signal_{signum}")
        raise SystemExit(128 + signum)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--prior-artifact-root", type=Path, required=True)
    parser.add_argument("--reuse-existing-probe-matrix", action="store_true")
    parser.add_argument("--finalize-existing-host-evidence", action="store_true")
    parser.add_argument("--repair-host-terminal-reason", action="store_true")
    parser.add_argument("--reclassify-existing-terminal-blocked", action="store_true")
    args = parser.parse_args()
    supervisor = Supervisor(
        artifact_root=args.artifact_root,
        prior_artifact_root=args.prior_artifact_root,
        reuse_existing_probe_matrix=args.reuse_existing_probe_matrix,
    )
    signal.signal(signal.SIGINT, supervisor.interrupt)
    signal.signal(signal.SIGTERM, supervisor.interrupt)
    if args.reclassify_existing_terminal_blocked:
        existing = read_json(supervisor.state_path)
        if existing.get("state") not in {"HOST_CONTEXT_REQUIRED_WITH_BUNDLE", "BLOCKED_WITH_DIAGNOSTIC_EVIDENCE"}:
            raise SystemExit("existing_terminal_is_not_reclassifiable")
        reclassification = existing.get("terminal_reclassification")
        if existing.get("state") == "HOST_CONTEXT_REQUIRED_WITH_BUNDLE":
            reclassification = {
                "from": "HOST_CONTEXT_REQUIRED_WITH_BUNDLE",
                "to": "BLOCKED_WITH_DIAGNOSTIC_EVIDENCE",
                "basis": "captured_importtime_stack_shows_libtorch_cpu_initializer_work_not_sandbox_or_mps_query",
            }
        supervisor.write(
            "BLOCKED_WITH_DIAGNOSTIC_EVIDENCE",
            reason="import_only_failed_in_clean_and_inherited_matrix_during_libtorch_cpu_initializer_diagnostics",
            probe_matrices=existing.get("probe_matrices"),
            dynamic_loader_diagnostics=existing.get("dynamic_loader_diagnostics"),
            environment_snapshots=existing.get("environment_snapshots"),
            preexisting_weight_gate=existing.get("preexisting_weight_gate"),
            mps_status={"status": "NOT_ATTEMPTED_IMPORT_ONLY_NOT_READY", "mps_does_not_block_cpu_reference_gate": True},
            terminal_reclassification=reclassification,
        )
        raise SystemExit(0)
    if args.repair_host_terminal_reason:
        existing = read_json(supervisor.state_path)
        if existing.get("state") != "HOST_CONTEXT_REQUIRED_WITH_BUNDLE":
            raise SystemExit("existing_terminal_is_not_host_context_required")
        existing["reason"] = "import_only_failed_in_clean_and_inherited_matrix_after_dynamic_loader_diagnostics"
        existing["terminal_reason_repaired"] = "snapshot_timeout_artifact_was_reclassified_after_fresh_snapshot_succeeded"
        atomic_json(supervisor.state_path, existing)
        raise SystemExit(0)
    if args.finalize_existing_host_evidence:
        existing = read_json(supervisor.state_path)
        recoverable_snapshot_abort = (
            existing.get("state") == "ABORTED_SAFELY"
            and existing.get("reason") == "no_torch_environment_snapshot_failed"
        )
        if existing.get("state") != "HOST_CONTEXT_REQUIRED_WITH_BUNDLE" and not recoverable_snapshot_abort:
            raise SystemExit("existing_terminal_is_not_host_context_required")
        supervisor.write("ORIENTATION", reason="complete_no_torch_environment_snapshot_after_probe_repair")
        snapshots = {
            environment.label: supervisor.run_probe(
                phase="ORIENTATION",
                environment=environment,
                mode="inherited",
                action="snapshot",
                timeout=120,
                evidence_name="terminal_finalization_v2",
            )
            for environment in supervisor.environments()
        }
        if any(item["exit_code"] != 0 or item["timed_out"] for item in snapshots.values()):
            supervisor.write("ABORTED_SAFELY", reason="no_torch_environment_snapshot_failed", snapshots=snapshots)
            raise SystemExit(3)
        report = supervisor.record_preexisting_weight_gate()
        supervisor.write(
            "HOST_CONTEXT_REQUIRED_WITH_BUNDLE",
            reason=existing.get("reason"),
            probe_matrices=existing.get("probe_matrices"),
            dynamic_loader_diagnostics=existing.get("dynamic_loader_diagnostics"),
            host_probe_bundle=existing.get("host_probe_bundle"),
            environment_snapshots=snapshots,
            preexisting_weight_gate=report,
        )
        raise SystemExit(0)
    raise SystemExit(supervisor.run())


if __name__ == "__main__":
    main()
