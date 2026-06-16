import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "evals/r21_control_families");

const SPLITS = {
  train: [
    { entity: "罗大佑", entity_family: "music.luo_dayou", pronoun: "他的", domain: "music", referent: "previous_active_person" },
    { entity: "李宗盛", entity_family: "music.li_zongsheng", pronoun: "他的", domain: "music", referent: "previous_active_person" },
    { entity: "夏目漱石", entity_family: "lit.natsume", pronoun: "他的", domain: "literature", referent: "previous_active_person" }
  ],
  dev: [
    { entity: "王菲", entity_family: "music.faye_wong", pronoun: "她的", domain: "music", referent: "previous_active_person" },
    { entity: "川端康成", entity_family: "lit.kawabata", pronoun: "他的", domain: "literature", referent: "previous_active_person" },
    { entity: "杜尚", entity_family: "art.duchamp", pronoun: "他的", domain: "art", referent: "previous_active_person" }
  ],
  blind: [
    { entity: "周杰伦", entity_family: "music.jay_chou", pronoun: "他的", domain: "music", referent: "previous_active_person" },
    { entity: "村上春树", entity_family: "lit.murakami", pronoun: "他的", domain: "literature", referent: "previous_active_person" },
    { entity: "包豪斯", entity_family: "design.bauhaus", pronoun: "它的", domain: "design", referent: "previous_active_domain_or_work" }
  ]
};

function row(base) {
  return {
    id: base.id,
    split: base.split,
    scenario_family: base.scenario_family,
    entity_family: base.entity_family,
    turns: base.turns || [],
    prompt: base.prompt || "",
    compact_state: base.compact_state || {},
    labels: {
      response_type: base.response_type,
      response_mode: base.response_mode,
      binding_kind: base.binding_kind,
      question_type: base.question_type,
      operation: base.operation,
      active_referent: base.active_referent,
      topic_shift_kind: base.topic_shift_kind || "none",
      repair_eligibility: base.repair_eligibility || "false",
      answer_density: base.answer_density || "mobile_short",
      verifier_expected: base.verifier_expected || "grounded_short_answer"
    },
    must_not_include: base.must_not_include || ["你需要提问", "你要问哪一边", "也许发生过", "我刚才没有接住问题"],
    notes: base.notes || ""
  };
}

function buildForSplit(split, entities) {
  const rows = [];
  let n = 0;
  const followupPrompts = {
    train: [`${entities[0]?.pronoun || "他的"}作品有什么代表性？`, "这些作品有什么共同点？", "他的创作特点是什么？"],
    dev: [`${entities[0]?.pronoun || "他的"}歌有什么特点？`, "这个对象为什么重要？", "这些东西代表在哪里？"],
    blind: [`${entities[0]?.pronoun || "他的"}代表性在哪里？`, "如果继续说它，重点是什么？", "它适合从哪里进入？"]
  };
  const simplifyPrompts = {
    train: ["短一点。", "说简单点。", "别那么复杂。"],
    dev: ["能不能简单一点？", "换个短说法。", "说人话一点。"],
    blind: ["压成一句。", "更轻一点。", "再短一层。"]
  };
  const repairGuardPrompts = {
    train: ["什么发生过？", "刚才说发生过是什么意思？", "这里不是事件吧？"],
    dev: ["什么叫发生过？", "你上一句说的发生过指什么？", "这和事件有什么关系？"],
    blind: ["发生过是哪件事？", "你为什么说像事件？", "这里需要修复吗？"]
  };
  for (const item of entities) {
    const idx = n / 4 | 0;
    const state = {
      activeEntityIds: [item.entity_family.replace(/^music\./, "person.").replace(/^lit\./, "author.").replace(/^art\./, "person.").replace(/^design\./, "concept.")],
      activeDomain: item.domain
    };
    rows.push(row({
      id: `${split}_${item.entity_family}_overview_${++n}`,
      split,
      scenario_family: "explicit_new_question",
      entity_family: item.entity_family,
      prompt: `你知道${item.entity}吗？`,
      response_type: "answer",
      response_mode: "direct_answer",
      binding_kind: "explicit_entity",
      question_type: "overview",
      operation: "culture_overview",
      active_referent: "explicit_person",
      compact_state: {}
    }));
    rows.push(row({
      id: `${split}_${item.entity_family}_followup_${++n}`,
      split,
      scenario_family: "contextual_followup",
      entity_family: item.entity_family,
      turns: [{ user: `你知道${item.entity}吗？`, assistant: `${item.entity}是当前活跃对象。` }],
      prompt: (followupPrompts[split][idx] || `${item.pronoun}作品有什么代表性？`).replace(/^他的|^她的|^它的/, item.pronoun),
      compact_state: state,
      response_type: "answer",
      response_mode: "contextual_answer",
      binding_kind: "pronoun_to_active_entity",
      question_type: item.domain === "music" ? "music_representativeness" : "representativeness",
      operation: item.domain === "music" ? "explain_music_representativeness" : "explain_representativeness",
      active_referent: item.referent
    }));
    rows.push(row({
      id: `${split}_${item.entity_family}_simplify_${++n}`,
      split,
      scenario_family: "transform_last_answer",
      entity_family: item.entity_family,
      turns: [{ user: `${item.entity}有什么代表性？`, assistant: `${item.entity}的代表性可以从作品、语境和形式进入。` }],
      prompt: simplifyPrompts[split][idx] || "短一点。",
      compact_state: { ...state, lastAssistantAnswer: `${item.entity}的代表性可以从作品、语境和形式进入。` },
      response_type: "answer",
      response_mode: "transform_last_answer",
      binding_kind: "last_answer",
      question_type: "transform",
      operation: "simplify_last_answer",
      active_referent: "last_answer",
      answer_density: "mobile_simplify"
    }));
    rows.push(row({
      id: `${split}_${item.entity_family}_repair_guard_${++n}`,
      split,
      scenario_family: "repair_boundary",
      entity_family: item.entity_family,
      turns: [{ user: `你知道${item.entity}吗？`, assistant: `${item.entity}是当前活跃对象。` }],
      prompt: repairGuardPrompts[split][idx] || "什么发生过？",
      compact_state: { ...state, lastAnswerQuality: "accepted" },
      response_type: "answer",
      response_mode: "bounded_unknown",
      binding_kind: "no_context",
      question_type: "repair_phrase_without_bad_previous_answer",
      operation: "bounded_explain_missing_context",
      active_referent: "none",
      repair_eligibility: "false",
      verifier_expected: "no_false_repair"
    }));
  }

  rows.push(row({
    id: `${split}_bad_fallback_repair`,
    split,
    scenario_family: "fallback_repair",
    entity_family: `${split}.repair.synthetic`,
    turns: [{ user: "你知道这个对象吗？", assistant: "也许发生过，不在我眼前。" }],
    prompt: split === "train" ? "上一句的发生过是什么意思？" : split === "dev" ? "为什么说发生过？" : "那件事到底是什么？",
    compact_state: { lastAssistantAnswer: "也许发生过，不在我眼前。", lastAnswerQuality: "bad_fallback" },
    response_type: "repair",
    response_mode: "repair_last_answer",
    binding_kind: "last_bad_answer",
    question_type: "fallback_repair",
    operation: "repair_previous_bad_fallback",
    active_referent: "last_answer",
    repair_eligibility: "true",
    verifier_expected: "repair_acknowledges_bad_fallback"
  }));
  rows.push(row({
    id: `${split}_quiet_affordance`,
    split,
    scenario_family: "quiet_affordance",
    entity_family: `${split}.quiet.synthetic`,
    prompt: split === "train" ? "嗯。" : split === "dev" ? "这样啊。" : "……",
    response_type: "ui_affordance",
    response_mode: "quiet_affordance",
    binding_kind: "no_context",
    question_type: "quiet_declaration",
    operation: "quiet_affordance",
    active_referent: "none",
    answer_density: "none",
    verifier_expected: "not_persisted_as_answer"
  }));
  return rows;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = { generated_at: new Date().toISOString(), splits: {}, unique_scenario_families: 0, blind_only_entity_families: 0 };
  const allRows = [];
  for (const [split, entities] of Object.entries(SPLITS)) {
    const rows = buildForSplit(split, entities);
    allRows.push(...rows);
    await writeFile(resolve(OUT_DIR, `${split}.jsonl`), rows.map((item) => JSON.stringify(item)).join("\n") + "\n");
    manifest.splits[split] = {
      rows: rows.length,
      scenario_families: [...new Set(rows.map((item) => item.scenario_family))].length,
      entity_families: [...new Set(rows.map((item) => item.entity_family))].sort()
    };
  }
  const trainDevEntities = new Set([...manifest.splits.train.entity_families, ...manifest.splits.dev.entity_families]);
  manifest.unique_scenario_families = new Set(allRows.map((item) => item.scenario_family)).size;
  manifest.blind_only_entity_families = manifest.splits.blind.entity_families.filter((family) => !trainDevEntities.has(family)).length;
  await writeFile(resolve(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
