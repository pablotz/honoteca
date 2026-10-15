import { createHash } from 'node:crypto';
import { ownsCover } from './db.js';

export const uploadPrefix = (owner = '') => createHash('sha256').update(owner).digest('hex').slice(0, 24);

export function canAccessCover(path, owner) {
  if (typeof path !== 'string' || !/^covers\/(front|back|tmp)\/[A-Za-z0-9._-]+$/.test(path)) return false;
  if (!owner) return true; // local, unauthenticated mode
  // Catalog images are shared; personal uploads and scan photos are private.
  if (/^covers\/front\/(\d{9}[\dX]|\d{13})\.jpg$/.test(path)) return true;
  if (path.startsWith(`covers/tmp/${uploadPrefix(owner)}-`)) return true;
  return ownsCover(path, owner);
}

export function requireCoverAccess(req, res, next) {
  let path;
  try { path = `covers${decodeURIComponent(req.path)}`; } catch { return res.sendStatus(404); }
  if (!canAccessCover(path, req.user)) return res.sendStatus(404);
  next();
}
