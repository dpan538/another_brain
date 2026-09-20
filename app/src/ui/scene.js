// The home page is a rebus: one drawing, a fixed set of pen strokes, and words
// that are spelled out letter by letter and tied together with half-circles.
//
//   act 0  a tree        p‿e⁀r‿s⁀o‿n            是人。
//   act 1  a lock        · 3 [keyhole] 0 ·        m‿e⁀m‿o⁀r‿y     是记忆。
//   act 2  a cloud over two doors   湖 ⌒ 沪      (water | land)  是鳄鱼。
//   act 3  a loop        type → write → chat.                    是对话框。
//   act 4  the dialog box itself: the loop becomes the card's border and "type"
//          comes to rest on the placeholder of the input line.
//
// Nothing is swapped between acts. Every figure has exactly K strokes, paired by
// index, so the crown of the tree is the body of the lock is the cloud is the loop
// is the border of the chat window. Pure geometry, no DOM: it is tested in node.

import { wavyRectPoints } from "./wavy.js";

export const K = 25;
const POINTS = (k) => (k === 0 ? 160 : k === 1 ? 80 : 40);   // the outline needs the most detail
const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// a settle, not a bounce: the overshoot is kept small so a page full of arriving letters does not flicker
export const backOut = (t) => { const c = 1.1; const u = clamp01(t) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
export const span = (p, a, b) => clamp01((p - a) / (b - a));

// ── stroke helpers (design space) ─────────────────────────────────────────
function resample(points, m) {
  if (points.length === 1) return Array.from({ length: m }, () => points[0].slice());
  const seg = []; let total = 0;
  for (let i = 1; i < points.length; i += 1) { const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]); seg.push(d); total += d; }
  if (total === 0) return Array.from({ length: m }, () => points[0].slice());
  const out = []; let i = 0; let acc = 0;
  for (let j = 0; j < m; j += 1) {
    const target = (total * j) / (m - 1);
    while (i < seg.length - 1 && acc + seg[i] < target) { acc += seg[i]; i += 1; }
    const t = seg[i] === 0 ? 0 : Math.min(1, (target - acc) / seg[i]);
    out.push([points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t]);
  }
  return out;
}
// kind: line (may be read from either end), head (points somewhere), curve, point
const raw = (pts, kind = "curve", th = null) => ({ raw: pts, kind, th });
const seg = (a, b) => raw([a, b], "line");
const bent = (pts) => raw(pts, "line");
const spot = (q) => raw([q], "point");
const curve = (fn, n = 200) => raw(Array.from({ length: n + 1 }, (_, i) => fn(i / n)));
const polar = (c, r, a) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
const onEllipse = (c, rx, ry, a, f = 1) => [c[0] + Math.cos(a) * rx * f, c[1] + Math.sin(a) * ry * f];
function head(tip, a, size = 13, spread = 27) {
  const wing = (s) => [tip[0] - Math.cos(a + rad(s)) * size, tip[1] - Math.sin(a + rad(s)) * size];
  return raw([wing(spread), tip, wing(-spread)], "head", a);
}
function finish(list) {
  if (list.length !== K) throw new Error(`figure has ${list.length} strokes, expected ${K}`);
  return list.map((st, k) => {
    const pts = resample(st.raw, POINTS(k));
    const th = st.th != null ? st.th : st.kind === "line" ? Math.atan2(pts[pts.length - 1][1] - pts[0][1], pts[pts.length - 1][0] - pts[0][0]) : null;
    return { pts, th, kind: st.kind };
  });
}

// letters strung on a line of arcs: high, low, high, low …
function chain(word, faces, { x0 = 70, step = 52, high = 468, low = 506, size = 35 } = {}) {
  const glyphs = Array.from(word).map((ch, i) => ({ ch, face: faces[i % faces.length], x: x0 + step * i, y: i % 2 ? low : high, size, rot: i % 2 ? 4 : -4 }));
  const arcs = [];
  for (let i = 0; i + 1 < glyphs.length; i += 1) {
    const a = glyphs[i]; const b = glyphs[i + 1]; const mid = (a.x + b.x) / 2;
    // leaves a high letter level and drops onto the low one; leaves a low letter upwards and arrives level
    const q = a.y < b.y ? [[a.x + 15, a.y - 2], [b.x - 4, a.y - 6], [b.x - 9, b.y - 17]] : [[a.x + 9, a.y - 17], [a.x + 4, b.y - 6], [b.x - 15, b.y - 2]];
    arcs.push(Array.from({ length: 25 }, (_, n) => { const t = n / 24; const u = 1 - t; return [u * u * q[0][0] + 2 * u * t * q[1][0] + t * t * q[2][0], u * u * q[0][1] + 2 * u * t * q[1][1] + t * t * q[2][1]]; }));
  }
  // reveal order: letter, the arc that leaves it, next letter …
  const order = []; glyphs.forEach((_, i) => { order.push(["g", i]); if (i < arcs.length) order.push(["a", i]); });
  return { glyphs, arcs, order };
}

// ── design space: 400 × 520 ───────────────────────────────────────────────
export const DESIGN = { w: 400, h: 520 };

// act 0 — a tree with a graph in its crown
const CROWN = [200, 176];
const SEED = [[200, 318], [200, 262], [200, 205], [128, 232], [262, 246], [300, 214], [158, 160], [250, 168], [112, 150], [84, 196], [140, 96],
  [196, 120], [190, 62], [92, 262], [150, 290], [298, 132], [268, 108], [322, 176], [240, 300], [306, 270], [70, 170], [244, 70]];
const NODES = SEED.map(([x, y], n) => (n === 0 ? [200, 304] : [200 + (x - 200) * 0.88, 180 + (y - 190) * 0.78]));
const EDGES = [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [2, 6], [2, 7], [6, 8], [8, 9], [6, 10], [2, 11], [11, 12], [3, 13], [3, 14], [7, 15], [7, 16], [5, 17], [4, 18], [5, 19], [9, 20], [16, 21]];
const STICKERS = [3, 7, 12, 17];
function actTree() {
  const crown = curve((t) => { const a = -Math.PI / 2 + t * TAU; const f = 0.84 + 0.2 * Math.abs(Math.sin(4 * a + 0.35)) * (1 + 0.16 * Math.sin(3 * a + 1)); return onEllipse(CROWN, 174, 150, a, f); }, 400);
  const strokes = [crown, bent([[177, 310], [173, 396], [162, 430], [130, 452]]), bent([[223, 310], [227, 396], [238, 430], [270, 452]]), seg([88, 452], [312, 452]),
    ...EDGES.map(([a, b]) => seg(NODES[a], NODES[b]))];
  return {
    strokes: finish(strokes), nodes: NODES, stickers: STICKERS.map((n) => NODES[n]),
    text: chain("person", ["abril", "courier", "fraktur", "yellow", "playfair", "rubik"]),
    neon: Array.from({ length: 60 }, (_, i) => { const t = i / 59; const a = -2.4 + t * TAU * 1.2; return [NODES[10][0] + Math.cos(a) * (19 + 4 * t), NODES[10][1] + Math.sin(a) * (17 + 3 * t)]; })
  };
}

// act 1 — a lock: thirty days
function roundRect(x, y, w, h, r) {
  const pts = []; const push = (q) => pts.push(q);
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 10; i += 1) push(polar([cx, cy], r, a0 + (i / 10) * (Math.PI / 2))); };
  push([x + w / 2, y]); push([x + w - r, y]); arc(x + w - r, y + r, -Math.PI / 2); push([x + w, y + h - r]); arc(x + w - r, y + h - r, 0);
  push([x + r, y + h]); arc(x + r, y + h - r, Math.PI / 2); push([x, y + r]); arc(x + r, y + r, Math.PI); push([x + w / 2, y]);
  return pts;
}
const shackle = (x0, x1, yb, yc) => { const c = [(x0 + x1) / 2, yc]; const r = (x1 - x0) / 2; return [[x0, yb], ...Array.from({ length: 41 }, (_, i) => polar(c, r, Math.PI + (i / 40) * Math.PI)), [x1, yb]]; };
function actLock() {
  const H = [200, 166];
  const ticks = Array.from({ length: 18 }, (_, i) => { const a = rad(-200 + (220 / 17) * i); return seg(polar(H, 94, a), polar(H, 116, a)); });
  const strokes = [raw(roundRect(86, 236, 228, 210, 28)), raw(shackle(128, 272, 236, 166)), raw(shackle(152, 248, 236, 166)),
    curve((t) => polar([200, 318], 21, -Math.PI / 2 + t * TAU), 60), seg([191, 337], [182, 392]), seg([209, 337], [218, 392]), seg([182, 392], [218, 392]), ...ticks];
  const text = chain("memory", ["rubik", "playfair", "abril", "courier", "yellow", "fraktur"]);
  // the face of the lock reads like a badge: · 3 [keyhole] 0 ·
  const face = [{ ch: "·", dot: true, x: 108, y: 338, size: 38 }, { ch: "3", face: "sans", x: 148, y: 338, size: 58 }, { ch: "0", face: "sans", x: 252, y: 338, size: 58 }, { ch: "·", dot: true, x: 292, y: 338, size: 38 }];
  const base = face.length;
  return {
    strokes: finish(strokes),
    text: { glyphs: [...face, ...text.glyphs], arcs: text.arcs, order: [["g", 1], ["g", 2], ["g", 0], ["g", 3], ...text.order.map(([k, i]) => (k === "g" ? ["g", i + base] : ["a", i]))] },
    neon: Array.from({ length: 60 }, (_, i) => { const t = i / 59; const a = -1.2 + t * TAU * 1.18; return [252 + Math.cos(a) * (27 + 4 * t), 338 + Math.sin(a) * (33 - 3 * t)]; })
  };
}

// act 2 — a cloud over two doors: water and land, 湖 and 沪
const archPath = (x0, x1, base, spring) => shackle(x0, x1, base, spring);
function actDoors() {
  const cloud = curve((t) => { const a = -Math.PI / 2 + t * TAU; const rr = 1 + 0.2 * Math.abs(Math.sin(3 * a + 0.5)); const q = onEllipse([150, 62], 112, 62, a, rr); return [q[0], Math.min(q[1], 86)]; }, 400);
  const rain = [[70, 114], [110, 114], [150, 114], [190, 114], [230, 114], [90, 140], [130, 140], [170, 140]].map(([x, y]) => seg([x, y], [x - 7, y + 16]));
  const teeth = Array.from({ length: 13 }, (_, i) => { const x = (n) => 40 + (320 / 13) * n; return seg([x(i), i % 2 ? 480 : 504], [x(i + 1), i % 2 ? 504 : 480]); });
  const left = archPath(40, 196, 462, 330); const right = archPath(204, 360, 462, 330);
  const over = Array.from({ length: 41 }, (_, i) => onEllipse([200, 242], 82, 54, Math.PI + (i / 40) * Math.PI));
  return {
    strokes: finish([cloud, raw(left), raw(right), seg([28, 462], [372, 462]), ...rain, ...teeth]),
    fills: [{ stroke: 1, kind: "water" }, { stroke: 2, kind: "land" }],
    text: {
      glyphs: [{ ch: "湖", face: "han", x: 118, y: 382, size: 62, bare: true }, { ch: "hú", face: "italic", x: 118, y: 436, size: 21, bare: true }, { ch: "沪", face: "han", x: 282, y: 382, size: 62, paper: true }, { ch: "hù", face: "italic", x: 282, y: 436, size: 21, paper: true }],
      arcs: [over], order: [["g", 0], ["g", 1], ["a", 0], ["g", 2], ["g", 3]]
    },
    neon: over.slice(4, 37).map(([x, y]) => [x, y + 1])
  };
}

// act 3 — a loop: what you type comes back written
const LOOP = { c: [200, 272], rx: 150, ry: 98 };
function actLoop() {
  const loop = curve((t) => onEllipse(LOOP.c, LOOP.rx, LOOP.ry, -Math.PI / 2 + t * TAU), 400);
  const tangent = (a) => Math.atan2(LOOP.ry * Math.cos(a), -LOOP.rx * Math.sin(a));          // clockwise travel
  const a1 = rad(-128); const a2 = rad(52);
  const angles = [...Array.from({ length: 11 }, (_, i) => -50 + 10 * i), ...Array.from({ length: 10 }, (_, i) => 135 + 10 * i)];
  const ticks = angles.map((d) => seg(onEllipse(LOOP.c, LOOP.rx, LOOP.ry, rad(d), 1.1), onEllipse(LOOP.c, LOOP.rx, LOOP.ry, rad(d), 1.23)));
  const word = (s, face, y, step, size) => Array.from(s).map((ch, i) => ({ ch, face, x: 200 + (i - (s.length - 1) / 2) * step, y, size }));
  const glyphs = [...word("type", "courier", LOOP.c[1] - LOOP.ry, 34, 40), ...word("write", "sans", LOOP.c[1] + LOOP.ry, 33, 40), { ch: "chat.", face: "yellow", x: 200, y: 274, size: 52 }];
  return {
    strokes: finish([loop, curve((t) => polar([LOOP.c[0] + LOOP.rx, LOOP.c[1]], 12, -Math.PI / 2 + t * TAU), 60), head(onEllipse(LOOP.c, LOOP.rx, LOOP.ry, a1), tangent(a1)), head(onEllipse(LOOP.c, LOOP.rx, LOOP.ry, a2), tangent(a2)), ...ticks]),
    dot: [LOOP.c[0] - LOOP.rx, LOOP.c[1]],
    text: { glyphs, arcs: [], order: glyphs.map((_, i) => ["g", i]) },
    neon: Array.from({ length: 40 }, (_, i) => { const t = i / 39; return [146 + 108 * t, 306 + Math.sin(t * 17) * 5 - 5 * t]; })
  };
}

// ── pairing two figures stroke by stroke ──────────────────────────────────
// A straight stroke should stay a stick while it moves, not shrink through a point,
// so each pair is interpolated as: centre + heading + shape in the stroke's own frame.
const wrap = (a) => { let v = a; while (v > Math.PI) v -= TAU; while (v <= -Math.PI) v += TAU; return v; };
function frame(pts, th) {
  let cx = 0; let cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= pts.length; cy /= pts.length;
  const c = Math.cos(-th); const s = Math.sin(-th);
  return { cx, cy, local: pts.map((q) => { const x = q[0] - cx; const y = q[1] - cy; return [x * c - y * s, x * s + y * c]; }) };
}
function pairStrokes(a, b) {
  let aPts = a.pts; let bPts = b.pts; let thA = a.th; let thB = b.th;
  if (thA != null && thB != null) {
    if (Math.abs(wrap(thB - thA)) > Math.PI / 2) {
      if (b.kind === "line") { bPts = bPts.slice().reverse(); thB += Math.PI; } else if (a.kind === "line") { aPts = aPts.slice().reverse(); thA += Math.PI; }
    }
  } else if (thA == null && thB == null) { thA = 0; thB = 0; } else if (thA == null) thA = thB; else thB = thA;
  const fa = frame(aPts, thA); const fb = frame(bPts, thB);
  return { ax: fa.cx, ay: fa.cy, bx: fb.cx, by: fb.cy, thA, dth: wrap(thB - thA), la: fa.local, lb: fb.local };
}

const STAGGER = 0.3;
export const strokeT = (k, t, stagger = STAGGER) => ease(clamp01((t - (stagger * k) / K) / (1 - stagger)));
export const pathOf = (pts, close = false) => { let d = ""; for (let j = 0; j < pts.length; j += 1) d += `${j ? "L" : "M"}${pts[j][0].toFixed(1)} ${pts[j][1].toFixed(1)}`; return close ? `${d}Z` : d; };

/** Points of stroke k of a pair at transition time t. `swing` scales the detour (px); `stagger` spreads the arrivals. */
export function morphPoints(pair, k, t, swing = 1, stagger = STAGGER) {
  const e = strokeT(k, t, stagger);
  const th = pair.thA + pair.dth * e; const c = Math.cos(th); const s = Math.sin(th);
  // each line leaves on its own heading and settles back, so the move reads as flight, not a fade
  const out = k < 2 ? 0 : Math.sin(Math.PI * e) * (3 + (k % 5) * 2) * swing * (k % 2 ? 1 : -1); const heading = k * 2.399;
  const cx = lerp(pair.ax, pair.bx, e) + Math.cos(heading) * out; const cy = lerp(pair.ay, pair.by, e) + Math.sin(heading) * out;
  const pts = new Array(pair.la.length);
  for (let j = 0; j < pair.la.length; j += 1) {
    const lx = lerp(pair.la[j][0], pair.lb[j][0], e); const ly = lerp(pair.la[j][1], pair.lb[j][1], e);
    pts[j] = [cx + lx * c - ly * s, cy + lx * s + ly * c];
  }
  return pts;
}

// ── the clock of the story: everything is a function of scroll progress p ──
export const MORPH = [[0.05, 0.19], [0.31, 0.45], [0.57, 0.71], [0.84, 0.94]];     // act i → act i + 1
export const REVEAL = [null, [0.18, 0.27], [0.44, 0.53], [0.7, 0.79]];              // act 0 is revealed by the intro
export const VANISH = [[0.02, 0.06], [0.28, 0.32], [0.54, 0.58], [0.82, 0.86]];
export const ACTS = 4;
// One gesture plays the drawing to the next of these and stops: each is an act at rest.
export const STOPS = [0, 0.275, 0.535, 0.805, 1];
export function phaseAt(p) {
  for (let i = 0; i < MORPH.length; i += 1) {
    if (p < MORPH[i][0]) return { from: i, to: i, t: 0 };
    if (p < MORPH[i][1]) return { from: i, to: i + 1, t: (p - MORPH[i][0]) / (MORPH[i][1] - MORPH[i][0]) };
  }
  return { from: MORPH.length, to: MORPH.length, t: 0 };
}
/** how present act i's extras (fills, stickers, nodes) are: they arrive late and leave early */
export function presence(i, p) {
  const inn = i === 0 ? 1 : span(p, lerp(MORPH[i - 1][0], MORPH[i - 1][1], 0.8), MORPH[i - 1][1]);
  const out = i < MORPH.length ? 1 - span(p, MORPH[i][0], lerp(MORPH[i][0], MORPH[i][1], 0.16)) : 1;
  return inn * out;
}

/**
 * Lays the acts out for one screen.
 * @param m { W, H, top, bottom, card:{x,y,w,h}, key:{x,y,r}|null, ghost:[{x,y}]×4|null, ghostSize, rule:{x,y,len}|null } — px, relative to the stage
 */
export function buildScene(m) {
  const margin = 12;
  const s = Math.max(0.4, Math.min((m.W - margin * 2) / DESIGN.w, (m.bottom - m.top) / DESIGN.h));
  const ox = (m.W - DESIGN.w * s) / 2; const oy = m.top + (m.bottom - m.top - DESIGN.h * s) / 2;
  const P = (q) => [ox + q[0] * s, oy + q[1] * s];
  const acts = [actTree(), actLock(), actDoors(), actLoop()];

  // act 4 — the dialog box, in the card's own pixels
  const card = m.card;
  const outline = wavyRectPoints(card.w, card.h, { amp: 0, step: 2 }).map((q) => [q[0] + card.x, q[1] + card.y]);
  let start = 0; let best = Infinity; const topMid = [card.x + card.w / 2, card.y];
  outline.forEach((q, i) => { const d = Math.hypot(q[0] - topMid[0], q[1] - topMid[1]); if (d < best) { best = d; start = i; } });
  const ringPts = outline.slice(start).concat(outline.slice(0, start)); ringPts.push(ringPts[0].slice());
  // the pieces land on the rule that is really drawn under the input line
  const line = m.rule || { x: card.x + 38, y: card.y + card.h - 37, len: Math.min(132, card.w - 90) };
  const piece = line.len / (K - 2); const wob = (x) => line.y + Math.sin(x * 0.085) * 1.3;
  const base = Array.from({ length: K - 2 }, (_, i) => { const x0 = line.x + i * piece; return seg([x0, wob(x0)], [x0 + piece, wob(x0 + piece)]); });
  const key = m.key || { x: card.x + card.w - 60, y: card.y + card.h + 200, r: 18 };
  const box = finish([raw(ringPts), curve((t) => polar([key.x, key.y], key.r, -Math.PI / 2 + t * TAU), 60), ...base]);

  const figs = [...acts.map((a) => a.strokes.map((st) => ({ ...st, pts: st.pts.map(P) }))), box];
  const pairs = figs.slice(0, -1).map((f, i) => f.map((st, k) => pairStrokes(st, figs[i + 1][k])));
  const rest = figs.map((f) => f.map((st) => st.pts));

  const text = acts.map((a) => ({
    glyphs: a.text.glyphs.map((g) => ({ ...g, x: P([g.x, g.y])[0], y: P([g.x, g.y])[1], size: g.size * s, rot: g.rot || 0 })),
    arcs: a.text.arcs.map((pts) => pathOf(pts.map(P))), order: a.text.order
  }));
  // "type" ends on the placeholder of the input line
  const ghost = m.ghost || [0, 1, 2, 3].map((i) => ({ x: line.x + 5 + i * (m.ghostSize || 18) * 0.6, y: line.y - 15 }));
  const landing = ghost.map((g) => ({ x: g.x, y: g.y, size: m.ghostSize || 18 }));

  return {
    s, ox, oy, figs, pairs, rest, text, landing, card, line,
    box: { top: oy, height: DESIGN.h * s },
    nodes: acts[0].nodes.map(P), stickers: acts[0].stickers.map(P), nodeR: 5 * s, stickerR: 16 * s,
    dot: { at: P(acts[3].dot), r: 8 * s }, fills: acts[2].fills,
    neon: acts.map((a) => pathOf(a.neon.map(P)))
  };
}
