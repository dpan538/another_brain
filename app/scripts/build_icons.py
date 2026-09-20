"""Builds the app icons: white ground, the neon marker scribble, and "Efish" in its five faces.

The letters are taken as outlines from the same font files the app ships (@fontsource), so the
icons are pure paths: no font has to load, and they stay sharp at any size.

  python3 scripts/build_icons.py            # needs fonttools; PNGs are rasterised with macOS qlmanage
"""
import re, subprocess, sys, tempfile, shutil
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

APP = Path(__file__).resolve().parent.parent
FONTS = APP / "node_modules" / "@fontsource"
OUT = APP / "public" / "icons"
INK, NEON, DOT, WHITE = "#1c1b1a", "#39ff14", "#9fd4e8", "#ffffff"

# letter, font file, optical size (the logo's own multipliers), outlined?
FACES = [
    ("E", "abril-fatface/files/abril-fatface-latin-400-normal.woff", 1.04, False),
    ("f", "yellowtail/files/yellowtail-latin-400-normal.woff", 1.26, False),
    ("i", "courier-prime/files/courier-prime-latin-700-normal.woff", 0.98, False),
    ("s", "unifrakturmaguntia/files/unifrakturmaguntia-latin-400-normal.woff", 1.14, False),
    ("h", "space-mono/files/space-mono-latin-700-normal.woff", 0.98, True),
]
SCRIBBLE = ["M8 72 C 18 40, 42 6, 57 28 C 68 46, 44 90, 33 76 C 25 62, 66 30, 97 25 C 124 21, 120 70, 101 85 C 86 96, 95 50, 141 39 C 178 31, 172 86, 151 93 C 135 98, 160 44, 205 29 C 241 19, 252 66, 229 85 C 214 97, 238 40, 293 20",
            "M188 106 C 222 101, 258 101, 289 91"]


def glyph(letter, rel, size):
    font = TTFont(FONTS / rel)
    upm = font["head"].unitsPerEm
    name = font.getBestCmap()[ord(letter)]
    gs = font.getGlyphSet()
    k = size / upm
    return gs, name, k, gs[name].width * k


def map_path(d, fx, fy):
    nums = iter(re.findall(r"-?\d+(?:\.\d+)?", d)); out = []; i = 0
    def repl(m):
        nonlocal i
        v = float(m.group(0)); i += 1
        return f"{(fx(v) if i % 2 else fy(v)):.1f}"
    return re.sub(r"-?\d+(?:\.\d+)?", repl, d)


def build(size=512, word_width=0.84, scribble_w=0.98, scribble_h=0.62, stroke=0.05, background=WHITE, y_shift=0.0):
    F = 100.0                                   # lay out at a nominal em, then scale to the target width
    items = []; x = 0.0
    for letter, rel, k, outlined in FACES:
        gs, name, scale, adv = glyph(letter, rel, F * k)
        pad = 0.15 * F if letter == "i" else (-0.02 * F if letter == "f" else 0.0)
        x += pad
        items.append((letter, gs, name, scale, x, adv, outlined, k))
        x += adv + pad
    total = x
    S = size * word_width / total               # nominal → pixels
    left = (size - total * S) / 2
    base = size * (0.5 + y_shift) + 0.33 * F * S      # baseline: the x-height band sits on the middle of the square
    parts = [f'<rect width="{size}" height="{size}" fill="{background}"/>']

    # the cut-out patch behind the i
    for letter, gs, name, scale, gx, adv, outlined, k in items:
        if letter != "i": continue
        x0 = left + (gx - 0.10 * F) * S; x1 = left + (gx + adv + 0.10 * F) * S
        top = base - 0.80 * F * S; bot = base + 0.20 * F * S; w = x1 - x0; h = bot - top
        pts = [(x0 + 0.03 * w, top + 0.06 * h), (x0 + 0.97 * w, top), (x1, top + 0.95 * h), (x0, bot)]
        cx, cy = (x0 + x1) / 2, (top + bot) / 2
        parts.append(f'<polygon points="{" ".join(f"{px:.1f},{py:.1f}" for px, py in pts)}" fill="{DOT}" transform="rotate(-4 {cx:.1f} {cy:.1f})"/>')

    # the marker: mapped point by point, so its width stays even however the box is stretched
    sw, sh = size * scribble_w, size * scribble_h
    sx0, sy0 = (size - sw) / 2, size * (0.5 + y_shift) - sh * 0.52
    for d in SCRIBBLE:
        mapped = map_path(d, lambda v: sx0 + v / 300 * sw, lambda v: sy0 + v / 120 * sh)
        parts.append(f'<path d="{mapped}" fill="none" stroke="{NEON}" stroke-width="{size * stroke:.1f}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:multiply"/>')

    # the five letters, as outlines
    for letter, gs, name, scale, gx, adv, outlined, k in items:
        pen = SVGPathPen(gs)
        tpen = TransformPen(pen, (scale * S, 0, 0, -scale * S, left + gx * S, base))
        gs[name].draw(tpen)
        d = pen.getCommands()
        if outlined:
            parts.append(f'<path d="{d}" fill="{background}" fill-opacity="0" stroke="{INK}" stroke-width="{0.04 * F * S:.1f}" stroke-linejoin="round"/>')
        else:
            parts.append(f'<path d="{d}" fill="{INK}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">' + "".join(parts) + "</svg>"


def rasterise(svg_path, png_path, px):
    tmp = Path(tempfile.mkdtemp())
    try:
        subprocess.run(["qlmanage", "-t", "-s", str(px), "-o", str(tmp), str(svg_path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        produced = tmp / (svg_path.name + ".png")
        subprocess.run(["sips", "-z", str(px), str(px), str(produced), "--out", str(png_path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    regular = build(word_width=0.9, scribble_w=1.0, scribble_h=0.8, stroke=0.058)       # home screen, manifest "any": the marker fills the square
    maskable = build(word_width=0.66, scribble_w=0.98, scribble_h=0.72, stroke=0.05)    # everything that matters inside the safe circle
    small = build(word_width=0.96, scribble_w=1.04, scribble_h=0.9, stroke=0.085)       # browser tab: bigger letters, fatter marker
    (OUT / "icon.svg").write_text(regular); (OUT / "icon-maskable.svg").write_text(maskable); (APP / "public" / "favicon.svg").write_text(small)
    if shutil.which("qlmanage") and "--svg-only" not in sys.argv:
        rasterise(OUT / "icon.svg", OUT / "icon-512.png", 512); rasterise(OUT / "icon.svg", OUT / "icon-192.png", 192)
        rasterise(OUT / "icon.svg", OUT / "apple-touch-icon.png", 180); rasterise(OUT / "icon-maskable.svg", OUT / "icon-512-maskable.png", 512)
        rasterise(APP / "public" / "favicon.svg", APP / "public" / "favicon.png", 96)
    print("icons written to", OUT)
