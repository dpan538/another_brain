// A rounded rectangle whose edge is a small continuous wave, after the reference
// card. The wave count is fitted to the perimeter so the line closes without a
// seam. Shared by the chat card and by the home drawing, whose ring ends up as
// exactly this outline.
export function wavyRectPoints(w, h, { inset = 10, radius = 22, amp = 3, wavelength = 14, step = 1.6 } = {}) {
  const W = Math.max(0, w - inset * 2); const H = Math.max(0, h - inset * 2);
  if (W < radius * 2 + 4 || H < radius * 2 + 4) return [];
  const r = radius; const sx = W - 2 * r; const sy = H - 2 * r; const arc = (Math.PI * r) / 2;
  const total = 2 * sx + 2 * sy + 4 * arc;
  const waves = Math.max(8, Math.round(total / wavelength));
  const k = (2 * Math.PI * waves) / total;
  const segs = [
    { len: sx, at: (t) => [r + t, 0, 0, -1] },
    { len: arc, at: (t) => { const a = -Math.PI / 2 + t / r; return [W - r + Math.cos(a) * r, r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } },
    { len: sy, at: (t) => [W, r + t, 1, 0] },
    { len: arc, at: (t) => { const a = t / r; return [W - r + Math.cos(a) * r, H - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } },
    { len: sx, at: (t) => [W - r - t, H, 0, 1] },
    { len: arc, at: (t) => { const a = Math.PI / 2 + t / r; return [r + Math.cos(a) * r, H - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } },
    { len: sy, at: (t) => [0, H - r - t, -1, 0] },
    { len: arc, at: (t) => { const a = Math.PI + t / r; return [r + Math.cos(a) * r, r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } }
  ];
  let s = 0; const pts = [];
  for (const seg of segs) {
    for (let t = 0; t < seg.len; t += step) {
      const [x, y, nx, ny] = seg.at(t);
      const o = Math.sin((s + t) * k) * amp;
      pts.push([x + nx * o + inset, y + ny * o + inset]);
    }
    s += seg.len;
  }
  return pts;
}

export function wavyRectPath(w, h, options) {
  const pts = wavyRectPoints(w, h, options);
  return pts.length ? `M${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("L")}Z` : "";
}
