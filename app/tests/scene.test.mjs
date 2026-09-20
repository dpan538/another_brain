import test from "node:test";
import assert from "node:assert/strict";

const S = await import("../src/ui/scene.js");
const M = await import("../src/engine/memory_store.js");
const C = await import("../src/engine/croc_keys.js");
const { createAnswerPath } = await import("../src/engine/answer_path.js");
const { limitSentences } = await import("../src/engine/sentence_limit.js");

const screen = { W: 375, H: 812, top: 76, bottom: 690, card: { x: 8, y: 74, w: 359, h: 438 } };

test("every act is drawn with the same 25 strokes, so nothing is swapped between acts", () => {
  const scene = S.buildScene(screen);
  assert.equal(scene.figs.length, S.ACTS + 1);
  for (const fig of scene.figs) assert.equal(fig.length, S.K);
  scene.pairs.forEach((pairs) => pairs.forEach((p, k) => { assert.equal(p.la.length, p.lb.length, `stroke ${k} keeps its point count`); }));
});

test("a transition starts on one drawing and ends exactly on the next", () => {
  const scene = S.buildScene(screen);
  scene.pairs.forEach((pairs, f) => {
    for (const k of [0, 1, 7, 24]) {
      const start = S.morphPoints(pairs[k], k, 0, 1); const end = S.morphPoints(pairs[k], k, 1, 1);
      const sameSet = (pts, ref) => { const d0 = Math.hypot(pts[0][0] - ref[0][0], pts[0][1] - ref[0][1]); const d1 = Math.hypot(pts[0][0] - ref[ref.length - 1][0], pts[0][1] - ref[ref.length - 1][1]); return Math.min(d0, d1) < 0.6; };
      assert.ok(sameSet(start, scene.figs[f][k].pts), `act ${f} stroke ${k} starts in place`);
      assert.ok(sameSet(end, scene.figs[f + 1][k].pts), `act ${f} stroke ${k} lands in place`);
    }
  });
});

test("the loop ends as the border of the chat card", () => {
  const scene = S.buildScene(screen); const ring = scene.figs[S.ACTS][0].pts;
  const xs = ring.map((q) => q[0]); const ys = ring.map((q) => q[1]);
  assert.ok(Math.abs(Math.min(...xs) - (screen.card.x + 10)) < 1.5 && Math.abs(Math.max(...xs) - (screen.card.x + screen.card.w - 10)) < 1.5);
  assert.ok(Math.abs(Math.min(...ys) - (screen.card.y + 10)) < 1.5 && Math.abs(Math.max(...ys) - (screen.card.y + screen.card.h - 10)) < 1.5);
});

test("the story rests on its acts, in order, from the first drawing to the chat", () => {
  assert.equal(S.STOPS[0], 0); assert.equal(S.STOPS[S.STOPS.length - 1], 1); assert.equal(S.STOPS.length, S.ACTS + 1);
  S.STOPS.forEach((p, i) => { const ph = S.phaseAt(p); assert.equal(ph.from, ph.to, `stop ${i} is an act at rest`); assert.equal(ph.from, i); });
  for (let i = 1; i < S.ACTS; i += 1) { assert.ok(S.STOPS[i] > S.REVEAL[i][1] && S.STOPS[i] < S.VANISH[i][0], `the words of act ${i} are complete at its stop`); }
});

test("conversations are grouped, newest first, and older turns without an id stay together", () => {
  const turns = [{ role: "user", text: "旧的", at: 10 }, { role: "efish", text: "嗯", at: 11 }, { role: "user", text: "第二次", at: 50, c: 50 }, { role: "efish", text: "好", at: 51, c: 50 }, { role: "user", text: "第三次", at: 90, c: 90 }];
  const groups = M.groupConversations(turns);
  assert.deepEqual(groups.map((g) => g.id), [90, 50, 0]);
  assert.equal(groups[1].title, "第二次"); assert.equal(groups[2].count, 2);
});

test("the 鳄 board answers locally, never with more than two sentences, and never calls the model", async () => {
  assert.ok(C.GUIDE.length >= 5 && C.GUIDE.length <= 6);
  let called = 0;
  const path = createAnswerPath({ proxyUrl: "/api/chat", fetchImpl: async () => { called += 1; throw new Error("must not be called"); } });
  for (const g of C.GUIDE) {
    const r = await path.answer({ userText: g.ask, preset: g.id });
    assert.equal(r.ok, true); assert.equal(r.source, "guide"); assert.equal(r.text, g.reply);
    assert.equal(limitSentences(g.reply, 2).text, g.reply, `"${g.ask}" stays within two sentences`);
  }
  assert.equal(called, 0);
});

test("an answer that is ready at once still waits, then is written out in order", async () => {
  const { createPacer, thinkTime } = await import("../src/engine/pacer.js");
  assert.ok(thinkTime("背后有两个：一个是我们自己从零训练的小模型。") > thinkTime("够了。"));
  let clock = 0; const queue = []; const shown = [];
  const pacer = createPacer({ onShow: (t) => shown.push([clock, t]), charMs: 10, minThinkMs: 100, now: () => clock, schedule: (fn, ms) => { const job = { at: clock + ms, fn }; queue.push(job); return job; }, cancel: (job) => queue.splice(queue.indexOf(job), 1) });
  const done = pacer.end("好。够了");
  while (queue.length) { queue.sort((a, b) => a.at - b.at); const job = queue.shift(); clock = job.at; job.fn(); }
  await done;
  assert.ok(shown[0][0] >= thinkTime("好。够了"), "nothing is shown before the pause is over");
  assert.deepEqual(shown.map((s) => s[1]), ["好", "好。", "好。够", "好。够了"]);
  assert.ok(shown[2][0] - shown[1][0] > shown[1][0] - shown[0][0], "a full stop is followed by a longer breath");
});

test("a streamed answer is followed as it grows and never shows more than it was given", async () => {
  const { createPacer } = await import("../src/engine/pacer.js");
  let clock = 0; const queue = []; const shown = [];
  const run = (until) => { for (;;) { queue.sort((a, b) => a.at - b.at); if (!queue.length || queue[0].at > until) break; const job = queue.shift(); clock = job.at; job.fn(); } clock = until; };
  const pacer = createPacer({ onShow: (t) => shown.push(t), charMs: 10, minThinkMs: 50, now: () => clock, schedule: (fn, ms) => { const job = { at: clock + ms, fn }; queue.push(job); return job; }, cancel: () => {} });
  run(400); pacer.push("影子"); run(500); pacer.push("影子并不是身体"); run(600);
  const done = pacer.end("影子并不是身体。"); run(2000); await done;
  assert.equal(shown.at(-1), "影子并不是身体。");
  for (let i = 1; i < shown.length; i += 1) assert.ok(shown[i].startsWith(shown[i - 1]), "the text only ever grows");
});
