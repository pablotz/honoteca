// server/auth.js — acceso por MAGIC LINK (correo). Sin cuentas ni contraseñas: pides un enlace
// a tu propio correo (OWNER_EMAIL), lo abres y quedas con una cookie de sesión firmada.
//
// Interruptores (todo por env, sin tocar código):
//   OWNER_EMAIL     — el ÚNICO correo que puede entrar. Sin esta var, la app queda ABIERTA
//                     (cómodo en LAN/dev; en un host público DEBES ponerla).
//   AUTH_SECRET     — secreto para firmar sesiones (pon uno largo en producción).
//   RESEND_API_KEY  — para enviar el correo. Sin ella, el enlace se imprime en el log del
//                     server (así se prueba en local sin proveedor).
//   RESEND_FROM     — remitente (default: onboarding@resend.dev de Resend).
//   APP_URL         — base para el enlace (si no, se deduce del request / x-forwarded-proto).
import { Router } from 'express';
import { newLoginToken, hashToken, signSession, verifySession } from './session.js';
import { createLoginToken, consumeLoginToken, purgeLoginTokens } from './db.js';

const LINK_TTL = 15 * 60 * 1000;              // el enlace caduca en 15 min
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // la sesión dura 30 días
const COOKIE = 'honoteca_session';

export const authOn = () => Boolean(process.env.OWNER_EMAIL);
const owner = () => String(process.env.OWNER_EMAIL || '').trim().toLowerCase();

function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.headers.host}`;
}

async function sendLink(email, url) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { // dev: sin proveedor, el enlace sale por consola
    console.warn(`[honoteca] sin RESEND_API_KEY — enlace de acceso (15 min):\n  ${url}`);
    return;
  }
  const from = process.env.RESEND_FROM || 'Honoteca <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from, to: email, subject: 'Tu acceso a Honoteca',
      html: `<p>Entra a tu biblioteca:</p><p><a href="${url}">Abrir Honoteca</a></p>`
        + `<p style="color:#888">El enlace caduca en 15 minutos y solo sirve una vez.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`resend http ${r.status}`);
}

const cookieHeader = (value, secure, maxAgeSec) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;

export function isAuthed(req) {
  if (!authOn()) return true; // sin OWNER_EMAIL → abierto (LAN/dev)
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return verifySession(m ? decodeURIComponent(m[1]) : '');
}

// Guardarraíl para las rutas privadas (/api salvo /api/auth, y /covers)
export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'no autorizado' });
}

export const auth = Router();

// ¿ya entré? (y si el correo está configurado, para que la pantalla muestre el aviso correcto)
auth.get('/auth/me', (req, res) => res.json({ authed: isAuthed(req), required: authOn(), mail: Boolean(process.env.RESEND_API_KEY) }));

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

// pedir enlace. Respuesta uniforme: nunca revela si el correo coincide.
auth.post('/auth/request', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const to = owner();
  if (to && email === to && !rateLimited(req.ip || '?')) {
    try {
      purgeLoginTokens();
      const token = newLoginToken();
      createLoginToken(hashToken(token), Date.now() + LINK_TTL);
      await sendLink(to, `${baseUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`);
    } catch (e) { console.error('[honoteca] no se pudo enviar el enlace:', e.message); }
  }
  res.json({ ok: true });
});

// abrir el enlace → cookie de sesión
auth.get('/auth/verify', (req, res) => {
  const token = String(req.query.token || '');
  if (!token || !consumeLoginToken(hashToken(token))) {
    return res.status(400).send('Enlace inválido, ya usado o caducado. Pide uno nuevo.');
  }
  const secure = (req.headers['x-forwarded-proto'] || req.protocol) === 'https';
  res.setHeader('Set-Cookie', cookieHeader(signSession(SESSION_TTL), secure, SESSION_TTL / 1000));
  res.redirect('/');
});

auth.post('/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', cookieHeader('', false, 0));
  res.json({ ok: true });
});
