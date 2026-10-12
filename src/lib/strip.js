// §5.2 lomo: franja borde largo IZQUIERDO, 14 % ancho, altura central 84 %,
// color por FILA MEDIANA, un bit de espejo, empate → sin banda. Se calcula en canvas
// porque la stdlib del server no decodifica JPEG y no queremos dep de imagen.
export async function computeStrip(file) {
  const none = { color: null, present: false, mirrored: false };
  try {
    const bmp = await createImageBitmap(file);
    const W = bmp.width, H = bmp.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const bandW = Math.max(1, Math.round(W * 0.14));
    const y0 = Math.round(H * 0.08), hh = Math.round(H * 0.84);
    function stats(x0) {
      const d = ctx.getImageData(x0, y0, bandW, hh).data;
      const rows = [];
      for (let y = 0; y < hh; y++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let x = 0; x < bandW; x++) { const i = (y * bandW + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r /= n; g /= n; b /= n;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        rows.push({ r, g, b, L, S: mx ? (mx - mn) / mx : 0 });
      }
      const meanL = rows.reduce((s, x) => s + x.L, 0) / rows.length;
      const meanS = rows.reduce((s, x) => s + x.S, 0) / rows.length;
      const sdL = Math.sqrt(rows.reduce((s, x) => s + (x.L - meanL) ** 2, 0) / rows.length);
      const med = [...rows].sort((a, b) => a.L - b.L)[Math.floor(rows.length / 2)];
      const hex = '#' + [med.r, med.g, med.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      return { meanL, meanS, sdL, hex };
    }
    const left = stats(0), right = stats(W - bandW);
    const isPaper = (s) => s.meanL > 150 && s.meanS < 0.22 && s.sdL < 40; // canto de páginas
    const lp = isPaper(left), rp = isPaper(right);
    if (!lp && rp) return { color: left.hex, present: true, mirrored: false };  // lomo a la izquierda
    if (lp && !rp) return { color: right.hex, present: true, mirrored: true };   // espejada → se voltea
    return none;                                                                // empate/dudosa → sin banda
  } catch { return none; }
}
