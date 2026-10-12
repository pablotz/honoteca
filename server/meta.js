// server/meta.js — lookup de metadatos por ISBN. Cadena: openbd → Open Library → (null).
// Server-side a propósito: evita CORS en el navegador y deja el orden de fuentes en un
// solo lugar. Node 18+ trae fetch; el matching nunca bloquea: si no hay match → null (estado C).
const TIMEOUT = 8000;

function cleanIsbn(isbn) {
  return String(isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

function pagesFromOnix(onix) {
  const ext = onix?.DescriptiveDetail?.Extent;
  if (Array.isArray(ext)) {
    const p = ext.find((e) => e.ExtentType === '00' || e.ExtentType === '08');
    return p ? Number(p.ExtentValue) || null : null;
  }
  return null;
}

async function fromOpenbd(isbn) {
  const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`, {
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!r.ok) return null;
  const arr = await r.json();
  const o = Array.isArray(arr) ? arr[0] : null;
  if (!o || !o.summary || !o.summary.title) return null;
  const s = o.summary;
  return {
    isbn,
    title_native: s.title || null,
    title_romaji: null, // openbd no da romaji; el collationkey es kana, no romaji
    authors: s.author ? [s.author] : [],
    pages: pagesFromOnix(o.onix),
    cover_url: s.cover || null,
    series: s.series || null,
    publisher: s.publisher || null,
    source: 'openbd',
    confidence: 0.95,
  };
}

async function fromOpenLibrary(isbn) {
  const r = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { accept: 'application/json' },
  });
  if (!r.ok) return null;
  let j;
  try { j = await r.json(); } catch { return null; } // isbn ausente → devuelve HTML, no JSON
  if (!j || !j.title) return null;
  const coverId = Array.isArray(j.covers) ? j.covers[0] : null;
  const worksKey = (Array.isArray(j.works) && j.works[0]?.key) || j.key || null;
  let description = null;
  if (worksKey) {
    try {
      const w = await fetch(`https://openlibrary.org${worksKey}.json`, { signal: AbortSignal.timeout(TIMEOUT) });
      if (w.ok) {
        const wj = await w.json();
        description = typeof wj.description === 'string' ? wj.description : (wj.description?.value ?? null);
      }
    } catch { /* sinopsis opcional */ }
  }
  return {
    isbn,
    title_native: j.title,
    title_romaji: null,
    authors: (j.authors || []).map((a) => a.name).filter(Boolean),
    pages: j.number_of_pages || null,
    cover_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    series: null,
    publisher: (j.publishers || [])[0] || null,
    description,
    source: 'openlibrary',
    confidence: 0.8,
  };
}

// Búsqueda por TÍTULO (cliente manda texto, sin ISBN): Open Library search → obra → sinopsis.
export async function search_by_title(q) {
  if (!q || q.trim().length < 2) return null;
  const r = await fetch(`https://openlibrary.org/search.json?${new URLSearchParams({
    q, fields: 'title,author_name,cover_i,key,number_of_pages_median', limit: '5',
  })}`, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
  if (!r.ok) return null;
  const d = (await r.json()).docs?.find((x) => x.key && x.title);
  if (!d) return null;
  let description = null;
  try {
    const w = await fetch(`https://openlibrary.org${d.key}.json`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (w.ok) {
      const wj = await w.json();
      description = typeof wj.description === 'string' ? wj.description : (wj.description?.value ?? null);
    }
  } catch { /* sinopsis opcional */ }
  return {
    isbn: null,
    title_native: d.title,
    title_romaji: null,
    authors: d.author_name || [],
    pages: d.number_of_pages_median || null,
    cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    series: null,
    publisher: null,
    description,
    source: 'openlibrary',
    confidence: 0.6,
  };
}

async function fromNdl(isbn) {
  // Biblioteca Nacional de Japón (NDL) SRU — cobertura JP muy superior a Open Library, sin key.
  const url = 'https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&version=1.2'
    + `&query=isbn%3D${encodeURIComponent(isbn)}&recordSchema=dcndl&maximumRecords=1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) return null;
  const xml = await r.text();
  if (/Record does not exist/.test(xml)) return null;
  const un = xml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const t = un.match(/<dcterms:title>([^<]+)<\/dcterms:title>/);
  if (!t) return null;
  const c = un.match(/<dc:creator>([^<]+)<\/dc:creator>/);
  return {
    isbn,
    title_native: t[1].trim(),
    title_romaji: null,
    authors: c ? [c[1].replace(/[著編訳\s]+$/, '').trim()] : [],
    pages: null,
    cover_url: null,
    series: null,
    publisher: null,
    source: 'ndl',
    confidence: 0.85,
  };
}

// El search `q=isbn:` de Google lleva años roto (devuelve 0 hasta para ISBN que existen).
// Bypass: el endpoint no-oficial viewapi resuelve el ISBN → volume_id (keyless), y con ese
// id el GET /volumes/{id} (el que sí funciona) da los metadatos. Verificado con 978-607.
async function gbVolumeId(isbn) {
  try {
    const r = await fetch(`https://books.google.com/books?jscmd=viewapi&bibkeys=${encodeURIComponent(`ISBN:${isbn}`)}`, {
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return null;
    const id = (await r.text()).match(/id=([A-Za-z0-9_-]{8,})/)?.[1];
    return id || null;
  } catch { return null; }
}

async function gbFetch(id, isbn) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`
    + (key ? `?key=${encodeURIComponent(key)}` : '');
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
  if (!r.ok) {
    // un non-200 nunca es «no lo tiene»; si el key está y falla, el problema es la key/el proyecto
    throw Object.assign(new Error('googlebooks'), {
      skip: true,
      reason: r.status === 429 ? 'quota' : `http ${r.status}`,
    });
  }
  const v = (await r.json())?.volumeInfo;
  if (!v || !v.title) return null;
  // el bibkey entró por ISBN, pero no cuesta verificar que la obra lo declara
  const ids = (v.industryIdentifiers || []).map((x) => String(x.identifier || '').replace(/[^0-9Xx]/g, '').toUpperCase());
  if (!ids.includes(isbn)) return null;
  return v;
}

async function fromGoogleBooks(isbn) {
  const id = await gbVolumeId(isbn);
  if (!id) return null;
  const v = await gbFetch(id, isbn);
  if (!v) return null;
  // SIN portada: Google sirve su placeholder «no image available» por todas las vías
  // (cualquier zoom/thumb) y no se distingue de una portada real a nivel de bytes.
  // Las portadas salen de OL (título/ISBN): metadatos y descripción sí de Google.
  return {
    isbn,
    title_native: v.title + (v.subtitle ? ` : ${v.subtitle}` : ''),
    title_romaji: null,
    authors: v.authors || [],
    pages: v.pageCount || null,
    cover_url: null,
    series: null,
    publisher: v.publisher || null,
    description: v.description || null,
    source: 'googlebooks',
    confidence: 0.7,
  };
}

// Portada por TÍTULO (no por ISBN): el ISBN de una edición suele no estar indexado, pero el
// título sí aparece. SOLO Open Library (cover_i): Google sirve placeholder indistinguible.
export async function cover_by_title(title, author) {
  if (!title) return null;
  const candidates = [String(title).trim()];
  for (const sep of [' / ', ' : ', '. ']) {
    const cut = String(title).split(sep)[0].trim();
    if (cut && cut !== candidates[0] && cut !== candidates.at(-1)) candidates.push(cut);
  }
  for (const t of candidates) {
    try {
      const params = { title: t, fields: 'cover_i', limit: '5' };
      if (author) params.author = author;
      const r = await fetch(`https://openlibrary.org/search.json?${new URLSearchParams(params)}`, {
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (r.ok) {
        const c = (await r.json()).docs?.find((d) => d.cover_i);
        if (c) return `https://covers.openlibrary.org/b/id/${c.cover_i}-L.jpg`;
      }
    } catch { /* probar siguiente candidato */ }
  }
  return null;
}

// Sinopsis en español (Wikipedia en español, sin key): primer párrafo de la obra como
// blurb. Última red cuando Google no está disponible (cuota) o no tiene la edición.
const WIKI_NO_BOOK = /serie de televisi|pel[ií]cula|videojuego|canci[oó]n|sencillo|telefilme|es un [aá]lbum|\b[áa]lbum musical|anime|manga|programa de t|documental/i;
export async function esWikiIntro(title) {
  const t = String(title || '').split(/[:/]/)[0].trim();
  if (t.length < 3) return null;
  // La obra es un libro: rechaza artículos de series/películas/juegos que comparten nombre.
  if (WIKI_NO_BOOK.test(t)) return null;
  try {
    const url = 'https://es.wikipedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', prop: 'extracts', explaintext: '1', exintro: '1', format: 'json', titles: t,
    });
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'Honoteca/1.0' } });
    if (!r.ok) return null;
    const pages = Object.values((await r.json()).query.pages);
    const p = pages.find((x) => !x.missing && x.extract && x.extract.length >= 40 && !WIKI_NO_BOOK.test(x.extract.slice(0, 90)));
    if (!p) return null;
    return p.extract.replace(/\s+/g, ' ').trim().slice(0, 1400);
  } catch { return null; }
}

// Descripción en el idioma de la EDICIÓN vía Google Books (volumes/{id}). Las sinopsis de
// Open Library salen en el idioma de la obra (inglés normalmente); Google describe la
// edición del ISBN → español para ejemplares ES. Respetar la cuota del día: si el endpoint
// responde 429, gbFetch lanza y degradamos a null (mañana vuelve).
export async function gbDescription(isbn) {
  try {
    const id = await gbVolumeId(isbn);
    if (!id) return null;
    const v = await gbFetch(id, isbn);
    const d = v && v.description;
    if (!d || d.length < 30) return null;
    return d.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
  } catch { return null; }
}

const SOURCES = [
  ['openbd', fromOpenbd],
  ['NDL', fromNdl],
  ['Open Library', fromOpenLibrary],
  ['Google Books', fromGoogleBooks, 'GOOGLE_BOOKS_API_KEY'],
];

// Devuelve { hit|null, isbn, report[] }. `report` distingue «no lo tiene» (miss) de
// «no se pudo preguntar» (skipped) y de un error real, y adjunta el `envVar` que lo
// arregla — así la pantalla dice qué hacer, no solo qué falta.
export async function lookup_isbn(raw) {
  const isbn = cleanIsbn(raw);
  const report = [];
  if (isbn.length < 10) return { hit: null, isbn, report };
  // Una fuente que necesita key y no la tiene NO entra en la cadena: no se pregunta, no se
  // reporta. Un «skipped» solo vale cuando la app de verdad quería preguntar y no pudo; si no
  // hay key, ese «falta configurarlo» es ruido permanente en pantalla, no deuda del usuario.
  const active = SOURCES.filter(([, , envVar]) => !envVar || Boolean(process.env[envVar]));
  for (const [name, fn, envVar] of active) {
    try {
      const hit = await fn(isbn);
      if (hit) { report.push({ name, outcome: 'hit' }); return { hit, isbn, report }; }
      report.push({ name, outcome: 'miss' });
    } catch (e) {
      // El remedio se deriva del ESTADO en el momento del throw, no del simple nombre de la var:
      // con la key ya puesta, «add VAR to .env» le pide al usuario hacer lo que ya hizo.
      report.push({
        name,
        outcome: e?.skip ? 'skipped' : 'error',
        ...(envVar ? { envVar, envVarSet: Boolean(process.env[envVar]) } : {}),
        ...(e?.reason ? { reason: e.reason } : {}),
      });
    }
  }
  return { hit: null, isbn, report };
}
