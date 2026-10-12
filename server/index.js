// server/index.js — arranque. Express sirve dist/ (build de Vite) + /api.
// Dev: `npm run dev` (Vite con HMR, proxy a este server). Prod: `npm run build` + `npm start`.
// Contrato Nihongo: bind 0.0.0.0:8848 → PC y celular comparten la biblioteca por la LAN.
import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { api } from './api.js';
import { auth, requireAuth, authOn } from './auth.js';
import { purgeTmp } from './upload.js';
import { _db_path } from './db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');

// .env opcional (Node ≥20.12): GOOGLE_BOOKS_API_KEY, PORT, HOST… No pisa lo ya exportado.
const envFile = join(root, '.env');
if (existsSync(envFile)) { try { process.loadEnvFile(envFile); } catch { /* .env inválido: seguir */ } }

const args = process.argv.slice(2);
const PORT = Number(process.env.PORT || (args.includes('--port') ? args[args.indexOf('--port') + 1] : 0) || 8849);
const HOST = process.env.HOST || '0.0.0.0';

// Guardarraíl de despliegue: en producción NO se arranca sin login configurado.
if (process.env.NODE_ENV === 'production' && !process.env.OWNER_EMAIL) {
  console.error('[honoteca] NODE_ENV=production sin OWNER_EMAIL: la app quedaría ABIERTA. Define OWNER_EMAIL (y AUTH_SECRET).');
  process.exit(1);
}

const app = express();

// Detrás de un reverse proxy (Caddy/nginx) hay que confiar en el primer salto para ver la IP
// real (rate limit) y el protocolo. Directo a internet, déjalo apagado.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));

// fotos servidas como archivos (nunca BLOB/base64 al leer).
// no-store: un cover cacheado en el navegador tras un cambio (placeholder→real) no se
// refresca con max-age=0 en todos los clientes; sin caché, lo que ves es lo que hay.
// nosniff: el navegador no debe adivinar el tipo (un archivo subido no se ejecuta).
app.use('/covers', requireAuth, express.static(join(root, 'covers'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));
app.use('/api', auth);              // /api/auth/* es público (pedir/abrir el enlace, logout)
app.use('/api', requireAuth, api);  // el resto del API queda detrás del login
app.use(express.static(DIST, {
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); },
})); // index.html + assets + vendor/ (lo que Vite copia de public/). El HTML, sin caché: siempre vivo.

purgeTmp(); // limpia fotos huérfanas >24h al arrancar

app.get('/health', (_req, res) => res.json({ ok: true, db: _db_path }));

if (!existsSync(DIST)) {
  console.warn('[biblioteca] falta dist/ — corre `npm run build`, o usa `npm run dev` (Vite) + `npm run dev:api`.');
}

app.listen(PORT, HOST, () => {
  console.log(`Honoteca — http://${HOST}:${PORT}`);
  console.log(`  db:     ${_db_path}`);
  console.log(`  static: ${DIST}`);
  console.log(`  auth:   ${authOn() ? `magic link (solo ${process.env.OWNER_EMAIL})` : 'ABIERTA — define OWNER_EMAIL para protegerla'}`);
  if (authOn() && !process.env.AUTH_SECRET) {
    console.warn('  aviso:  sin AUTH_SECRET las sesiones se firman con un secreto aleatorio y se pierden al reiniciar.');
  }
});
