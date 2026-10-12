// scripts/vendor.mjs — copia tesseract.js desde node_modules a public/vendor.
// (zxing-wasm y three van por Vite desde npm: zxing bundlea su .wasm con ?url, three se
// importa directo y su árbol se reduce solo con lo que usa la app.)
// Idempotente: si el destino ya tiene el fichero, no recopia. Sin CDN: todo self-host.
import { cp, mkdir, access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NM = join(root, 'node_modules');
const OUT = join(root, 'public', 'vendor');

const exists = async (p) => { try { await access(p, constants.F_OK); return true; } catch { return false; } };

// tesseract.js: main + worker desde node_modules; core simd-lstm (single-thread, sin
// COOP/COEP) desde tesseract.js-core; spa.traineddata.gz se baja UNA vez si falta.
async function vendorTesseract() {
  const dst = join(OUT, 'tesseract');
  await mkdir(dst, { recursive: true });
  const files = [
    join(NM, 'tesseract.js', 'dist', 'tesseract.min.js'),
    join(NM, 'tesseract.js', 'dist', 'worker.min.js'),
    join(NM, 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'),
    join(NM, 'tesseract.js-core', 'tesseract-core-simd-lstm.wasm'),
  ];
  if (!(await exists(files[0]))) { console.warn('[vendor] tesseract.js no instalado — salto'); return; }
  for (const src of files) {
    if (await exists(src)) await cp(src, join(dst, basename(src)));
  }
  const lang = join(dst, 'spa.traineddata.gz');
  if (!(await exists(lang))) {
    const url = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz';
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      await writeFile(lang, new Uint8Array(await r.arrayBuffer()));
      console.log('[vendor] tesseract lang spa → public/vendor/tesseract/spa.traineddata.gz');
    } catch (e) {
      console.warn(`[vendor] no se pudo bajar spa.traineddata.gz (${e.message}) — OCR sin español`);
    }
  }
  console.log('[vendor] tesseract.js → public/vendor/tesseract/');
}

await vendorTesseract();
console.log('[vendor] listo');
