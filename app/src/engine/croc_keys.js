// The 鳄 keyboard: a board of six ready-made questions instead of letters.
//
// Two kinds of key. GUIDE keys explain the product and are answered locally, so a
// visitor can find out what this is without a model call and without the answer
// drifting. EGG keys simply type one of the inputs easter_eggs.js already answers.
//
// Replies marked `owner: true` are sentences the owner wrote himself and are used
// verbatim. The others are PLACEHOLDERS that only restate a fact about the product
// (two models, thirty days on this device, two sentences); they are not written in
// his voice and are waiting for him to replace them. Every reply keeps the product
// rule: never more than two sentences.

export const GUIDE = [
  { id: "who", ask: "你是谁？", owner: true, reply: "我是人，是记忆，是鳄鱼，是对话框。" },
  { id: "croc", ask: "什么是鳄鱼？", owner: true, reply: "鳄鱼生活在水里，也可以生活在陆地上。家在湖边。" },
  { id: "model", ask: "你是哪个模型？", owner: false, reply: "背后有两个模型。小的是自己训练的，大的借它语言。" },
  { id: "memory", ask: "你会记得我吗？", owner: false, reply: "会，三十天，存在你这台设备里。过期就忘。" },
  { id: "two", ask: "为什么只说两句？", owner: false, reply: "规矩就是最多两句。" },
  { id: "other", ask: "efish other？", owner: false, reply: "this is efish other, an other. 另一个。" }
];

export const EGG_KEYS = ["？", "…", "□", "～"];

export function findGuide(id) {
  return GUIDE.find((g) => g.id === id) || null;
}
