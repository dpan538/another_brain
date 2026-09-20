// Hand-drawn marks. Every underline, the close circle and the arrow are loose
// pen strokes rather than CSS rules, and the underlines rotate through a few
// different wobbles so no two neighbours are the same line.

const LINES = [
  "M1 4.8 C 12 2.4, 22 6.6, 35 4.2 S 60 2.6, 74 5.1 S 92 3.2, 99 4.4",
  "M1 3.4 C 18 6.6, 30 2.0, 48 4.9 S 80 5.8, 99 2.9",
  "M2 3.8 C 22 1.8, 52 6.2, 98 3.2 M95 5.9 C 70 7.2, 38 5.0, 9 6.6",
  "M1 5.2 C 9 3.0, 15 6.4, 27 4.0 C 41 1.6, 55 6.8, 70 4.4 C 82 2.6, 90 5.6, 99 3.6"
];

export function U({ children, v = 0, className = "", as: Tag = "span" }) {
  return (
    <Tag className={`hu ${className}`}>
      {children}
      <svg className="hu-line" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={LINES[v % LINES.length]} />
      </svg>
    </Tag>
  );
}

// An X inside a quick, imperfect circle that overshoots its own start.
export function CircleX({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path strokeWidth="1.5" d="M31 7.5 C 17 1.5, 4 11, 5.5 24 C 7 37, 22 43, 33.5 37.5 C 44 32, 43.5 15, 34 8.5 C 29.5 5.5, 23 4.6, 17.5 6.8" />
      <path strokeWidth="1.8" d="M15.5 15 C 19.5 19.6, 24.5 24.8, 29 30.2" />
      <path strokeWidth="1.8" d="M29.4 14.2 C 24.6 19.8, 19.6 25, 15 31" />
    </svg>
  );
}

export function ArrowRight({ size = 26 }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 28 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 9.4 C 8 8.2, 16 10.2, 25 8.6" />
      <path d="M18.5 3 C 21 5.6, 23.4 7.6, 25.6 8.7 C 22.6 10.6, 20.4 12.8, 18.8 15.4" />
    </svg>
  );
}
