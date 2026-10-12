// --- decode ISBN en el navegador (zxing-wasm) ---
// Vite bundlea el wrapper desde npm y emite el .wasm (import ?url): self-host, sin CDN.
import { readBarcodesFromImageFile, setZXingModuleOverrides } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { validIsbn } from './book.js';

setZXingModuleOverrides({ locateFile: (p) => (p.endsWith('.wasm') ? wasmUrl : p) });

export async function decodeIsbn(file) {
  try {
    const res = await readBarcodesFromImageFile(file, {
      formats: ['EAN-13', 'EAN-8', 'UPC-A'], tryHarder: true, tryRotate: true,
    });
    for (const r of res || []) {
      const t = String(r.text || '').replace(/[^0-9Xx]/g, '').toUpperCase();
      if (validIsbn(t)) return t;
    }
  } catch { /* sin lectura → estado B */ }
  return null;
}
