// shortcut: limits live in this single process; use shared storage before adding replicas.
export function rateLimit({ max, windowMs, maxKeys = 5000, now = () => Date.now() }) {
  const entries = new Map();
  return (key) => {
    const time = now();
    for (const [id, entry] of entries) {
      if (entry.until <= time) entries.delete(id);
      else break; // insertion order follows window expiry
    }
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maxKeys) return true;
      entry = { count: 0, until: time + windowMs };
      entries.set(key, entry);
    }
    if (entry.count >= max) return true;
    entry.count++;
    return false;
  };
}

const apiLimited = rateLimit({ max: 120, windowMs: 60_000 });
export function limitApi(req, res, next) {
  if (!apiLimited(req.ip || '?')) return next();
  res.setHeader('Retry-After', '60');
  return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
}
