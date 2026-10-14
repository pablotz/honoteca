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
  const byStmt = j.by_statement ? String(j.by_statement).replace(/^(by|por)\s+/i, '').replace(/[.]+$/, '').trim() : null;
  const olAuthors = (j.authors || []).map((a) => a.name).filter(Boolean);
  return {
    isbn,
    title_native: j.title,
    title_romaji: null,
    authors: olAuthors.length ? olAuthors : (byStmt ? [byStmt] : []),
    pages: j.number_of_pages || null,
    cover_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    series: null,
    publisher: cleanPub((j.publishers || [])[0]) || null,
    publishers: pickPublishers(j.publishers || []),
    description,
    source: 'openlibrary',
    confidence: 0.8,
  };
}

// Editoriales hispanas/comunes primero cuando Open Library mezcla 40 ediciones internacionales
const HISP_PUB = /planeta|debolsillo|alfaguara|anagrama|urano|diana|paid[oó]s|salamandra|tusquets|seix barral|fondo de cultura|fce|grijalbo|aguilar|alianza|c[aá]tedra|siruela|acantilado|impedimenta|sexto piso|era|porr[uú]a|joaqu[ií]n mortiz|oc[eé]ano|minotauro|ediciones b|roca|espasa|austral|punto de lectura|suma|taurus|debate|cr[ií]tica|ariel|lum[eé]n|almad[ií]a|p[aá]gina ind[oó]mita|herder|kair[oó]s|mirlo|selector|trillas|siglo xxi|gedisa|trotta|akal|sirio|obelisco|conecta|empresa activa|booket|editorial|ediciones|grupo editorial|m[eé]xico|espa[ñn]a/i;
const ENG_PUB = /\b(penguin|vintage|random house|harper(?:collins)?|simon & schuster|macmillan|farrar|st\.?\s*martin|hachette|bloomsbury|faber|oxford|cambridge|allen lane|hamish hamilton|sceptre|picador|panther|bantam|crown|scribner|viking|riverhead|little,\s*brown|mariner|norton|grove|routledge|wiley|o'reilly|no starch|pragmatic|manning|apress|packt|addison-wesley|mit press|princeton|yale|harvard|knopf|doubleday|tor|orbit|gollancz|hodder|transworld|chatto|jonathan cape|fourth estate|profile books|granta|atlantic books|canongate)\b/i;

const HISP_ISBN = /^(97884|978607|978950|978958|978968|978970|978987|978956|9789972|978612|9789974|978980|84)/;

const EN_WORDS = /\b(the|and|with|from|that|this|his|her|their|about|into|through|while|world|book|life|story|author|readers|years|written|between|after|before|where|which|would|could|should|have|has|had|been|were|they|them|what|when)\b/gi;
const ES_WORDS = /\b(que|los|las|del|una|para|con|por|como|más|pero|sus|esta|este|entre|sobre|vida|libro|historia|mundo|autor|obra|cuando|todo|también|hasta|donde|quien|desde|nos|uno|son|fue|era|hay|sin)\b/gi;

export function isEnglishText(text) {
  const s = String(text || '').replace(/<[^>]+>/g, ' ').trim();
  if (!s) return false;
  const en = (s.match(EN_WORDS) || []).length;
  const es = (s.match(ES_WORDS) || []).length + (s.match(/[áéíóúñ¿¡]/gi) || []).length;
  return en >= 3 && en > es * 1.3;
}

// Solo se permite sinopsis en inglés cuando la editorial es inglesa (y el ISBN no es hispano).
export function isEnglishPublisher(publisher, isbn) {
  const pub = String(publisher || '').trim();
  const clean = cleanIsbn(isbn);
  if (clean && HISP_ISBN.test(clean)) return false;
  if (pub && HISP_PUB.test(pub)) return false;
  if (pub && ENG_PUB.test(pub)) return true;
  return false;
}

function pickPublishers(rawList = []) {
  const seen = new Set();
  const clean = [];
  for (const p of rawList) {
    const s = String(p || '').replace(/\s+/g, ' ').replace(/[,.;:]+$/, '').trim();
    if (!s || s.length > 42 || /independently published|createspace/i.test(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(s);
  }
  clean.sort((a, b) => Number(HISP_PUB.test(b)) - Number(HISP_PUB.test(a)));
  return clean.slice(0, 6);
}

function cleanPub(p) {
  const s = String(p || '').replace(/\s+/g, ' ').replace(/[,.;:]+$/, '').trim();
  if (!s || s.length > 42 || /independently published|createspace/i.test(s)) return null;
  return s;
}

// Ediciones con portada real (cover_id > 0) de una obra de Open Library, priorizando ediciones en español.
export async function editionsForWork(workKey, fallbackCoverId = null, fallbackPub = null) {
  if (!workKey) return [];
  const list = [];
  const seenCovers = new Set();
  try {
    const r = await fetch(`https://openlibrary.org${workKey}/editions.json?limit=45`, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { accept: 'application/json' },
    });
    if (r.ok) {
      const entries = (await r.json()).entries || [];
      for (const e of entries) {
        const cid = Array.isArray(e.covers) ? e.covers.find((c) => Number(c) > 0) : null;
        if (!cid || seenCovers.has(cid)) continue;
        seenCovers.add(cid);
        const pub = cleanPub((e.publishers || [])[0]);
        const isbn = cleanIsbn((e.isbn_13 || [])[0] || (e.isbn_10 || [])[0] || '') || null;
        const isSpa = (e.languages || []).some((l) => /\/spa$/.test(l?.key || ''))
          || (isbn && HISP_ISBN.test(isbn))
          || (pub && HISP_PUB.test(pub));
        list.push({
          cover_url: `https://covers.openlibrary.org/b/id/${cid}-L.jpg`,
          publisher: pub,
          isbn,
          title: e.title || null,
          _score: (isSpa ? 2 : 0) + (pub ? 1 : 0),
        });
      }
    }
  } catch { /* sin ediciones extra */ }
  list.sort((a, b) => b._score - a._score);
  if (fallbackCoverId > 0 && !seenCovers.has(fallbackCoverId)) {
    list.unshift({
      cover_url: `https://covers.openlibrary.org/b/id/${fallbackCoverId}-L.jpg`,
      publisher: cleanPub(fallbackPub),
      isbn: null,
      title: null,
      _score: 0,
    });
  }
  return list.slice(0, 10).map(({ _score, ...rest }) => rest);
}

// Busca ediciones con portada para un libro (por ISBN o por título/autor) para el carrusel de portadas.
export async function search_editions({ isbn, title, author } = {}) {
  try {
    if (isbn) {
      const r = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(cleanIsbn(isbn))}.json`, {
        signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' },
      });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        const wk = j?.works?.[0]?.key;
        if (wk) {
          const eds = await editionsForWork(wk, j?.covers?.[0], j?.publishers?.[0]);
          if (eds.length) return eds;
        }
      }
    }
    if (title) {
      const q = [String(title).split(/[:/]/)[0].trim(), author].filter(Boolean).join(' ');
      const r = await fetch(`https://openlibrary.org/search.json?${new URLSearchParams({
        q, fields: 'key,cover_i,publisher', limit: '3',
      })}`, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
      if (r.ok) {
        const d = (await r.json()).docs?.find((x) => x.key);
        if (d) return await editionsForWork(d.key, d.cover_i, d.publisher?.[0]);
      }
    }
  } catch { /* degradar limpio */ }
  return [];
}

// Búsqueda por TÍTULO (cliente manda texto, sin ISBN): Open Library search → obra → sinopsis + carrusel de ediciones.
export async function search_by_title(q) {
  if (!q || q.trim().length < 2) return null;
  const r = await fetch(`https://openlibrary.org/search.json?${new URLSearchParams({
    q, fields: 'title,author_name,cover_i,key,number_of_pages_median,publisher', limit: '8',
  })}`, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
  if (!r.ok) return null;
  const docs = (await r.json()).docs || [];
  const d = docs.find((x) => x.key && x.title);
  if (!d) return null;
  const docPubs = pickPublishers(docs.slice(0, 4).flatMap((x) => x.publisher || []));
  const [description, editions] = await Promise.all([
    fetch(`https://openlibrary.org${d.key}.json`, { signal: AbortSignal.timeout(TIMEOUT) })
      .then((w) => (w.ok ? w.json() : null))
      .then((wj) => (typeof wj?.description === 'string' ? wj.description : (wj?.description?.value ?? null)))
      .catch(() => null),
    editionsForWork(d.key, d.cover_i, docPubs[0]),
  ]);
  const publishers = pickPublishers([...editions.map((e) => e.publisher), ...docPubs]);
  const primary = editions[0] || null;
  return {
    isbn: null,
    title_native: d.title,
    title_romaji: null,
    authors: d.author_name || [],
    pages: d.number_of_pages_median || null,
    cover_url: (primary && primary.cover_url) || (d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null),
    series: null,
    publisher: (primary && primary.publisher) || publishers[0] || null,
    publishers,
    editions,
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

function cleanSpanishTitle(raw) {
  let t = String(raw || '').split(/[:/]/)[0].trim();
  const inv = /^(.*),\s*(el|la|los|las|un|una)$/i.exec(t);
  if (inv) t = `${inv[2]} ${inv[1]}`.trim();
  return t;
}

const stripHtml = (s) => String(s || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim();

const normKey = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Sinopsis comercial en español desde Apple Books (MX/ES, sin key): contraportada real de la edición.
export async function esBookDescription(title, author) {
  const full = cleanSpanishTitle(title);
  if (full.length < 2) return null;
  const short = full.split(/\.\s+/)[0].trim();
  const candidates = short && short !== full ? [full, short] : [full];
  for (const base of candidates) {
    const want = normKey(base);
    const wantWords = want.split(' ').filter((w) => w.length > 2);
    for (const country of ['mx', 'es']) {
      try {
        const q = [base, author].filter(Boolean).join(' ');
        const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: q, country, media: 'ebook', limit: '6' })}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
        if (!r.ok) continue;
        const results = (await r.json()).results || [];
        for (const item of results) {
          if (/resumen|summary|an[aá]lisis|gu[ií]a de lectura|50minutos/i.test(`${item.trackName} ${item.artistName}`)) continue;
          const got = normKey(item.trackName || '');
          const matchTitle = got.includes(want) || want.includes(got)
            || (wantWords.length > 0 && wantWords.every((w) => got.includes(w)));
          if (!matchTitle) continue;
          const desc = stripHtml(item.description).slice(0, 3000);
          if (desc.length >= 40 && !isEnglishText(desc)) {
            return { description: desc, author: item.artistName || null };
          }
        }
      } catch { /* siguiente país */ }
    }
  }
  return null;
}

// Sinopsis en español (Wikipedia en español, sin key): primer párrafo de la obra como
// blurb. Última red cuando Google/Apple no tienen la edición.
const WIKI_NO_BOOK = /serie de televisi|pel[ií]cula|videojuego|canci[oó]n|sencillo|telefilme|es un [aá]lbum|\b[áa]lbum musical|anime|manga|programa de t|documental/i;
export async function esWikiIntro(title) {
  const t = cleanSpanishTitle(title);
  if (t.length < 3 || WIKI_NO_BOOK.test(t)) return null;
  const fetchExtract = async (pageTitle) => {
    const url = 'https://es.wikipedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', redirects: '1', prop: 'extracts', explaintext: '1', exintro: '1', format: 'json', titles: pageTitle,
    });
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'Honoteca/1.0' } });
    if (!r.ok) return null;
    const pages = Object.values((await r.json()).query?.pages || {});
    const p = pages.find((x) => !x.missing && x.extract && x.extract.length >= 40 && !WIKI_NO_BOOK.test(x.extract.slice(0, 110)));
    return p ? p.extract.replace(/\s+/g, ' ').trim().slice(0, 1400) : null;
  };
  try {
    const direct = await fetchExtract(t);
    if (direct && !isEnglishText(direct)) return direct;
    const sUrl = 'https://es.wikipedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', list: 'search', srsearch: `${t} libro`, srlimit: '3', format: 'json',
    });
    const sr = await fetch(sUrl, { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'Honoteca/1.0' } });
    if (!sr.ok) return null;
    const want = normKey(t);
    for (const hit of (await sr.json()).query?.search || []) {
      if (!normKey(hit.title).includes(want)) continue;
      const ext = await fetchExtract(hit.title);
      if (ext && !isEnglishText(ext)) return ext;
    }
  } catch { /* ignorar */ }
  return null;
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

// Regla de idioma: SOLO se permite sinopsis en inglés si la editorial es inglesa.
// En cualquier otro caso se busca en español (Google → Apple Books → Wikipedia ES) y se descarta inglés.
export async function resolveDescription(hit, isbn) {
  if (!hit) return null;
  const allowEn = isEnglishPublisher(hit.publisher, isbn || hit.isbn);
  const valid = (d) => Boolean(d && d.length >= 30 && (allowEn || !isEnglishText(d)));

  const gd = (isbn || hit.isbn) ? await gbDescription(isbn || hit.isbn) : null;
  if (valid(gd)) return gd;
  if (valid(hit.description)) return hit.description;

  if (!allowEn && hit.title_native) {
    const ab = await esBookDescription(hit.title_native, hit.authors?.[0]);
    if (ab) {
      if ((!hit.authors || !hit.authors.length) && ab.author) hit.authors = [ab.author];
      if (valid(ab.description)) return ab.description;
    }
    const wi = await esWikiIntro(hit.title_native);
    if (valid(wi)) return wi;
  }
  return null;
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
