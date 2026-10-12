// scripts/vendor.mjs — copia three + zxing-wasm + tesseract.js desde node_modules a public/vendor.
// Idempotente: si el destino ya tiene el fichero, no recopia. Sin CDN: todo self-host.
import { cp, mkdir, access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NM = join(root, 'node_modules');
const OUT = join(root, 'public', 'vendor');

const exists = async (p) => { try { await access(p, constants.F_OK); return true; } catch { return false; } };

// three: el build ESM (no addons: solo core en v1) → public/vendor/three/
async function vendorThree() {
  const src = join(NM, 'three', 'build');
  if (!(await exists(src))) { console.warn('[vendor] three no instalado — salto'); return; }
  const dst = join(OUT, 'three');
  await mkdir(dst, { recursive: true });
  await cp(join(src, 'three.module.js'), join(dst, 'three.module.js'));
  console.log('[vendor] three → public/vendor/three/three.module.js');
}

// zxing-wasm: dist/es/*.js (wrapper) + dist/reader/zxing_reader.wasm (single-thread, sin COOP/COEP)
async function vendorZxing() {
  const pkg = join(NM, 'zxing-wasm');
  if (!(await exists(pkg))) { console.warn('[vendor] zxing-wasm no instalado — salto'); return; }
  const dst = join(OUT, 'zxing');
  const esDst = join(dst, 'es');
  const readerDst = join(dst, 'reader');
  await mkdir(esDst, { recursive: true });
  await mkdir(readerDst, { recursive: true });

  const esSrc = join(pkg, 'dist', 'es');
  const readerSrc = join(pkg, 'dist', 'reader');
  if (await exists(esSrc)) await cp(esSrc, esDst, { recursive: true });
  if (await exists(readerSrc)) await cp(readerSrc, readerDst, { recursive: true });
  console.log('[vendor] zxing-wasm → public/vendor/zxing/{es,reader}');
}

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

await vendorThree();
await vendorZxing();
await vendorTesseract();
console.log('[vendor] listo');
