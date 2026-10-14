// server/session.js — firmas de sesión y tokens del magic link. PURO (sin express ni DB) para
// poder probarlo. El secreto sale de AUTH_SECRET; en dev cae a uno efímero (las sesiones se
// pierden al reiniciar, que está bien para local).
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Sin AUTH_SECRET se usa uno ALEATORIO de este proceso (no una constante conocida): no se
// puede falsificar una cookie. La contra: las sesiones se pierden al reiniciar. En un host
// público pon AUTH_SECRET para que duren.
const FALLBACK = randomBytes(32).toString('hex');
const secret = () => process.env.AUTH_SECRET || FALLBACK;
const sign = (exp) => createHmac('sha256', secret()).update(String(exp)).digest('base64url');

// sesión = "<emailBase64url>.<expiraEnMs>.<hmac>". Sin estado: se valida con la firma, sin tocar la DB.
export function signSession( ttlMs, email = 'owner') {
  // Soporta signSession(ttlMs) o signSession(email, ttlMs)
  if (typeof ttlMs === 'string') [email, ttlMs] = [ttlMs, email];
  const exp = Date.now() + ttlMs;
  const payload = `${Buffer.from(String(email).trim().toLowerCase()).toString('base64url')}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

// Devuelve el email (string) si la cookie es válida y vigente, o null si no.
export function verifySession(value) {
  if (!value) return null;
  const parts = String(value).split('.');
  if (parts.length !== 3) return null;
  const [b64, exp, sig] = parts;
  if (!b64 || !exp || !sig || Number(exp) < Date.now()) return null;
  const want = sign(`${b64}.${exp}`);
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(b64, 'base64url').toString('utf8') || null;
}

// token del enlace: aleatorio; en la DB se guarda solo su hash (nunca el token en claro).
export const newLoginToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
