import { useLayoutEffect, useRef, useState } from "react";

import { wavyRectPath } from "./wavy.js";

export default function WavyCard({ label, children, className = "" }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={`wavy-card ${className}`} ref={ref}>
      <svg className="wavy-frame" width={box.w} height={box.h} viewBox={`0 0 ${box.w || 1} ${box.h || 1}`} aria-hidden="true" focusable="false">
        <path d={wavyRectPath(box.w, box.h)} />
      </svg>
      {label ? <div className="wavy-label">{label}</div> : null}
      {children}
    </div>
  );
}
