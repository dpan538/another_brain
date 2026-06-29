#!/usr/bin/env node
import { resolve } from "node:path";

import { inspectArtifactDirectory, writeJson } from "./static_llm_artifact_utils.mjs";
import { ROOT } from "./static_llm_manifest_utils.mjs";

const DEFAULT_REPORT = "artifacts/static_llm/r25c_artifact_inspection_report.json";

function parseArgs(argv) {
  const args = { dir: "", writeReport: false, report: DEFAULT_REPORT, production: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") args.dir = argv[++index];
    else if (arg === "--write-report") args.writeReport = true;
    else if (arg === "--report") args.report = argv[++index];
    else if (arg === "--production") args.production = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error("Usage: npm run inspect:static-llm-artifact -- --dir static_llm/inbox/<candidate> [--write-report]");
    process.exit(2);
  }
  const inspection = await inspectArtifactDirectory(args.dir, { production: args.production });
  const report = {
    ...inspection,
    wrote_report: false,
    report_path: args.writeReport ? args.report : ""
  };
  if (args.writeReport) {
    await writeJson(resolve(ROOT, args.report), report);
    report.wrote_report = true;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
