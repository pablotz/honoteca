export async function api(p, opts) {
  const r = await fetch(p, opts);
  if (!r.ok) throw Object.assign(new Error(`${p} → ${r.status}`), { status: r.status });
  return r.json();
}

// --- metadatos: /api/meta devuelve hit|null + reporte por fuente ---
export async function lookupMeta(isbn) {
  try {
    const r = await fetch(`/api/meta/${isbn}`).then((x) => x.json());
    return { meta: r.hit || null, sources: r.sources || [] };
  } catch { return { meta: null, sources: [] }; }
}
