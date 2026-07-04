#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  gitLines,
  repoPath,
  summaryTable,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

function indexCategory(path) {
  if (path === "README.md" || path === "DATA_CARD.md") return "current_project_target";
  if (path === "DEPLOYMENT.md") return "current_deployment_strategy";
  if (/R25I_(FROM_SCRATCH|TRAINING)/.test(path) || /R25AB_CHINESE_FIRST|R25AB_PROJECT_MEANING/.test(path)) return "current_training_strategy";
  if (/R25AB_PERSONAL|R25AD_CHINESE|R25AM_CORPUS|R25AN/.test(path)) return "current_data_strategy";
  if (/R24|RECOVERY|SHARD/.test(path)) return "current_safety_gates";
  if (/R25(E|F|G|H|AA).*STATIC|DEPLOY|ADMISSION|CAPACITY/.test(path)) return "current_runtime_strategy";
  if (/R25(M|P|S|V|Y|AC|AO|AR).*RUN|MICROCYCLE|PILOT/.test(path)) return "pilot_history";
  if (/^docs\/R24/.test(path)) return "r24_history";
  if (/^docs\/R25/.test(path)) return "r25_history";
  if (/R25AI/.test(path)) return "cleanup_needed";
  return "cleanup_needed";
}

async function titleOf(path) {
  try {
    const text = await readFile(repoPath(path), "utf8");
    return text.split(/\r?\n/).find((line) => line.trim().startsWith("#"))?.replace(/^#+\s*/, "").trim() || path;
  } catch {
    return path;
  }
}

async function main() {
  const trackedDocs = (await gitLines(["ls-files", "README.md", "DATA_CARD.md", "DEPLOYMENT.md", "docs"])).filter((path) => /\.(md|MD)$/.test(path));
  const categories = {};
  const rows = [];
  for (const path of trackedDocs.sort()) {
    const category = indexCategory(path);
    if (!categories[category]) categories[category] = [];
    const item = { path, title: await titleOf(path), category };
    categories[category].push(item);
    rows.push(item);
  }
  const index = {
    ok: true,
    phase: "R26A",
    non_destructive: true,
    docs_moved: false,
    categories,
    counts: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, value.length])),
    notes: [
      "R24/R25 milestone docs are indexed as history unless explicitly active safety, doctrine, or release-boundary material.",
      "R25AO/R25AR are recent regressed pilot evidence, not active instructions to continue training."
    ]
  };
  await writeJson("artifacts/training_os/r26a_cleanup/r26a_docs_index.json", index);

  await writeText("docs/current/README.md", `# Current Docs

R26A defines this directory as the canonical index home for current project documentation. Existing docs are not moved in R26A.

Current operating docs remain:
- project target and Chinese-first doctrine
- training/data strategy boundaries
- R24 recovery and shard gates
- R25 static release constraints
- R26 cleanup/status docs
`);
  await writeText("docs/archive/README.md", `# Archive

R26A does not move files into this archive. It creates the directory marker so a future R26B cleanup can archive reviewed historical material after explicit approval.
`);
  await writeText("docs/archive/r24_r25_history/README.md", `# R24/R25 History

R24/R25 docs remain valuable historical evidence. R26A marks milestone and pilot docs as history unless they are active safety gates, active doctrine, or active release-boundary constraints.
`);

  const topRows = rows
    .filter((row) => ["current_project_target", "current_training_strategy", "current_data_strategy", "current_safety_gates", "current_runtime_strategy"].includes(row.category))
    .slice(0, 40)
    .map((row) => [row.category, `\`${row.path}\``]);
  const summary = `# R26A Canonical Docs Index

R26A indexes documentation without moving files.

## Counts

${Object.entries(index.counts).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Current Operating Surface

${summaryTable([["Category", "Path"], ["---", "---"], ...topRows])}

## Boundary

R24/R25 milestone docs remain preserved. Pilot run docs, including R25AO and R25AR, are historical evidence of sampler mechanics and heldout regression, not active instructions to continue training. Future archive moves require R26B approval.
`;
  await writeText("docs/R26A_CANONICAL_DOCS_INDEX.md", summary);

  console.log(JSON.stringify({ ok: true, counts: index.counts, docs_index: "docs/R26A_CANONICAL_DOCS_INDEX.md" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
