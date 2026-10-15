// server/auth.js — acceso por MAGIC LINK (correo) con whitelist y biblioteca por usuario.
// Sin cuentas ni contraseñas: pides un enlace a tu correo (en ALLOWED_EMAILS / OWNER_EMAIL),
// lo abres y quedas con una cookie de sesión firmada que identifica tu estante.
//
// Interruptores (todo por env, sin tocar código):
//   ALLOWED_EMAILS  — lista de correos separados por coma (o OWNER_EMAIL para uno solo).
//                     Sin esta var, la app queda ABIERTA en modo local (owner='').
//   AUTH_SECRET     — secreto para firmar sesiones (pon uno largo en producción).
//   RESEND_API_KEY  — para enviar el correo. Sin ella, el enlace se imprime en el log del
//                     server (así se prueba en local sin proveedor).
//   RESEND_FROM     — remitente (default: onboarding@resend.dev de Resend).
//   APP_URL         — base para el enlace (si no, se deduce del request / x-forwarded-proto).
import { Router } from 'express';
import { newLoginToken, hashToken, signSession, verifySession } from './session.js';
import { createLoginToken, consumeLoginToken, purgeLoginTokens, claimUnownedBooks } from './db.js';
import { t } from '../src/lib/i18n.js';

const LINK_TTL = 15 * 60 * 1000;              // el enlace caduca en 15 min
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // la sesión dura 30 días
const COOKIE = 'honoteca_session';

export function allowedEmails() {
  const raw = [process.env.ALLOWED_EMAILS, process.env.OWNER_EMAIL].filter(Boolean).join(',');
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}
export const authOn = () => allowedEmails().length > 0;

function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.headers.host}`;
}

async function sendLink(email, url, language) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { // dev: sin proveedor, el enlace sale por consola
    console.warn(`[honoteca] sin RESEND_API_KEY — enlace de acceso para ${email} (15 min):\n  ${url}`);
    return;
  }
  const from = process.env.RESEND_FROM || 'Honoteca <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from, to: email, subject: t('Tu acceso a Honoteca', 'Your Honoteca login', language),
      html: `<p>${t('Entra a tu biblioteca:', 'Sign in to your library:', language)}</p><p><a href="${url}">${t('Abrir Honoteca', 'Open Honoteca', language)}</a></p>`
        + `<p style="color:#888">${t('El enlace caduca en 15 minutos y solo sirve una vez.', 'This link expires in 15 minutes and can only be used once.', language)}</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`resend http ${r.status}`);
}

const cookieHeader = (value, secure, maxAgeSec) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;

// Devuelve '' en modo abierto (LAN/dev), el email si la sesión es válida y está en la whitelist, o null si no.
export function sessionUser(req) {
  const list = allowedEmails();
  if (!list.length) return '';
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const email = verifySession(m ? decodeURIComponent(m[1]) : '');
  return email && list.includes(email) ? email : null;
}

export const isAuthed = (req) => sessionUser(req) !== null;

// Guardarraíl para las rutas privadas (/api salvo /api/auth, y /covers): fija req.user
export function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (user === null) return res.status(401).json({ error: 'no autorizado' });
  req.user = user;
  next();
}

export const auth = Router();

// ¿ya entré? (y si el correo está configurado, para que la pantalla muestre el aviso correcto)
auth.get('/auth/me', (req, res) => {
  const user = sessionUser(req);
  res.json({ authed: user !== null, user: user || null, required: authOn(), mail: Boolean(process.env.RESEND_API_KEY) });
});

// Límite por IP: pedir enlaces es gratis para quien lo pide y caro para ti (correo + cuota).
// Ventana simple en memoria: 5 intentos cada 15 min. Al pasarse se responde igual (uniforme).
const RL_WINDOW = 15 * 60 * 1000;
const RL_MAX = 5;
const hits = new Map(); // ip → [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // techo de memoria
  return list.length > RL_MAX;
}

// pedir enlace. Respuesta uniforme: nunca revela si el correo está en la whitelist.
auth.post('/auth/request', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const list = allowedEmails();
  if (email && list.includes(email) && !rateLimited(req.ip || '?')) {
    try {
      purgeLoginTokens();
      const token = newLoginToken();
      createLoginToken(hashToken(token), Date.now() + LINK_TTL, email);
      await sendLink(email, `${baseUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`, req.acceptsLanguages('en', 'es') || 'en');
    } catch (e) { console.error('[honoteca] no se pudo enviar el enlace:', e.message); }
  }
  res.json({ ok: true });
});

// abrir el enlace → cookie de sesión firmada con ese correo
auth.get('/auth/verify', (req, res) => {
  const token = String(req.query.token || '');
  const email = token ? consumeLoginToken(hashToken(token)) : false;
  if (typeof email !== 'string' || !allowedEmails().includes(email)) {
    return res.status(400).send(t('Enlace inválido, ya usado o caducado. Pide uno nuevo.', 'This link is invalid, already used, or expired. Request a new one.', req.acceptsLanguages('en', 'es') || 'en'));
  }
  if (allowedEmails()[0] === email) claimUnownedBooks(email);
  const secure = (req.headers['x-forwarded-proto'] || req.protocol) === 'https';
  res.setHeader('Set-Cookie', cookieHeader(signSession(email, SESSION_TTL), secure, SESSION_TTL / 1000));
  res.redirect('/');
});

auth.post('/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', cookieHeader('', false, 0));
  res.json({ ok: true });
});
