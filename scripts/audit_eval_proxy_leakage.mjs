#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import {
  NATURALNESS_TURN_FUNCTIONS,
  PROXY_KEYWORDS,
  flattenStrings,
  listFiles,
  parseMaybeJsonLines,
  pathHint,
  relativeRoot,
  turnFunctionFromObject
} from "./r22_surface_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_eval_proxy_leakage_audit.json");

function suspiciousMustInclude(items = []) {
  return items.filter((item) => PROXY_KEYWORDS.some((keyword) => String(item).includes(keyword)));
}

function recommendedReplacement({ turnFunction, items }) {
  if (["analogy_statement", "affective_disclosure", "compliment"].includes(turnFunction)) {
    return "Replace keyword must_include with bad/better surface-shape rubric, forbidden template patterns, response mode check, and one concrete specificity check.";
  }
  if (turnFunction === "deepening_invitation") {
    return "Replace required words such as 更深 with a deep-question shape check: one non-menu question grounded in active topic.";
  }
  return `Replace keyword proxy (${items.join(", ")}) with semantic anchor or natural-language unit test.`;
}

function rowMustIncludes(row = {}) {
  const found = [];
  function visit(value, path = []) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (/must_include/.test(key) && Array.isArray(nested)) found.push({ path: [...path, key], items: nested });
      else visit(nested, [...path, key]);
    }
  }
  visit(row);
  return found;
}

function rowHasNaturalnessSensitiveText(row = {}) {
  const strings = flattenStrings(row).map((item) => item.text).join("\n");
  return /(像|羡慕|喜欢你|努力|童年|文学诗歌|舞台剧|更深|接住|赞许|compliment|analogy|affective)/.test(strings);
}

async function main() {
  const files = await listFiles("evals", (path) => [".json", ".jsonl"].includes(extname(path)));
  const suspicious = [];
  let rowsScanned = 0;
  for (const file of files) {
    let rows;
    try {
      rows = parseMaybeJsonLines(await readFile(file, "utf8"), file);
    } catch {
      continue;
    }
    for (const [rowIndex, row] of rows.entries()) {
      rowsScanned += 1;
      const turnFunction = turnFunctionFromObject(row);
      const naturalnessSensitive = NATURALNESS_TURN_FUNCTIONS.has(turnFunction) || rowHasNaturalnessSensitiveText(row);
      for (const entry of rowMustIncludes(row)) {
        const leaked = suspiciousMustInclude(entry.items);
        if (!leaked.length) continue;
        if (!naturalnessSensitive && !/(接住|更深|关系)/.test(leaked.join(" "))) continue;
        suspicious.push({
          file: relativeRoot(file),
          id: row.id || "",
          row_index: rowIndex,
          turn_index: entry.path.find((part) => /^\d+$/.test(part)) || "",
          expected_turn_function: turnFunction,
          path: pathHint(entry.path),
          suspicious_must_include: leaked,
          why_this_can_game_surface: "The eval can be satisfied by rendering rubric keywords into the visible answer instead of producing a natural turn-specific response.",
          recommended_replacement: recommendedReplacement({ turnFunction, items: leaked })
        });
      }
    }
  }

  const byFile = {};
  for (const item of suspicious) byFile[item.file] = (byFile[item.file] || 0) + 1;
  const report = {
    ok: true,
    audit_only: true,
    generated_at: new Date().toISOString(),
    files_scanned: files.length,
    rows_scanned: rowsScanned,
    suspicious_count: suspicious.length,
    suspicious_by_file: byFile,
    naturalness_sensitive_evals_using_keyword_proxy: suspicious,
    old_tests_modified: false,
    thresholds_weakened: false
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, suspicious_count: suspicious.length, top_files: Object.entries(byFile).slice(0, 12), out: OUT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
