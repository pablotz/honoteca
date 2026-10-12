// server/index.js — arranque. Express sirve public/ tal cual (sin build) + /api.
// Contrato Nihongo: bind 0.0.0.0:8848 → PC y celular comparten la biblioteca por la LAN.
import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { api } from './api.js';
import { purgeTmp } from './upload.js';
import { _db_path } from './db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// .env opcional (Node ≥20.12): GOOGLE_BOOKS_API_KEY, PORT, HOST… No pisa lo ya exportado.
const envFile = join(root, '.env');
if (existsSync(envFile)) { try { process.loadEnvFile(envFile); } catch { /* .env inválido: seguir */ } }

const args = process.argv.slice(2);
const portArg = args.find((a, i) => a === '--port' || args[i - 1] === '--port');
const PORT = Number(process.env.PORT || (args.includes('--port') ? args[args.indexOf('--port') + 1] : 0) || 8849);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(express.json({ limit: '2mb' }));

// fotos servidas como archivos (nunca BLOB/base64 al leer).
// no-store: un cover cacheado en el navegador tras un cambio (placeholder→real) no se
// refresca con max-age=0 en todos los clientes; sin caché, lo que ves es lo que hay.
app.use('/covers', express.static(join(root, 'covers'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));
app.use('/api', api);
app.use(express.static(join(root, 'public'), {
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); },
})); // index.html + app.js + vendor/ (el HTML, sin caché: siempre el CSS/HTML vivo)

purgeTmp(); // limpia fotos huérfanas >24h al arrancar

app.get('/health', (_req, res) => res.json({ ok: true, db: _db_path }));

app.listen(PORT, HOST, () => {
  console.log(`Biblioteca — http://${HOST}:${PORT}`);
  console.log(`  db:     ${_db_path}`);
  console.log(`  static: ${join(root, 'public')}`);
});
