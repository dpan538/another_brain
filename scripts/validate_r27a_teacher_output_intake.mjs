import fs from "node:fs/promises";
import path from "node:path";

const INPUT = "private_sources/teacher_probes/r27a_teacher_outputs.jsonl";
const REPORT = "artifacts/training_os/r27a_architecture/r27a_teacher_output_intake_report.json";
const PRIVATE_MARKER_RE = /\/Users\/|private_sources|身份证|账号|密码|地址|电话|邮箱|raw_private_data/i;
const COT_RE = /chain[_ -]?of[_ -]?thought|思维链|推理过程|hidden_prompt|system prompt/i;

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const failures = [];
  const status = await exists(INPUT) ? "teacher_outputs_supplied_metadata_checked" : "no_teacher_outputs_supplied";
  const rows = [];

  if (status !== "no_teacher_outputs_supplied") {
    const lines = (await fs.readFile(INPUT, "utf8")).split(/\r?\n/).filter(Boolean);
    for (const [index, line] of lines.entries()) {
      let row = null;
      try {
        row = JSON.parse(line);
      } catch {
        failures.push({ index, code: "invalid_json" });
        continue;
      }
      rows.push(row);
      const text = JSON.stringify(row);
      if (!row.teacher_id) failures.push({ index, code: "missing_teacher_id" });
      if (!row.provenance) failures.push({ index, code: "missing_provenance" });
      if (row.training_allowed === true) failures.push({ index, code: "training_allowed_true" });
      if (row.public_commit_allowed === true) failures.push({ index, code: "public_commit_allowed_true" });
      if (PRIVATE_MARKER_RE.test(text)) failures.push({ index, code: "private_data_marker" });
      if (COT_RE.test(text)) failures.push({ index, code: "chain_of_thought_marker" });
      if (/another_brain_question_pack_001.*source_row_id["']?\s*:\s*(5[1-9]|[6-9][0-9]|100)/i.test(text)) {
        failures.push({ index, code: "old_excluded_question_pack_row" });
      }
    }
  }

  const report = {
    ok: failures.length === 0,
    status,
    input_path: INPUT,
    rows_checked: rows.length,
    scaffold_only: true,
    teacher_called_by_r27a: false,
    training_allowed: false,
    public_commit_allowed: false,
    failures
  };
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
