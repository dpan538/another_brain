#!/usr/bin/env python3
"""Benchmark deterministic knowledge lookup without loading the local LLM."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "web" / "dialog_rules.js"
GENERATED_KNOWLEDGE_PATH = ROOT / "web" / "knowledge_base.generated.js"
SURFACE_IDENTITY_PATH = ROOT / "web" / "surface_identity.js"
OBJECT_TABLE_PATH = ROOT / "artifacts" / "object_table.json"


QUERIES = [
    "鱼能学会游泳吗？还是本来就会？",
    "索尼是什么？",
    "徕卡怎么样？",
    "GFX是什么？",
    "GFX1是什么？",
    "桌子是什么？",
    "毛巾是什么？",
    "锤子是什么？",
    "饺子是什么？",
    "拿铁是什么？",
    "蝴蝶是什么？",
    "竹子是什么？",
    "地震是什么？",
    "原子是什么？",
    "肺是什么？",
    "德国是什么？",
    "成都是什么？",
    "长江是什么？",
    "医生是什么？",
    "GitHub是什么？",
    "Git有什么用？",
    "二维码有什么用？",
    "API是什么？",
    "牙刷是什么？",
    "微波炉是什么？",
    "路由器是什么？",
    "充电宝是什么？",
    "公交站是什么？",
    "高铁是什么？",
    "银行卡是什么？",
    "预算是什么？",
    "作业是什么？",
    "图书馆是什么？",
    "新闻是什么？",
    "播客是什么？",
    "油画构图是什么？",
    "风景摄影用光是什么？",
    "Python异步是什么？",
    "React状态管理是什么？",
    "齿轮传动是什么？",
    "电阻参数是什么？",
    "钢强度是什么？",
    "真理问题是什么？",
    "汉语语法是什么？",
    "朋友边界是什么？",
    "刷牙步骤是什么？",
    "验证码是什么？",
    "白平衡是什么？",
    "展览是什么？",
    "钢琴是什么？",
    "足球是什么？",
    "孤独是什么？",
    "责任是什么？",
    "布里斯班在哪里？",
    "中国发展是什么？",
    "东亚发展是什么？",
    "长三角是什么？",
    "长三角一体化是什么？",
    "南通是什么地方？",
    "南通发展是什么？",
    "苏通大桥是什么？",
    "沪苏通铁路是什么？",
    "上海发展是什么？",
    "浦东是什么？",
    "临港是什么？",
    "上海港是什么？",
    "纽约发展是什么？",
    "曼哈顿是什么？",
    "布里斯班发展是什么？",
    "布里斯班河是什么？",
    "2032布里斯班奥运会是什么？",
    "RCEP是什么？",
    "供应链是什么？",
    "移动支付是什么？",
    "外卖是什么？",
    "远程办公是什么？",
    "社保是什么？",
    "中国互联网是什么？",
    "中国智能手机怎么样？",
    "微信支付是什么？",
    "比亚迪是什么？",
    "台积电是什么？",
    "韩流是什么？",
    "东京圈是什么？",
    "粤港澳大湾区是什么？",
    "张謇是谁？",
    "濠河是什么？",
    "南通家纺是什么？",
    "通州湾是什么？",
    "黄浦江是什么？",
    "张江是什么？",
    "上海地铁是什么？",
    "洋山深水港是什么？",
    "皇后区是什么？",
    "纽约地铁怎么样？",
    "MTA是什么？",
    "South Bank是什么？",
    "CityCat是什么？",
    "Cross River Rail是什么？",
    "Victoria Park是什么？",
    "布里斯班洪水是什么？",
    "租房合同是什么？",
    "居住证是什么？",
    "户口是什么？",
    "预约挂号是什么？",
    "Medicare是什么？",
    "myGov是什么？",
    "OMNY是什么？",
    "能告诉我关于鳄鱼的事吗？",
    "月亮上的花园是什么？",
]


def build_js(iterations: int) -> str:
    source = RULES_PATH.read_text(encoding="utf-8")
    generated_source = GENERATED_KNOWLEDGE_PATH.read_text(encoding="utf-8")
    surface_identity_source = SURFACE_IDENTITY_PATH.read_text(encoding="utf-8")
    source = re.sub(
        r'^import \{ GENERATED_KNOWLEDGE_CARDS, GENERATED_KNOWLEDGE_STATS \} from "\./knowledge_base\.generated\.js\?v=\d+";\n\n?',
        "",
        source,
    )
    source = re.sub(
        r'^import \{ answerSurfaceIdentity, surfaceIdentityIntent \} from "\./surface_identity\.js\?v=\d+";\n\n?',
        "",
        source,
    )
    executable_source = (
        generated_source.replace("export const ", "const ")
        + "\n"
        + surface_identity_source.replace("export function ", "function ").replace("export const ", "const ")
        + "\n"
        + source.replace("export function ", "function ").replace("export const ", "const ")
    )
    object_table_json = OBJECT_TABLE_PATH.read_text(encoding="utf-8") if OBJECT_TABLE_PATH.exists() else '{"objects":[]}'
    return f"""
const {{ performance }} = require("node:perf_hooks");
{executable_source}
const objectTable = {object_table_json};
const queries = {json.dumps(QUERIES, ensure_ascii=False)};
const iterations = {iterations};
const answers = [];
function answer(query) {{
  const state = createDialogState();
  const intent = detectIntent(query, state);
  return (
    (intent === "knowledge_unknown" ? directAnswerForObjectQuery(objectTable, query) : "") ||
    directAnswerForIntent(intent, query, state) ||
    directAnswerForObjectQuery(objectTable, query) ||
    fallbackForIntent(intent, query)
  );
}}
for (const query of queries) {{
  answers.push({{ query, answer: answer(query) }});
}}
const samples = [];
const start = performance.now();
for (let index = 0; index < iterations; index += 1) {{
  const query = queries[index % queries.length];
  const itemStart = performance.now();
  answer(query);
  samples.push(performance.now() - itemStart);
}}
const totalMs = performance.now() - start;
samples.sort((a, b) => a - b);
function percentile(p) {{
  return samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
}}
console.log(JSON.stringify({{
  iterations,
  queryCount: queries.length,
  totalMs: Number(totalMs.toFixed(3)),
  avgMs: Number((totalMs / iterations).toFixed(6)),
  p50Ms: Number(percentile(0.5).toFixed(6)),
  p95Ms: Number(percentile(0.95).toFixed(6)),
  p99Ms: Number(percentile(0.99).toFixed(6)),
  runtimeStats: KNOWLEDGE_RUNTIME_STATS,
  generatedJsBytes: {GENERATED_KNOWLEDGE_PATH.stat().st_size},
  answers
}}, null, 2));
"""


def main() -> int:
    iterations = int(sys.argv[1]) if len(sys.argv) > 1 else 20_000
    script = build_js(iterations)
    with tempfile.NamedTemporaryFile("w", suffix=".cjs", encoding="utf-8", delete=False) as fp:
        fp.write(script)
        script_path = Path(fp.name)
    try:
        proc = subprocess.run(
            ["node", str(script_path)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
    finally:
        script_path.unlink(missing_ok=True)
    if proc.returncode:
        print(proc.stderr or proc.stdout)
        return proc.returncode
    print(proc.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
