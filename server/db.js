// server/db.js — capa de acceso a datos. Única cosa que toca SQLite.
// Interfaz sellada: add_book / get_book / list_books / update_book.
// Migrar a Postgres = reescribir SOLO este módulo.
//
// node:sqlite (DatabaseSync) — de fábrica en Node >=22.5, cero deps, sin binario nativo.
// WAL activado: escrituras concurrentes (PC + celular) sin reescritura total del fichero
// y sin corrupción si el proceso muere a media escritura.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = process.env.BIBLIOTECA_DB || join(root, 'state', 'library.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id            TEXT PRIMARY KEY,
    isbn          TEXT,              -- NO único: un mismo ISBN puede tener varios renglones (un renglón = un ejemplar)
    title_native  TEXT,
    title_romaji  TEXT,
    authors       TEXT,              -- JSON array
    pages         INTEGER,
    publisher     TEXT,              -- editorial (openbd/OL/Google la dan en el lookup)
    cover_url     TEXT,              -- portada hallada por lookup (openbd/OpenLibrary)
    cover_front   TEXT,              -- ruta relativa en covers/front/ (subida o manual)
    scan_back     TEXT,              -- ruta relativa en covers/back/ (foto del código+tira de lomo)
    strip_color   TEXT,              -- color de la tira de lomo (hex) — calculado en canvas del navegador
    strip_present INTEGER DEFAULT 0, -- 1 = la franja de lomo se pudo recortar
    mirrored      INTEGER DEFAULT 0, -- 1 = la foto venía espejada (bit de la §5.2)
    cover_shown   TEXT NOT NULL,     -- DERIVADO: front_scan | lookup | generated  (lo escribe SOLO resolveCover)
    location_shelf TEXT,             -- ordinal: 'A'
    location_row   INTEGER,          -- ordinal: 2
    location_pos   INTEGER,          -- ordinal: 6  (recalculado al guardar)
    source        TEXT,              -- openbd | openlibrary | manual
    confidence    REAL,
    needs_review  INTEGER DEFAULT 0,
    section       TEXT NOT NULL DEFAULT 'owned', -- owned | buy (estante de compras)
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_books_cover_shown ON books(cover_shown);
  CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
  CREATE INDEX IF NOT EXISTS idx_books_location ON books(location_shelf, location_row, location_pos);

  -- magic link: un renglón por enlace pendiente (se guarda el HASH, nunca el token en claro)
  CREATE TABLE IF NOT EXISTS login_tokens (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    used       INTEGER DEFAULT 0
  );
`);

// descripción: la captura las fuentes que la dan (googlebooks); para bibliotecas ya creadas
try { db.exec('ALTER TABLE books ADD COLUMN description TEXT'); } catch { /* ya existe */ }
// section (owned|buy): bibliotecas viejas quedan en 'owned'
try { db.exec("ALTER TABLE books ADD COLUMN section TEXT NOT NULL DEFAULT 'owned'"); } catch { /* ya existe */ }
try { db.exec('ALTER TABLE books ADD COLUMN publisher TEXT'); } catch { /* ya existe */ }

// ---- resolución de la cara mostrada -------------------------------------------------
// DERIVADO de (cover_front, cover_url). Guardarraíl: NUNCA lo escribe el cliente.
// Un solo lugar decide la cadena cover_front → cover_url → tile(generated).
function resolveCover(row) {
  if (row.cover_front) return 'front_scan';
  if (row.cover_url) return 'lookup';
  return 'generated';
}

function rowToBook(row) {
  if (!row) return null;
  const location = row.location_shelf
    ? { shelf: row.location_shelf, row: row.location_row, pos: row.location_pos }
    : null;
  return {
    id: row.id,
    isbn: row.isbn,
    copies: row.copies, // DERIVADO en lectura: COUNT(*) de renglones con este ISBN (no hay columna)
    title_native: row.title_native,
    title_romaji: row.title_romaji,
    authors: row.authors ? JSON.parse(row.authors) : [],
    pages: row.pages,
    cover_url: row.cover_url,
    cover_front: row.cover_front,
    scan_back: row.scan_back,
    strip_color: row.strip_color,
    strip_present: !!row.strip_present,
    mirrored: !!row.mirrored,
    cover_shown: row.cover_shown,
    location,
    source: row.source,
    confidence: row.confidence,
    description: row.description ?? null,
    publisher: row.publisher ?? null,
    needs_review: !!row.needs_review,
    section: row.section || 'owned',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ISBN canónico: solo dígitos (+ X final del ISBN-10), sin guiones/espacios/«ISBN: ».
// Único punto que lo normaliza — da igual que llegue con guiones de la cámara o del teclado.
export const cleanIsbn = (s) => String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
const FIELDS = [
  'id', 'isbn', 'title_native', 'title_romaji', 'authors', 'pages', 'publisher',
  'cover_url', 'cover_front', 'scan_back', 'strip_color', 'strip_present',
  'mirrored', 'location_shelf', 'location_row', 'location_pos',
  'source', 'confidence', 'description', 'section',
]; // needs_review NO está aquí: es de un solo escritor (escalate/clear), no de un patch genérico

function toColumns(book) {
  const cols = {};
  for (const f of FIELDS) {
    if (f === 'location_shelf' || f === 'location_row' || f === 'location_pos') continue;
    if (f in book) cols[f] = book[f];
  }
  if ('isbn' in cols) cols.isbn = cleanIsbn(cols.isbn) || null;
  if ('location' in book && book.location) {
    cols.location_shelf = book.location.shelf;
    cols.location_row = book.location.row;
    cols.location_pos = book.location.pos;
  } else if ('location' in book && book.location === null) {
    cols.location_shelf = null; cols.location_row = null; cols.location_pos = null;
  }
  // normalizaciones
  if ('authors' in cols && Array.isArray(cols.authors)) cols.authors = JSON.stringify(cols.authors);
  for (const b of ['strip_present', 'mirrored', 'needs_review']) {
    if (b in cols) cols[b] = cols[b] ? 1 : 0;
  }
  return cols;
}

// pos ordinal auto-propuesta: último pos de (shelf,row) + 1
function nextPos(shelf, row) {
  const r = db.prepare(
    'SELECT MAX(location_pos) AS m FROM books WHERE location_shelf=? AND location_row=?'
  ).get(shelf, row);
  return (r?.m ?? 0) + 1;
}

export function add_book(book) {
  const cols = toColumns(book);
  if (!cols.id) cols.id = crypto.randomUUID();
  // auto-posición ordinal si viene location sin pos
  if (cols.location_shelf != null && cols.location_row != null && cols.location_pos == null) {
    cols.location_pos = nextPos(cols.location_shelf, cols.location_row);
  }
  cols.cover_shown = resolveCover(cols); // DERIVADO — único escritor
  const names = Object.keys(cols);
  const sql = `INSERT INTO books (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`;
  db.prepare(sql).run(...names.map((n) => cols[n]));
  return get_book(cols.id);
}

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// lectura con `copies` DERIVADO (COUNT(*) de renglones con este ISBN) — no hay columna,
// así que un PATCH no puede desincronizarlo: no existe.
const SELECT_BOOK =
  'SELECT b.*, (SELECT COUNT(*) FROM books c WHERE c.isbn=b.isbn AND b.isbn IS NOT NULL) AS copies FROM books b';

function recomputeCoverShown(id) {
  const r = db.prepare('SELECT cover_front, cover_url FROM books WHERE id=?').get(id);
  if (r) db.prepare('UPDATE books SET cover_shown=? WHERE id=?').run(resolveCover(r), id);
}

export function get_book(id) {
  return rowToBook(db.prepare(`${SELECT_BOOK} WHERE b.id=?`).get(id));
}

export function list_books(filter = {}) {
  let sql = SELECT_BOOK;
  const where = [];
  const args = [];
  if (filter.cover_shown) { where.push('b.cover_shown=?'); args.push(filter.cover_shown); }
  if (filter.isbn) { where.push('b.isbn=?'); args.push(cleanIsbn(filter.isbn)); }
  if (filter.shelf) { where.push('b.location_shelf=?'); args.push(filter.shelf); }
  if (filter.section) { where.push('b.section=?'); args.push(filter.section); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY b.location_shelf, b.location_row, b.location_pos, b.created_at';
  return db.prepare(sql).all(...args).map(rowToBook);
}

export function update_book(id, patch) {
  const cols = toColumns(patch);
  // auto-posición si cambia la ubicación y no trae pos
  if (cols.location_shelf != null && cols.location_row != null && cols.location_pos == null) {
    cols.location_pos = nextPos(cols.location_shelf, cols.location_row);
  }
  // recalcula cover_shown desde el estado resultante (nunca desde el cliente)
  const current = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!current) return null;
  const merged = { cover_front: current.cover_front, cover_url: current.cover_url, ...cols };
  cols.cover_shown = resolveCover(merged);
  cols.updated_at = now();
  const names = Object.keys(cols);
  const sql = `UPDATE books SET ${names.map((n) => `${n}=?`).join(',')} WHERE id=?`;
  db.prepare(sql).run(...names.map((n) => cols[n]), id);
  return get_book(id);
}

// §4 — frontera de campos: lo que depende de la EDICIÓN (título, autores, páginas,
// portada, lomo, needs_review) se escribe sobre TODOS los renglones de ese ISBN. Si no,
// tus tres 雪国 podrían acabar con 610 y 612 páginas y el lomo saldría de dos anchos.
// Per-ejemplar (NO aquí): location, scan_back, source, confidence.
// Se EXPORTA: api.js usa la misma lista para partir los campos (una sola fuente de verdad).
export const TITLE_FIELDS = [
  'title_native', 'title_romaji', 'authors', 'pages', 'publisher',
  'cover_url', 'cover_front', 'strip_color', 'strip_present', 'mirrored', 'needs_review', 'description',
];
export function update_title(isbn, patch) {
  if (!isbn) throw new Error('update_title requiere isbn');
  isbn = cleanIsbn(isbn);
  const rows = db.prepare('SELECT id FROM books WHERE isbn=?').all(isbn);
  if (!rows.length) return [];
  const cols = {};
  for (const f of TITLE_FIELDS) if (f in patch) cols[f] = patch[f];
  if (Array.isArray(cols.authors)) cols.authors = JSON.stringify(cols.authors);
  for (const b of ['strip_present', 'mirrored', 'needs_review']) {
    if (b in cols) cols[b] = cols[b] ? 1 : 0;
  }
  const names = Object.keys(cols);
  if (names.length) {
    db.prepare(`UPDATE books SET ${names.map((n) => `${n}=?`).join(',')}, updated_at=? WHERE isbn=?`)
      .run(...names.map((n) => cols[n]), now(), isbn);
  }
  for (const { id } of rows) recomputeCoverShown(id); // derivado, por renglón
  return find_by_isbn(isbn);
}

// needs_review SOLO sube (§5.4): true si el estado es C O si el renglón queda sin título.
// La deuda es del RESULTADO, no de la intención. Nunca escribe false — por eso no está en
// FIELDS: un patch genérico (ni el cliente) puede borrar la marca por accidente.
export function escalateNeedsReview(isbn, id) {
  if (isbn) update_title(isbn, { needs_review: true });
  else if (id) db.prepare('UPDATE books SET needs_review=1, updated_at=? WHERE id=?').run(now(), id);
}

// Bajada deliberada («ya revisado»), title-level: el cliente pide la ACCIÓN, no el valor.
export function clearNeedsReview(isbn, id) {
  if (isbn) update_title(isbn, { needs_review: false });
  else if (id) db.prepare('UPDATE books SET needs_review=0, updated_at=? WHERE id=?').run(now(), id);
}

// Una transacción: o se aplican TODAS las escrituras, o ninguna. Para guardar un libro
// (renglón + foto + título propagado) que son varias llamadas seguidas.
export function tx(fn) {
  db.exec('BEGIN');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { try { db.exec('ROLLBACK'); } catch { /* ya abortada */ } throw e; }
}

// TODOS los renglones de un ISBN (estado D: 2, 3, N ejemplares del mismo título — cada
// renglón es un ejemplar físico con su propia location; el ×N se deriva de cuántos son).
// `section` opcional: en el estante de compras, un ejemplar que ya tienes NO debe contarse
// como "ya lo tienes" — las secciones son listas independientes.
export function find_by_isbn(isbn, section) {
  const args = [cleanIsbn(isbn)];
  let extra = '';
  if (section) { extra = ' AND b.section=?'; args.push(section); }
  return db.prepare(`${SELECT_BOOK} WHERE b.isbn=?${extra} ORDER BY b.created_at`).all(...args).map(rowToBook);
}

// Un renglón = un ejemplar físico. La limpieza de archivos (portada/foto) la decide api.js
// (depende de si era la última copia del ISBN, y ahí sí ve el contexto completo).
export function remove_book(id) {
  return db.prepare('DELETE FROM books WHERE id=?').run(id).changes > 0;
}

// --- magic link (login por correo) ----------------------------------------------------
export function createLoginToken(hash, expiresAt) {
  db.prepare('INSERT INTO login_tokens (token_hash, expires_at) VALUES (?,?)').run(hash, expiresAt);
}
// válido una sola vez y sin caducar; lo marca usado al consumirlo
export function consumeLoginToken(hash) {
  const r = db.prepare('SELECT expires_at, used FROM login_tokens WHERE token_hash=?').get(hash);
  if (!r || r.used || r.expires_at < Date.now()) return false;
  db.prepare('UPDATE login_tokens SET used=1 WHERE token_hash=?').run(hash);
  return true;
}
export function purgeLoginTokens() {
  db.prepare('DELETE FROM login_tokens WHERE expires_at < ?').run(Date.now());
}

export const _db_path = DB_PATH;
export default db;
