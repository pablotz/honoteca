// server/api.js — rutas HTTP. Habla con la DB solo por las 4 funciones de db.js.
import { Router } from 'express';
import { renameSync, existsSync, mkdirSync, writeFileSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { add_book, get_book, list_books, update_book, update_title, count_generated, find_by_isbn, escalateNeedsReview, clearNeedsReview, remove_book } from './db.js';
import { uploadPhoto, COVERS } from './upload.js';
import { lookup_isbn, cover_by_title, search_by_title, gbDescription, esWikiIntro } from './meta.js';

const BACK = join(COVERS, 'back');
const FRONT = join(COVERS, 'front');
mkdirSync(BACK, { recursive: true });
mkdirSync(FRONT, { recursive: true });

// portada cacheada: con ?v=mtime para que un reemplazo cambie la URL y mate cachés viejas
const hitVer = (rel) => { try { return statSync(rel).mtimeMs; } catch { return 0; } };
const verPath = (rel) => (rel ? `${rel}?v=${hitVer(rel)}` : rel);

// Promueve una foto de covers/tmp → covers/<kind>/<id>.jpg y devuelve la ruta relativa
function promote(tmpFile, kind, id) {
  const final = join(COVERS, kind, `${id}.jpg`);
  renameSync(tmpFile, final);
  return `covers/${kind}/${id}.jpg`;
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
  res.json(list_books(filter));
});

api.get('/stats', (_req, res) => {
  res.json({ sin_portada: count_generated() }); // WHERE cover_shown='generated'
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
  const b = get_book(req.params.id);
  if (!b) return res.status(404).json({ error: 'no existe' });
  res.json(b);
});

api.post('/books', (req, res) => {
  try {
    const b = add_book(req.body || {});
    res.status(201).json(b);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

api.patch('/books/:id', (req, res) => {
  const b = update_book(req.params.id, req.body || {});
  if (!b) return res.status(404).json({ error: 'no existe' });
  res.json(b);
});

// Borrado: un renglón = un ejemplar. La portada (cover_front) es de la EDICIÓN: solo se
// borra su fichero si esta era la última copia del ISBN; la foto del lomo es per-ejemplar.
const rmFile = (rel) => {
  if (!rel || !rel.startsWith('covers/')) return; // hotlink (cover_url) → no es fichero local
  try {
    const p = join(COVERS, rel.split('?')[0].slice('covers/'.length));
    if (existsSync(p)) unlinkSync(p);
  } catch { /* ignorar */ }
};
api.delete('/books/:id', (req, res) => {
  const b = get_book(req.params.id);
  if (!b) return res.status(404).json({ error: 'no existe' });
  const lastCopy = !b.isbn || find_by_isbn(b.isbn).length <= 1;
  rmFile(b.scan_back);     // foto del código de este ejemplar
  if (lastCopy) rmFile(b.cover_front); // portada de la edición, solo si se va la última copia
  remove_book(b.id);
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
    existing: isbn ? find_by_isbn(isbn, body.section) : [],  // solo la sección activa (D elige con hueco)
    strip: {                                   // §5.2, ya calculado en canvas del navegador
      color: body.strip_color || null,
      present: body.strip_present === '1' || body.strip_present === 'true',
      mirrored: body.mirrored === '1' || body.mirrored === 'true',
    },
  });
});

// lookup read-only (estado D sin escribir): qué filas hay ya de este ISBN en esta sección
api.get('/lookup/:isbn', (req, res) => {
  res.json({ isbn: req.params.isbn, existing: find_by_isbn(req.params.isbn, req.query.section) });
});

// metadatos por ISBN: openbd → NDL → Open Library → Google Books.
// Siempre 200: devuelve hit (o null) + el reporte por fuente (hit/miss/skipped/error),
// para que «no lo tiene» y «no se pudo preguntar» no se lean igual.
api.get('/meta/:isbn', async (req, res) => {
  try {
    const { hit, isbn, report } = await lookup_isbn(req.params.isbn);
    // Portadas: openbd/OL traen hotlink estable; si no, EXACTO por ISBN primero (OL y
    // El Sótano), y la búsqueda por TÍTULO como última red (puede ser otra edición).
    if (hit) {
      if (!hit.cover_url) {
        hit.cover_front = await olCoverFallback(isbn) || await elSotanoCover(isbn);
        if (!hit.cover_front) {
          const url = await cover_by_title(hit.title_native, hit.authors?.[0]);
          hit.cover_front = url ? await cacheCover(isbn, url) : null;
        }
      }
      if (hit.cover_front) hit.cover_front = verPath(hit.cover_front);
      // sinopsis en el idioma de la edición (ES para ejemplares en español): Google primero
      // (cuota), Wikipedia en español como red. Deja la de OL solo si ambas fallan.
      if (hit.description || hit.title_native) {
        const gd = await gbDescription(isbn);
        const wi = await esWikiIntro(hit.title_native);
        if (gd) hit.description = gd;
        else if (wi) hit.description = wi;
      }
    }
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

// §4 — frontera de campos:
const TITLE_FIELDS = ['title_native', 'title_romaji', 'authors', 'pages', 'publisher',
  'cover_url', 'cover_front', 'strip_color', 'strip_present', 'mirrored', 'description'];
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
// scan_back es per-ejemplar: promueve la foto de tmp y devuelve la ruta (o null)
function attachBackPhoto(ticket, id) {
  if (!ticket) return null;
  const src = join(COVERS, 'tmp', ticket);
  if (!existsSync(src)) return null; // ticket expirado/purgado: degrada sin romper
  return promote(src, 'back', id);
}
// patch de TÍTULO → a TODOS los renglones del ISBN; sin ISBN (C manual) → solo esa fila
function applyTitle(isbn, id, patch) {
  if (!Object.keys(patch).length) return;
  if (isbn) update_title(isbn, patch);
  else if (id) update_book(id, patch);
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
      const cur = get_book(id);
      if (!cur) return res.status(404).json({ error: 'no existe' });
      const back = attachBackPhoto(ticket, id);
      if (back) perCopy.scan_back = back;            // scan_back per-ejemplar
      if (Object.keys(perCopy).length) update_book(id, perCopy);
      applyTitle(cur.isbn, id, titlePatch);
      return res.json(finalize(id, state));
    }

    // create → fila nueva (C sin match; D = otro ejemplar del mismo ISBN, su ordinal propio)
    const createFields = { ...title, ...perCopy };
    // Regla 5 §6.1: una copia repetida (D) nace SIN hueco — la dirección de la primera
    // no dice nada de la segunda. Colocarla es un arrastre después. En A la propuesta vale.
    if (state === 'D') createFields.location = null;
    const created = add_book(createFields);
    const back = attachBackPhoto(ticket, created.id);
    if (back) update_book(created.id, { scan_back: back });
    applyTitle(created.isbn, created.id, titlePatch);
    res.status(201).json(finalize(created.id, state));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// needs_review SOLO SUBE (§5.4). Escala si: el estado es C, el renglón queda sin título,
// o un HERMANO del mismo ISBN ya está marcado (la marca es title-level: un D create no
// puede nacer limpio al lado de un renglón marcado). Nunca escribe false desde acá.
function finalize(id, state) {
  const b = get_book(id);
  const noTitle = !b.title_native && !b.title_romaji;
  const siblingMarked = b.isbn ? find_by_isbn(b.isbn).some((r) => r.needs_review) : false;
  if (state === 'C' || noTitle || siblingMarked) escalateNeedsReview(b.isbn, id);
  return get_book(id);
}

// Bajada deliberada de needs_review («ya revisado»): el cliente pide la ACCIÓN, no el valor.
api.post('/books/:id/review', (req, res) => {
  const b = get_book(req.params.id);
  if (!b) return res.status(404).json({ error: 'no existe' });
  clearNeedsReview(b.isbn, b.id);
  res.json(get_book(req.params.id));
});

// cover_front: portada subida o pegada manualmente (la hoja «＋ portada» del tile).
// cover_front es de EDICIÓN → propaga a todos los renglones del ISBN (update_title).
api.post('/covers/front/:id', uploadPhoto, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta la foto' });
  try {
    const cur = get_book(req.params.id);
    if (!cur) return res.status(404).json({ error: 'no existe' });
    const rel = promote(req.file.path, 'front', req.params.id);
    applyTitle(cur.isbn, req.params.id, { cover_front: rel });
    res.json(get_book(req.params.id));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});
