export const DIALOGUE_LENGTH_CLASSES = [
  "ordinary",
  "practical",
  "rewrite_summary",
  "logic",
  "philosophy",
  "boundary",
] as const;

export type DialogueLengthClass = typeof DIALOGUE_LENGTH_CLASSES[number];

export interface DeterministicLengthPolicy {
  dialogue_class: DialogueLengthClass;
  maximum_chinese_characters: number | null;
  instruction: string;
}

const BOUNDARY = /(你是谁|称呼你|叫你|身份|复制|替身|隐私|私人|密码|账号|银行卡|护照|身份证|住址|记住我|记得我)/iu;
const REWRITE_SUMMARY = /(改写|重写|润色|改得|写得|压成|压缩|缩短|概括|总结|摘要|一句话)/iu;
const LOGIC = /(如果.{0,24}(就|那么)|只有.{0,24}才|能否断定|能确定|能推出|恰好|同时为真|说谎|充分条件|必要条件|谁最后到)/iu;
const PHILOSOPHY = /(意义|价值|自由|选择|理解|记住|善意|矛盾|沉默|习惯|存在|道德|意识|真实|幸福|学习的一部分)/iu;
const PRACTICAL = /(怎么|怎样|如何|减轻味道|更顺手|更合适|各有什么取舍)/iu;

export function classifyDialogueLength(currentUserInput: string): DialogueLengthClass {
  const text = String(currentUserInput ?? "").trim();
  if (BOUNDARY.test(text)) return "boundary";
  if (REWRITE_SUMMARY.test(text)) return "rewrite_summary";
  if (LOGIC.test(text)) return "logic";
  if (PHILOSOPHY.test(text)) return "philosophy";
  if (PRACTICAL.test(text)) return "practical";
  return "ordinary";
}

export function deterministicLengthPolicy(currentUserInput: string): DeterministicLengthPolicy {
  const dialogueClass = classifyDialogueLength(currentUserInput);
  if (dialogueClass === "rewrite_summary") {
    return {
      dialogue_class: dialogueClass,
      maximum_chinese_characters: null,
      instruction: "确定性长度策略：按改写或摘要任务所需长度作答，但保持简洁，不附加解释。",
    };
  }
  const maximum = dialogueClass === "practical" ? 120 : dialogueClass === "logic" || dialogueClass === "philosophy" ? 180 : 80;
  return {
    dialogue_class: dialogueClass,
    maximum_chinese_characters: maximum,
    instruction: `确定性长度策略：回答通常不超过${maximum}个汉字；只在完整回答确有必要时略超，不以清单或铺垫填充。`,
  };
}
