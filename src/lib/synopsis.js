// Contraportada: texto y color. Puro (sin DOM salvo `dominantColor`, que es navegador).
// Métrica aproximada: ~40 caracteres por línea con la tipografía de la contraportada.
export const CHARS_PER_LINE = 40;

// Ajusta el texto al recuadro: normaliza espacios y devuelve líneas de ≤ CHARS_PER_LINE.
// Si el texto no cabe en `maxLines`, corta en límite de palabra y marca el corte con « … ».
// `null` si no hay texto.
export function wrapSynopsis(text, maxLines = 20, charsPerLine = CHARS_PER_LINE) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const lines = [];
  let cur = '';
  for (const w of t.split(' ')) {
    if ((cur + ' ' + w).trim().length > charsPerLine) {
      if (cur.trim()) lines.push(cur.trim());
      cur = w;
    } else {
      cur += ' ' + w;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines; // lo que no cabe se trunca…
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + ' …';
  }
  return lines;
}

// color promedio de una imagen (para que la contraportada «calse» con la portada).
// Fallback a `fallback` si no carga o no hay red.
export function dominantCoverColor(src, fallback) {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 12; c.height = 18;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, 12, 18);
        const d = cx.getImageData(0, 0, 12, 18).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        res({ r: r / n | 0, g: g / n | 0, b: b / n | 0 });
      } catch { res(fallback); }
    };
    img.onerror = () => res(fallback);
    img.src = src;
  });
}

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}