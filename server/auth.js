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
import { createLoginToken, consumeLoginToken, purgeLoginTokens, claimUnownedBooks, reserveLoginEmail } from './db.js';
import { t } from '../src/lib/i18n.js';
import { rateLimit } from './rateLimit.js';
import { loginEmail } from './loginEmail.js';

const LINK_TTL = 15 * 60 * 1000;              // el enlace caduca en 15 min
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // la sesión dura 30 días
const COOKIE = 'honoteca_session';

export function allowedEmails() {
  const raw = [process.env.ALLOWED_EMAILS, process.env.OWNER_EMAIL].filter(Boolean).join(',');
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}
export const publicSignup = () => process.env.PUBLIC_SIGNUP === '1';
export const authOn = () => publicSignup() || allowedEmails().length > 0;
const validEmail = (email) => email.length <= 254 && /^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(email);
const emailAllowed = (email) => validEmail(email) && (publicSignup() || allowedEmails().includes(email));

export function authConfigError() {
  if (!authOn()) return 'Configure ALLOWED_EMAILS or PUBLIC_SIGNUP.';
  if ((process.env.AUTH_SECRET || '').length < 32) return 'AUTH_SECRET must contain at least 32 characters.';
  if (publicSignup()) {
    for (const name of ['RESEND_API_KEY', 'RESEND_FROM', 'APP_URL', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
      if (!process.env[name]) return `Public signup requires ${name}.`;
    }
    try {
      const url = new URL(process.env.APP_URL);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    } catch { return 'Public signup requires an HTTPS origin in APP_URL.'; }
  }
  return null;
}

async function botVerified(req) {
  if (!publicSignup()) return true;
  const token = req.body?.turnstileToken;
  if (!process.env.TURNSTILE_SECRET_KEY || !process.env.APP_URL || typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: req.ip }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    return response.ok && result.success === true && result.hostname === new URL(process.env.APP_URL).hostname;
  } catch { return false; }
}

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
      from, to: email, ...loginEmail(url, language),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`resend http ${r.status}`);
}

const cookieHeader = (value, secure, maxAgeSec) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;

// Devuelve '' en modo abierto (LAN/dev), el email si la sesión es válida y está en la whitelist, o null si no.
export function sessionUser(req) {
  if (!authOn()) return '';
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  let value = '';
  try { value = m ? decodeURIComponent(m[1]) : ''; } catch { return null; }
  const email = verifySession(value);
  return email && emailAllowed(email) ? email : null;
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
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authed: user !== null, user: user || null, required: authOn(), mail: Boolean(process.env.RESEND_API_KEY), turnstileSiteKey: publicSignup() ? process.env.TURNSTILE_SITE_KEY : null });
});

const ipLimited = rateLimit({ max: 5, windowMs: 15 * 60_000 });

// pedir enlace. Respuesta uniforme: nunca revela si el correo está en la whitelist.
auth.post('/auth/request', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const blocked = ipLimited(req.ip || '?');
  if (!blocked && emailAllowed(email)
      && await botVerified(req)
      && (process.env.RESEND_API_KEY || process.env.NODE_ENV !== 'production')) {
    try {
      if (!reserveLoginEmail(email)) return res.json({ ok: true });
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
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const token = String(req.query.token || '');
  const email = token ? consumeLoginToken(hashToken(token)) : false;
  if (typeof email !== 'string' || !emailAllowed(email)) {
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
