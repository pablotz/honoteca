// server/upload.js — subida de fotos. Multipart DIRECTO a disco (multer).
// Ni base64 en el wire, ni BLOB en la DB: la foto es un archivo y la DB guarda la ruta.
import multer from 'multer';
import { mkdirSync, readdirSync, statSync, unlinkSync, statfsSync } from 'node:fs';
import { uploadPrefix } from './coverAccess.js';
import { rateLimit } from './rateLimit.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COVERS = process.env.DATA_DIR ? join(process.env.DATA_DIR, 'covers') : join(root, 'covers');
export const TMP = join(COVERS, 'tmp');

mkdirSync(TMP, { recursive: true });

// multer: aterriza en covers/tmp; el endpoint de confirmación promueve a back/ o front/.
// La extensión sale del TIPO de imagen, nunca del nombre que manda el cliente: así un
// archivo llamado «evil.html» no se guarda (ni se sirve) como HTML.
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' };
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP),
  filename: (req, file, cb) => cb(null, `${uploadPrefix(req.user)}-${crypto.randomUUID()}${EXT[file.mimetype] || '.jpg'}`),
});

const receivePhoto = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB por foto
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('solo imágenes (jpeg/png/webp/heic)'));
  },
}).single('photo');

const uploadsLimited = rateLimit({ max: 5, windowMs: 60_000 });
let activeUploads = 0;
export function uploadPhoto(req, res, next) {
  if (uploadsLimited(req.user || req.ip || '?') || activeUploads >= 2) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many uploads. Try again in a minute.' });
  }
  const disk = statfsSync(COVERS);
  if (disk.bavail * disk.bsize < 128 * 1024 * 1024) return res.status(507).json({ error: 'Photo storage is full.' });
  activeUploads++;
  receivePhoto(req, res, (err) => { activeUploads--; next(err); });
}

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
