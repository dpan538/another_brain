#!/usr/bin/env python3
"""Single foreground R29B0 campaign state writer.

No scheduler or child process is used.  A terminal blocker is written only from
explicit observed evidence supplied by the attached foreground invocation.
"""
from __future__ import annotations
import argparse, json, os, tempfile, time
from pathlib import Path

TERMINAL={"PASSED_ENGINEERING_CANDIDATE","BLOCKED_WITH_EVIDENCE","ABORTED_SAFELY"}
def atomic(path:Path,payload:dict):
 path.parent.mkdir(parents=True,exist_ok=True); fd,tmp=tempfile.mkstemp(prefix=".state.",dir=path.parent)
 try:
  with os.fdopen(fd,"w",encoding="utf8") as f: json.dump(payload,f,ensure_ascii=False,indent=2); f.write("\n"); f.flush(); os.fsync(f.fileno())
  os.replace(tmp,path)
 finally:
  if os.path.exists(tmp): os.unlink(tmp)
def main():
 p=argparse.ArgumentParser(); p.add_argument("--artifact-root",type=Path,required=True); p.add_argument("--state",choices=TERMINAL,required=True); p.add_argument("--evidence",required=True); p.add_argument("--parent-checkpoint",default=""); a=p.parse_args()
 body={"campaign_id":"r29b0_full_browser_dialogue_vertical_slice_v1","state":a.state,"terminal":True,"pid":os.getpid(),"updated_at_unix":time.time(),"parent_checkpoint":a.parent_checkpoint,"candidate_checkpoint":"","optimizer_tokens":0,"assistant_target_tokens":0,"evidence":a.evidence,"training_started":False,"weights_committed":False,"corpus_committed":False}
 atomic(a.artifact_root/"campaign_state.json",body); atomic(a.artifact_root/"heartbeat_latest.json",body)
 log=a.artifact_root/"logs/foreground.log"; log.parent.mkdir(parents=True,exist_ok=True)
 with log.open("a",encoding="utf8") as f: f.write(json.dumps(body,ensure_ascii=False)+"\n")
 print(json.dumps(body,ensure_ascii=False),flush=True)
if __name__=="__main__": main()
