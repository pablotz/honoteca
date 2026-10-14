// server/api.js — rutas HTTP. Habla con la DB solo por las funciones de db.js.
import { Router } from 'express';
import { renameSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { add_book, get_book, list_books, update_book, update_title, find_by_isbn, escalateNeedsReview, clearNeedsReview, remove_book, coverStillUsed, tx, cleanIsbn, TITLE_FIELDS as DB_TITLE_FIELDS } from './db.js';
import { uploadPhoto, COVERS, TMP } from './upload.js';
import { lookup_isbn, cover_by_title, search_by_title, gbDescription, esWikiIntro } from './meta.js';

const BACK = join(COVERS, 'back');
const FRONT = join(COVERS, 'front');
mkdirSync(BACK, { recursive: true });
mkdirSync(FRONT, { recursive: true });

// Seguridad de rutas: nada que venga del cliente puede salir de covers/. `safeJoin` une y
// RECHAZA si el resultado se escapa de la base (anti path traversal).
const safeJoin = (base, name) => {
  const p = resolve(base, String(name));
  return p === base || p.startsWith(base + sep) ? p : null;
};
const safeName = (s) => (/^[A-Za-z0-9._-]+$/.test(String(s)) ? String(s) : null);

// Promueve una foto de covers/tmp → covers/<kind>/<id>.jpg y devuelve la ruta relativa
function promote(tmpFile, kind, id) {
  const name = safeName(id);
  if (!name) throw new Error('id inválido');
  const final = join(COVERS, kind, `${name}.jpg`);
  renameSync(tmpFile, final);
  return `covers/${kind}/${name}.jpg`;
}

// Portadas de Google llevan un token firmado de corta vida (imgtk=): guardadas tal cual
// en cover_url, expiran y la estantería «pierde la portada». Al hacer el lookup, se bajan
// UNA vez a covers/front/<isbn>.jpg y el tile usa la ruta local, sin hotlink que se pudra.
// Además se valida que sea una portada REAL: Google a veces sirve su placeholder
// «no image available», que no queremos tratar como tapa.
function coverDim(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i < buf.length - 9; i++) {
      if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc1 || buf[i + 1] === 0xc2))
        return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
  }
  return null;
}
const looksLikeCover = (buf) => { const d = coverDim(buf); return !!d && d[0] >= 200 && d[1] >= 280; };

async function cacheCover(isbn, url) {
  const dest = join(FRONT, `${isbn}.jpg`);
  if (existsSync(dest)) return `covers/front/${isbn}.jpg`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const buf = Buffer.from(await r.arrayBuffer());
    if (!looksLikeCover(buf)) return null; // placeholder → no vale como portada
    writeFileSync(dest, buf);
    return `covers/front/${isbn}.jpg`;
  } catch { return null; } // sin red/local → degrada a hotlink (cover_url), no rompe
}

// Última fuente de portada cuando el hit no trae ninguna: OL covers por ISBN. Si OL
// no la tiene devuelve un gif 1×1 (~43 B) → lo descartamos y el libro queda sin portada.
const OL_EMPTY_BYTES = 2000;
async function olCoverFallback(isbn) {
  const dest = join(FRONT, `${isbn}.jpg`);
  if (existsSync(dest)) return `covers/front/${isbn}.jpg`;
  try {
    const r = await fetch(`https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`, {
      headers: { accept: 'image/*' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < OL_EMPTY_BYTES) return null;
    writeFileSync(dest, buf);
    return `covers/front/${isbn}.jpg`;
  } catch { return null; }
}

// Librería mexicana: portada EXACTA del ISBN (mejor que búsqueda por título, que puede
// devolver la portada de otra edición del mismo título). ISBN no listado → HTML vacío,
// o una imagen por defecto (hash fijo) — ambas se descartan.
const SOTANO_DEFAULT_SHA = '51fe7d2494108044750c2138d214b8e9f0a9bc84f33c4d32eaa76d2912f136f8';
async function elSotanoCover(isbn) {
  const dest = join(FRONT, `${isbn}.jpg`);
  if (existsSync(dest)) return `covers/front/${isbn}.jpg`;
  try {
    const url = `https://www.elsotano.com/sotano_covers/${isbn.slice(0, 7)}/${isbn}.jpg`;
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 1000) return null;
    if (createHash('sha256').update(buf).digest('hex') === SOTANO_DEFAULT_SHA) return null;
    writeFileSync(dest, buf);
    return `covers/front/${isbn}.jpg`;
  } catch { return null; }
}

export const api = Router();

api.get('/books', (req, res) => {
  const filter = {};
  if (req.query.cover_shown) filter.cover_shown = req.query.cover_shown;
  if (req.query.isbn) filter.isbn = req.query.isbn;
  if (req.query.shelf) filter.shelf = req.query.shelf;
  if (req.query.section) filter.section = req.query.section;
  res.json(list_books(filter, req.user));
});

// buscar por TÍTULO (sin ISBN): texto → hit de Open Library (título, autor, portada, sinopsis)
api.get('/search', async (req, res) => {
  try {
    const hit = await search_by_title(req.query.q || '');
    // sinopsis en el idioma de la edición, igual que en /meta
    if (hit && (hit.description || hit.title_native)) {
      const gd = hit.isbn ? await gbDescription(hit.isbn) : null;
      const wi = await esWikiIntro(hit.title_native);
      if (gd) hit.description = gd;
      else if (wi) hit.description = wi;
    }
    res.json({ hit });
  } catch {
    res.json({ hit: null });
  }
});

api.get('/books/:id', (req, res) => {
  const b = get_book(req.params.id, req.user);
  if (!b) return res.status(404).json({ error: 'no existe' });
  res.json(b);
});

api.patch('/books/:id', (req, res) => {
  const b = update_book(req.params.id, req.body || {}, req.user);
  if (!b) return res.status(404).json({ error: 'no existe' });
  res.json(b);
});

// Borrado: un renglón = un ejemplar. La portada (cover_front) solo se borra del disco si
// ningún otro renglón (de este u otro usuario) sigue apuntando a ella; la foto del lomo es per-ejemplar.
// `rmFile` acepta solo rutas RELATIVAS dentro de covers/ (nunca sale de ahí).
const rmFile = (rel) => {
  if (!rel || !rel.startsWith('covers/')) return; // hotlink (cover_url) → no es fichero local
  const p = safeJoin(COVERS, rel.split('?')[0].slice('covers/'.length));
  try { if (p && existsSync(p)) unlinkSync(p); } catch { /* ignorar */ }
};
api.delete('/books/:id', (req, res) => {
  const b = get_book(req.params.id, req.user);
  if (!b) return res.status(404).json({ error: 'no existe' });
  remove_book(b.id, req.user);
  rmFile(b.scan_back);     // foto del código de este ejemplar
  if (!coverStillUsed(b.cover_front)) rmFile(b.cover_front);
  res.json({ ok: true });
});

// --- fotos (multipart directo a disco) ------------------------------------------------
// El scan NO escribe: aterriza la foto en covers/tmp y devuelve la lectura + las filas
// que YA existen para ese ISBN. Crear/actualizar ocurre SOLO en /confirm con acción
// explícita — así un escaneo repetido por error (la foto se movió, doble toque en el
// bucle del estante) no inventa un «ejemplar fantasma» (estado D: la primaria es el no-op).
api.post('/scan', uploadPhoto, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta la foto' });
  const body = req.body || {};
  const isbn = (body.isbn || '').trim() || null;
  res.json({
    ticket: req.file.filename,                 // foto pendiente en covers/tmp/<ticket>
    isbn,
    existing: isbn ? find_by_isbn(isbn, body.section, req.user) : [],  // solo la sección activa de este usuario
    strip: {                                   // §5.2, ya calculado en canvas del navegador
      color: body.strip_color || null,
      present: body.strip_present === '1' || body.strip_present === 'true',
      mirrored: body.mirrored === '1' || body.mirrored === 'true',
    },
  });
});

// lookup read-only (estado D sin escribir): qué filas hay ya de este ISBN en esta sección
api.get('/lookup/:isbn', (req, res) => {
  res.json({ isbn: req.params.isbn, existing: find_by_isbn(req.params.isbn, req.query.section, req.user) });
});

// Portada LOCAL si la fuente no trae hotlink: EXACTO por ISBN primero (OL y El Sótano),
// y la búsqueda por TÍTULO como última red (puede ser otra edición). Devuelve 'covers/front/…'
// o null. Sirve tanto para /meta como para el reintento de portada (POST /books/:id/cover).
async function coverForHit(hit, isbn) {
  if (!hit || !isbn || hit.cover_url) return null;
  const exact = (await olCoverFallback(isbn)) || (await elSotanoCover(isbn));
  if (exact) return exact;
  const url = await cover_by_title(hit.title_native, hit.authors?.[0]);
  return url ? await cacheCover(isbn, url) : null;
}

// Reintento de portada para un libro que quedó sin tapa: vuelve a consultar los catálogos
// AHORA (OL puede haber indexado la edición desde entonces) y, si aparece, actualiza TODAS
// las copias del ISBN (cover_front es de la edición → update_title).
api.post('/books/:id/cover', async (req, res) => {
  try {
    const b = get_book(req.params.id, req.user);
    if (!b) return res.status(404).json({ error: 'no existe' });
    if (!b.isbn) return res.status(400).json({ error: 'sin ISBN no hay portada que buscar' });
    const { hit } = await lookup_isbn(b.isbn);
    const cover = await coverForHit(hit, b.isbn);
    if (cover) update_title(b.isbn, { cover_front: cover }, req.user);
    else if (hit && hit.cover_url) update_title(b.isbn, { cover_url: hit.cover_url }, req.user);
    res.json({ ok: true, cover, book: get_book(b.id, req.user) });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// metadatos por ISBN: openbd → NDL → Open Library → Google Books.
// Siempre 200: devuelve hit (o null) + el reporte por fuente (hit/miss/skipped/error),
// para que «no lo tiene» y «no se pudo preguntar» no se lean igual.
// El resultado se CACHEA por ISBN (24 h): la cadena de fuentes es lenta y no cambia en el día.
const META_TTL = 24 * 60 * 60 * 1000;
const metaCache = new Map(); // isbn → { at, hit, report }
api.get('/meta/:isbn', async (req, res) => {
  const isbn = cleanIsbn(req.params.isbn);
  const cached = metaCache.get(isbn);
  if (cached && Date.now() - cached.at < META_TTL) {
    return res.json({ isbn, hit: cached.hit, sources: cached.report, cached: true });
  }
  try {
    const { hit, report } = await lookup_isbn(isbn);
    if (hit) {
      hit.cover_front = await coverForHit(hit, isbn);
      // sinopsis en el idioma de la edición (ES para ejemplares en español): Google primero
      // (cuota), Wikipedia en español como red. Deja la de OL solo si ambas fallan.
      if (hit.description || hit.title_native) {
        const gd = await gbDescription(isbn);
        const wi = await esWikiIntro(hit.title_native);
        if (gd) hit.description = gd;
        else if (wi) hit.description = wi;
      }
    }
    if (metaCache.size > 500) metaCache.clear(); // techo de memoria
    metaCache.set(isbn, { at: Date.now(), hit: hit || null, report });
    res.json({ isbn, hit: hit || null, sources: report });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e), isbn: req.params.isbn });
  }
});

// --- confirmación: ÚNICO punto que escribe desde el flujo de escaneo ------------------
// state ∈ A|B|C|D decide la semántica y, con ella, needs_review.
// Dos acciones (§1): `update` (A/C/D sobre un renglón existente; en D la primaria es
// no-op) y `create` (C sin match y D = otro ejemplar comparten camino). Un renglón =
// un ejemplar físico, con su propia location. needs_review lo DERIVA el server del
// `state`; si el cliente lo manda a mano, se ignora (single-writer).
const CONFIRM_ACTIONS = new Set(['update', 'create']);

// §4 — frontera de campos: la lista de campos de EDICIÓN vive en db.js (una sola fuente).
// Aquí solo se excluye needs_review: es de un solo escritor (el cliente pide ACCIONES, no
// valores). Per-ejemplar: isbn, location, source, confidence, section.
const TITLE_FIELDS = DB_TITLE_FIELDS.filter((f) => f !== 'needs_review');
const COPY_FIELDS = ['isbn', 'location', 'source', 'confidence', 'section'];
function splitFields(book = {}) {
  const title = {}, perCopy = {};
  for (const f of TITLE_FIELDS) if (f in book) title[f] = book[f];
  for (const f of COPY_FIELDS) if (f in book) perCopy[f] = book[f];
  return { title, perCopy };
}
// strip (§5.2) es de EDICIÓN (el lomo de la obra) → viaja con los campos de título
function stripFields(strip) {
  const out = {};
  if (!strip) return out;
  if (strip.color) out.strip_color = strip.color;
  if (strip.present != null) out.strip_present = !!strip.present;
  if (strip.mirrored != null) out.mirrored = !!strip.mirrored;
  return out;
}
// scan_back es per-ejemplar: promueve la foto de tmp y devuelve la ruta (o null).
// El `ticket` viene del cliente → solo se acepta un nombre simple dentro de covers/tmp.
function attachBackPhoto(ticket, id) {
  const name = ticket && safeName(ticket);
  if (!name) return null;
  const src = safeJoin(TMP, name);
  if (!src || !existsSync(src)) return null; // ticket expirado/purgado: degrada sin romper
  return promote(src, 'back', id);
}
// patch de TÍTULO → a TODOS los renglones del ISBN de ese usuario; sin ISBN (C manual) → solo esa fila
function applyTitle(isbn, id, patch, owner) {
  if (!Object.keys(patch).length) return;
  if (isbn) update_title(isbn, patch, owner);
  else if (id) update_book(id, patch, owner);
}

api.post('/confirm', (req, res) => {
  const { ticket, state, action, id, book = {}, strip = null } = req.body || {};
  if (!CONFIRM_ACTIONS.has(action)) return res.status(400).json({ error: 'acción inválida' });
  if (!['A', 'B', 'C', 'D'].includes(state)) return res.status(400).json({ error: 'state inválido' });
  try {
    const { title, perCopy } = splitFields(book);
    // needs_review NO va acá: solo sube (ver finalize). Un patch de título nunca la borra.
    const titlePatch = { ...title, ...stripFields(strip) };

    if (action === 'update') {
      if (!id) return res.status(400).json({ error: 'update requiere id' });
      const cur = get_book(id, req.user);
      if (!cur) return res.status(404).json({ error: 'no existe' });
      const back = attachBackPhoto(ticket, id);
      if (back) perCopy.scan_back = back;            // scan_back per-ejemplar
      if (Object.keys(perCopy).length) update_book(id, perCopy, req.user);
      applyTitle(cur.isbn, id, titlePatch, req.user);
      return res.json(finalize(id, state, req.user));
    }

    // create → fila nueva (C sin match; D = otro ejemplar del mismo ISBN, su ordinal propio)
    const createFields = { ...title, ...perCopy };
    // Regla 5 §6.1: una copia repetida (D) nace SIN hueco — la dirección de la primera
    // no dice nada de la segunda. Colocarla es un arrastre después. En A la propuesta vale.
    if (state === 'D') createFields.location = null;
    // una transacción: o queda el renglón con su foto y su título, o no queda nada
    const created = tx(() => {
      const c = add_book(createFields, req.user);
      const back = attachBackPhoto(ticket, c.id);
      if (back) update_book(c.id, { scan_back: back }, req.user);
      applyTitle(c.isbn, c.id, titlePatch, req.user);
      return c;
    });
    res.status(201).json(finalize(created.id, state, req.user));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// needs_review SOLO SUBE (§5.4). Escala si: el estado es C, el renglón queda sin título,
// o un HERMANO del mismo ISBN ya está marcado (la marca es title-level: un D create no
// puede nacer limpio al lado de un renglón marcado). Nunca escribe false desde acá.
function finalize(id, state, owner) {
  const b = get_book(id, owner);
  const noTitle = !b.title_native && !b.title_romaji;
  const siblingMarked = b.isbn ? find_by_isbn(b.isbn, undefined, owner).some((r) => r.needs_review) : false;
  if (state === 'C' || noTitle || siblingMarked) escalateNeedsReview(b.isbn, id, owner);
  return get_book(id, owner);
}

// Bajada deliberada de needs_review («ya revisado»): el cliente pide la ACCIÓN, no el valor.
api.post('/books/:id/review', (req, res) => {
  const b = get_book(req.params.id, req.user);
  if (!b) return res.status(404).json({ error: 'no existe' });
  clearNeedsReview(b.isbn, b.id, req.user);
  res.json(get_book(req.params.id, req.user));
});

// cover_front: portada subida o pegada manualmente (la hoja «＋ portada» del tile).
// cover_front es de EDICIÓN → propaga a todos los renglones del ISBN de este usuario (update_title).
api.post('/covers/front/:id', uploadPhoto, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta la foto' });
  try {
    const cur = get_book(req.params.id, req.user);
    if (!cur) return res.status(404).json({ error: 'no existe' });
    const rel = promote(req.file.path, 'front', req.params.id);
    applyTitle(cur.isbn, req.params.id, { cover_front: rel }, req.user);
    res.json(get_book(req.params.id, req.user));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});
