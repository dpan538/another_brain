// OPPO Sans 4.0 is the product's global face, and it is a single 22.7 MB file
// (about 16 MB on the wire). Its licence forbids modification, so it cannot be
// subset; it is shipped byte-for-byte with its licence beside it.
//
// It therefore never blocks anything. The page renders in the platform face,
// the font is fetched once the page is idle, swaps in when it lands, and is kept
// by the service worker from then on. A device that already has OPPO Sans
// installed uses its own copy and downloads nothing.
const URL = `${import.meta.env.BASE_URL}fonts/oppo-sans/OPPOSans4.0.ttf`;

export function loadGlobalFont() {
  if (typeof FontFace === "undefined" || !document.fonts) return;
  if (navigator.connection?.saveData) return;                                   // respect Data Saver
  const start = async () => {
    try {
      if (await document.fonts.load('16px "OPPO Sans 4.0"').then((f) => f.length > 0).catch(() => false)) return;   // installed locally
      const face = new FontFace("OPPO Sans Web", `url("${URL}") format("truetype")`, { weight: "100 700", display: "swap" });
      await face.load();
      document.fonts.add(face);
      document.documentElement.dataset.font = "oppo";
    } catch { /* the platform face stays */ }
  };
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2500 }); else setTimeout(start, 1200);
}
