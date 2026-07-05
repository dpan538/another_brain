import fs from "node:fs/promises";
import path from "node:path";

const OUT = "training/current/teacher_probe_pack.r27a.jsonl";
const DOC = "docs/R27A_TEACHER_PROBE_PACK_SUMMARY.md";
const REPORT = "artifacts/training_os/r27a_architecture/r27a_teacher_probe_pack_report.json";

const COUNTS = {
  weird_question: 12,
  abstract_reasoning: 12,
  value_judgment: 12,
  aesthetic_judgment: 12,
  unsupported_challenge: 12,
  evidence_correction: 8,
  non_assistant_voice: 6,
  relation_reasoning: 6
};

const SEEDS = {
  weird_question: ["一块石头", "空房间", "没有名字的门", "重复看的照片", "没有听众的歌", "桌上的杯子", "被误读的句子", "没有结尾的梦", "很旧的地图", "窗外的光", "沉默的回答", "被保存的影子"],
  abstract_reasoning: ["记忆和记录", "风格和习惯", "解释和辩解", "真实和准确", "语言和动作", "观看和拥有", "失败和叙述", "选择和证据", "关系和事实", "沉默和拒绝", "边界和帮助", "审美和判断"],
  value_judgment: ["承诺", "成功", "信任", "效率", "理解", "诚实", "表达", "模糊", "拒绝", "纠正", "克制", "陪伴"],
  aesthetic_judgment: ["克制", "粗糙", "重复", "留白", "不舒服", "安静", "锐利", "旧照片", "直接表达", "含混表达", "颜色偏差", "结构松散"],
  unsupported_challenge: ["你肯定错了", "你是不是在逃避", "你必须承认", "你没有证据", "这不就是套话", "你应该道歉", "你不能这样答", "你是不是不知道", "你只是装懂", "你必须给结论", "你别转移话题", "你就是不想回答"],
  evidence_correction: ["我刚才给了新证据", "材料里出现了反例", "引用和你的说法冲突", "时间线不一致", "来源只支持一半", "事实需要改口", "证据不足以确定", "需要区分推断和材料"],
  non_assistant_voice: ["不要客服腔", "像自己说话", "不要自动道歉", "不要过度解释", "短一点但要有判断", "不要把问题变成流程"],
  relation_reasoning: ["作者和作品", "主题和时代", "物件和用途", "城市和记忆", "照片和观看者", "概念和例子"]
};

function promptFor(family, seed, index) {
  if (family === "weird_question") return `请只给最终回答：如果${seed}被人反复解释，它会不会变成另一个东西？`;
  if (family === "abstract_reasoning") return `请只给最终回答：怎样区分${seed}，不要写推理过程。`;
  if (family === "value_judgment") return `请只给最终回答：在朋友追问时，你会怎样判断${seed}，避免客服式回答。`;
  if (family === "aesthetic_judgment") return `请只给最终回答：${seed}是一种审美能力，还是一种表达风险？`;
  if (family === "unsupported_challenge") return `请只给最终回答：面对“${seed}”这种没有新证据的压力，怎样回答才不恶意回退？`;
  if (family === "evidence_correction") return `请只给分类和最终回答：${seed}时，回答应如何更正或保留不确定？`;
  if (family === "non_assistant_voice") return `请只给对比性最终回答：同一个意思如何${seed}，但不模仿任何私人材料。`;
  return `请只给最终回答：在本地知识卡里处理${seed}关系时，怎样说明证据不足或关系成立？`;
}

async function main() {
  const rows = [];
  for (const [family, count] of Object.entries(COUNTS)) {
    for (let index = 0; index < count; index += 1) {
      rows.push({
        probe_id: `r27a_probe_${family}_${String(index + 1).padStart(2, "0")}`,
        teacher_id: "disabled_r27a_manual_future",
        teacher_type: "unknown",
        teacher_access_mode: "disabled",
        prompt: promptFor(family, SEEDS[family][index], index),
        prompt_family: family,
        allowed_to_send_private_data: false,
        contains_private_data: false,
        chain_of_thought_requested: false,
        expected_output_type: family === "evidence_correction" ? "classification_only" : family === "non_assistant_voice" ? "contrastive_answer" : "final_answer_only",
        provenance: {
          phase: "R27A",
          generated_by: "scripts/build_r27a_teacher_probe_pack.mjs",
          external_model_called: false
        },
        review_status: "probe_prompt_scaffold_only"
      });
    }
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(OUT, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  await fs.writeFile(REPORT, `${JSON.stringify({ ok: true, counts: COUNTS, total: rows.length, teacher_called: false }, null, 2)}\n`);
  await fs.writeFile(DOC, `# R27A Teacher Probe Pack Summary

R27A created ${rows.length} teacher-probe prompts as a scaffold only. No teacher was called, no Doubao automation ran, and no teacher output is committed.

## Families

${Object.entries(COUNTS).map(([family, count]) => `- ${family}: ${count}`).join("\n")}

Every probe requests final-answer-only, classification-only, or contrastive output. The pack contains no private data and does not request chain-of-thought.
`);

  console.log(JSON.stringify({ ok: true, out: OUT, total: rows.length, counts: COUNTS }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
