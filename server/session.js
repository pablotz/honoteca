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

// sesión = "<expiraEnMs>.<hmac>". Sin estado: se valida con la firma, sin tocar la DB.
export function signSession(ttlMs) {
  const exp = Date.now() + ttlMs;
  return `${exp}.${sign(exp)}`;
}

export function verifySession(value) {
  if (!value) return false;
  const [exp, sig] = String(value).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = sign(exp);
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// token del enlace: aleatorio; en la DB se guarda solo su hash (nunca el token en claro).
export const newLoginToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
