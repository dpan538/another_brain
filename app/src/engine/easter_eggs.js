// Easter eggs.
//
// Certain inputs are answered locally, without a model call. Every reply is a
// sentence the owner wrote himself; nothing here is invented on his behalf. To
// add one, append to EGGS: `match` receives the raw typed text.

const only = (re) => (t) => re.test(String(t).trim());

export const EGGS = [
  { id: "silence", match: (t) => String(t).length > 0 && String(t).trim() === "",
    reply: "这要看沉默说的是 null 还是 empty string。" },
  { id: "question_mark", match: only(/^[?？]+$/),
    reply: "问题不需要有答案。" },
  { id: "null", match: only(/^null$/i),
    reply: "如果什么都没有那就没有回答，所以无法被认知为一种回答。" },
  { id: "you_are_wrong", match: only(/^(你肯定错了[。.!！]*\s*){1,}$/),
    reply: "你肯定错了。如果是我也这样说。" },
  { id: "crocodile", match: only(/^(鳄|鳄鱼|🐊|efish)$/i),
    reply: "鳄鱼生活在水里，也可以生活在陆地上。家在湖边，在沪边上。" },
  { id: "enough", match: only(/^(够了|enough)[。.]?$/i),
    reply: "这就够了。然后第二天又不够了。" },
  { id: "wave", match: only(/^[~～]+$/),
    reply: "水在动。" },
  { id: "square", match: only(/^[□■]+$/),
    reply: "Cube, I've told you more than once, you will never become a ball." },
  { id: "ellipsis", match: only(/^(…|\.{3,}|。{3,})+$/),
    reply: "总归要给自己留一些余地，或者给别人的继续留一些空间。" }
];

export function findEgg(text) {
  for (const egg of EGGS) {
    try { if (egg.match(text)) return { id: egg.id, reply: egg.reply }; } catch { /* a broken egg never blocks a turn */ }
  }
  return null;
}
