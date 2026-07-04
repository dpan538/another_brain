#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  gitLines,
  repoPath,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

const TERMS = [
  /generic assistant/i,
  /helpful assistant/i,
  /AI assistant/i,
  /assistant persona/i,
  /客服/i,
  /通用助手/i,
  /帮助用户/i,
  /as an assistant/i,
  /I am an AI assistant/i
];

function classify(path, line) {
  const text = line.toLowerCase();
  if (/docs\/R2[45]/.test(path)) return "historical_doc_ok";
  if (/assistant.*role|role.*assistant|serialization|message role/.test(text)) return "technical_message_role_ok";
  if (/not a generic|not.*assistant|forbid|must not|avoid|prohibition|failure|claims to be|residue|must be pulled|must not be pulled/.test(text)) return "policy_prohibition_ok";
  if (/docs\/r[0-9]+_/i.test(path) || /docs\/release_governance\.md/.test(path)) return "historical_doc_ok";
  if (/docs\/current\/|README\.md|DATA_CARD\.md|DEPLOYMENT\.md/.test(path)) return "needs_rewrite";
  return "stale_product_persona";
}

async function main() {
  const files = (await gitLines(["ls-files"])).filter((path) =>
    /^(docs\/|README\.md|DATA_CARD\.md|DEPLOYMENT\.md|training\/current\/|evals\/current\/)/.test(path) &&
    /\.(md|json)$/.test(path)
  );
  const matches = [];
  for (const path of files) {
    let text = "";
    try {
      text = await readFile(repoPath(path), "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (TERMS.some((term) => term.test(line))) {
        matches.push({
          path,
          line: index + 1,
          classification: classify(path, line),
          preview: line.slice(0, 180)
        });
      }
    });
  }
  const counts = {};
  for (const match of matches) counts[match.classification] = (counts[match.classification] || 0) + 1;
  const needsRewrite = matches.filter((match) => match.classification === "needs_rewrite");
  const stale = matches.filter((match) => match.classification === "stale_product_persona");
  const report = {
    ok: needsRewrite.length === 0 && stale.length === 0,
    phase: "R26B",
    terms_checked: TERMS.map((term) => term.source),
    counts,
    matches,
    training_ran: false,
    external_api_used: false
  };
  await writeJson("artifacts/training_os/r26b_review/r26b_assistant_persona_wording.json", report);
  await writeText(
    "docs/R26B_ASSISTANT_PERSONA_WORDING_AUDIT.md",
    `# R26B Assistant Persona Wording Audit

R26B searched current/product-facing docs and tracked historical docs for stale generic-assistant wording.

## Summary

${Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`).join("\n") || "- no matches"}

## Interpretation

- \`technical_message_role_ok\`: message-role serialization, not product persona.
- \`historical_doc_ok\`: old R24/R25 context, not current operating direction.
- \`policy_prohibition_ok\`: explicit prohibition or boundary wording.
- \`needs_rewrite\` / \`stale_product_persona\`: should be rewritten before product docs are treated as current.

R26B current docs state that another_brain is not a generic AI assistant and that the \`assistant\` role is serialization only.
`
  );
  console.log(JSON.stringify({ ok: report.ok, counts }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
