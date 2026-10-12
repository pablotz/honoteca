// server/upload.js — subida de fotos. Multipart DIRECTO a disco (multer).
// Ni base64 en el wire, ni BLOB en la DB: la foto es un archivo y la DB guarda la ruta.
import multer from 'multer';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COVERS = join(root, 'covers');
export const TMP = join(COVERS, 'tmp');

mkdirSync(TMP, { recursive: true });

// multer: aterriza en covers/tmp; el endpoint de confirmación promueve a back/ o front/.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

export const uploadPhoto = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB por foto
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('solo imágenes (jpeg/png/webp/heic)'));
  },
}).single('photo');

// Purga de huérfanas: fotos en tmp/ sin confirmar con más de 24 h.
export function purgeTmp(maxAgeMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;
  for (const name of readdirSync(TMP)) {
    if (name === '.gitkeep') continue;
    const p = join(TMP, name);
    try {
      if (now - statSync(p).mtimeMs > maxAgeMs) { unlinkSync(p); removed++; }
    } catch { /* ignorar carreras */ }
  }
  return removed;
}
