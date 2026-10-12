// Helpers puros de presentación/normalización (sin DOM). Portados 1:1 del cliente viejo.
// El crudo se guarda (procedencia); lo que se VE va normalizado (§5).

export const displayTitle = (b) =>
  b.title_native || b.title_romaji || `ISBN ${fmtIsbn(b.isbn)}`;

export function displayAuthor(b) {
  const a = b.authors && b.authors[0];
  return a ? normalizeAuthor(a) : '';
}

// openbd: "夏目,漱石,1867-1916" → "夏目漱石"  |  "Boswell,Dustin,1976-" → "Dustin Boswell"
export function normalizeAuthor(a) {
  const parts = String(a).split(',').map((s) => s.trim()).filter((s) => s && !/^\d{4}(-\d{0,4})?$/.test(s));
  if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0])) return `${parts.slice(1).join(' ')} ${parts[0]}`.trim();
  return parts.join('');
}

export function fmtIsbn(isbn) {
  const d = String(isbn || '').replace(/[^0-9Xx]/g, '');
  if (d.length !== 13) return d || '—';
  return `${d.slice(0, 3)}-${d.slice(3, 4)}-${d.slice(4, 7)}-${d.slice(7, 11)}-${d.slice(11)}`;
}

// dígito de control: EAN-13 (mod-10) e ISBN-10 (mod-11, X = 10). Un ISBN que no lo
// pasa es una captura/lectura corrupta — buscarlo es tirar la búsqueda.
export function validIsbn(t) {
  const d = String(t || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (d.length === 13) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += +d[i] * (i % 2 === 0 ? 1 : 3);
    return (10 - (s % 10)) % 10 === +d[12];
  }
  if (d.length === 10) {
    let s = 0;
    for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
    const c = (11 - (s % 11)) % 11;
    return c === 10 ? 'X' === d[9] : c === +d[9];
  }
  return false;
}

// Sinopsis HTML de la fuente → texto plano legible.
export function blurbText(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

export const locText = (l) => `${l.shelf} · fila ${l.row} · ${l.pos}.º`;
