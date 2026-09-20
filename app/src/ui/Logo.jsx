import { useEffect, useState } from "react";

// Efish is never set the same way for long. Five letters, seven faces: every few
// seconds one letter trades its face for one nobody is wearing, so the word is
// always five different hands at once. The "i" keeps its cut-out patch whatever it
// wears, and the marker scribble draws itself across the word, rests, and leaves.

const FACES = ["abril", "yellow", "courier", "fraktur", "outline", "playfair", "rubik"];
const LETTERS = ["E", "f", "i", "s", "h"];
const START = [0, 1, 2, 3, 4];

export default function Logo({ size = "sm", tone = "dark", onClick, lively = false, paused = false, label = "efish other — home" }) {
  const [faces, setFaces] = useState(START);

  useEffect(() => {
    // While the home drawing owns the letters, the logo waits in its first setting,
    // because that is the setting the flying letters arrive in.
    if (paused) { setFaces(START); return undefined; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let last = -1;
    const id = setInterval(() => {
      setFaces((cur) => {
        const spare = FACES.map((_, i) => i).filter((i) => !cur.includes(i));
        let at = Math.floor(Math.random() * LETTERS.length); if (at === last) at = (at + 1) % LETTERS.length; last = at;
        const next = cur.slice(); next[at] = spare[Math.floor(Math.random() * spare.length)];
        return next;
      });
    }, lively ? 3400 : 5200);
    return () => clearInterval(id);
  }, [lively, paused]);

  const Tag = onClick ? "button" : "span";
  return (
    <Tag type={onClick ? "button" : undefined} className={`logo logo--${size} logo--${tone} ${paused ? "is-paused" : ""}`} onClick={onClick} aria-label={onClick ? label : "Efish"}>
      <span className="logo-word" aria-hidden="true">
        {LETTERS.map((ch, i) => (
          <span key={`${i}-${faces[i]}`} className={`lt lf-${FACES[faces[i]]} ${ch === "i" ? "lt-i" : ""}`}>
            {ch === "i" ? <span className="lt-i-patch" /> : null}{ch}
          </span>
        ))}
        <svg className="logo-scribble" viewBox="0 0 300 120" preserveAspectRatio="none" focusable="false">
          <path pathLength="1" d="M8 72 C 18 40, 42 6, 57 28 C 68 46, 44 90, 33 76 C 25 62, 66 30, 97 25 C 124 21, 120 70, 101 85 C 86 96, 95 50, 141 39 C 178 31, 172 86, 151 93 C 135 98, 160 44, 205 29 C 241 19, 252 66, 229 85 C 214 97, 238 40, 293 20" />
          <path pathLength="1" className="late" d="M188 106 C 222 101, 258 101, 289 91" />
        </svg>
      </span>
    </Tag>
  );
}
