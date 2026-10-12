// --- OCR de portada (tesseract.js self-host, spa): extrae el título para el estado C.
// Un solo worker cacheado; no bloquea — completa el campo cuando puede.
let _ocr = null;
async function ocrWorker() {
  if (!window.Tesseract) return null;
  if (!_ocr) _ocr = await window.Tesseract.createWorker('spa', 1, {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath: '/vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath: '/vendor/tesseract',
  });
  return _ocr;
}

export function pickTitleLine(ocr) {
  const text = String(ocr?.text || '');
  const lines = text.split('\n').map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 80 && !/^[\d\s.,º°-]+$/.test(l));
  if (!lines.length) return null;
  // Señal fuerte: el título suele ser el TEXTO MÁS GRANDE del bloque. Agrupamos por línea
  // OCR (bbox: altura de caja) y quedamos con la de mayor altura; empate → la más larga.
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const heights = new Map();
  for (const l of (ocr?.lines || [])) {
    const words = (l.words || []).map((w) => (w.bbox ? w.bbox.y1 - w.bbox.y0 : 0)).filter(Boolean);
    const h = words.length ? Math.max(...words) : 0;
    const k = norm(l.text);
    if (k && (!heights.has(k) || h > heights.get(k))) heights.set(k, h);
  }
  const maxH = heights.size ? Math.max(...heights.values()) : 0;
  const big = lines.filter((l) => heights.get(norm(l)) === maxH);
  const pool = big.length ? big : lines; // sin datos de bbox → fallback
  return [...pool].sort((a, b) => b.length - a.length)[0];
}

export async function ocrTitleFrom(file) {
  const t = await ocrWorker();
  if (!t) return null;
  return Promise.race([
    t.recognize(file).then(({ data }) => pickTitleLine(data)),
    new Promise((res) => setTimeout(() => res(null), 25000)),
  ]).catch(() => null);
}
