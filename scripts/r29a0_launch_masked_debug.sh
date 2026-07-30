#!/bin/zsh
set -euo pipefail

repo_root="${0:A:h:h}"
report_dir="$repo_root/artifacts/r29a0/reports"
mkdir -p "$report_dir"

python_bin="$repo_root/.venv/bin/python"
if [[ ! -x "$python_bin" ]]; then
  python_bin="python3"
fi

log_path="$report_dir/training.log"
pid_path="$report_dir/training.pid"

nohup "$python_bin" "$repo_root/scripts/r29a0_run_masked_debug.py" >"$log_path" 2>&1 &
training_pid=$!
print -r -- "$training_pid" >"$pid_path"
print -r -- "{\"ok\":true,\"pid\":$training_pid,\"log\":\"$log_path\",\"pid_file\":\"$pid_path\"}"
