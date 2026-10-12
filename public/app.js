// public/app.js — cliente de Biblioteca (sin build). Nada de blob en el navegador:
// la foto se sube multipart y el server la escribe; acá solo se la lee para el lomo §5.2.
import { readBarcodesFromImageFile, setZXingModuleOverrides } from '/vendor/zxing/es/reader/index.js';

// self-host del wasm (nada de CDN). El wrapper busca "zxing_reader.wasm" relativo a la página.
setZXingModuleOverrides({ locateFile: (p) => (p.endsWith('.wasm') ? '/vendor/zxing/reader/zxing_reader.wasm' : p) });

const $ = (s) => document.querySelector(s);

// View Transitions API: anima el cambio de vista (estantería ↔ ficha). Sin soporte → render directo.
const vtx = (fn) => { try { document.startViewTransition ? document.startViewTransition(fn) : fn(); } catch { fn(); } };
const api = async (p, opts) => {
  const r = await fetch(p, opts);
  if (!r.ok) throw Object.assign(new Error(`${p} → ${r.status}`), { status: r.status });
  return r.json();
};

// --- mostrar: el crudo se guarda (procedencia); lo que se ve va normalizado (§5) ---
const displayTitle = (b) => b.title_native || b.title_romaji || `ISBN ${fmtIsbn(b.isbn)}` || '—';
const displayAuthor = (b) => (b.authors && b.authors[0] ? normalizeAuthor(b.authors[0]) : '');
function normalizeAuthor(a) {
  // openbd: "夏目,漱石,1867-1916" → "夏目漱石"  |  "Boswell,Dustin,1976-" → "Dustin Boswell"
  const parts = String(a).split(',').map((s) => s.trim()).filter((s) => s && !/^\d{4}(-\d{0,4})?$/.test(s));
  if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0])) return `${parts.slice(1).join(' ')} ${parts[0]}`.trim();
  return parts.join('');
}
function fmtIsbn(isbn) {
  const d = String(isbn || '').replace(/[^0-9Xx]/g, '');
  if (d.length !== 13) return d || '—';
  return `${d.slice(0, 3)}-${d.slice(3, 4)}-${d.slice(4, 7)}-${d.slice(7, 11)}-${d.slice(11)}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// --- metadatos: /api/meta devuelve hit|null + reporte por fuente ---
async function lookupMeta(isbn) {
  try {
    const r = await fetch(`/api/meta/${isbn}`).then((x) => x.json());
    session.meta = r.hit || null;
    session.sources = r.sources || [];
  } catch { session.meta = null; session.sources = []; }
}
// Reporte por fuente, ordenado por lo que se puede HACER: skipped/error primero (mustard,
// con su remedio en una línea muted), los miss después (gris). «no lo tiene» ≠ «no se pudo preguntar».
function sourcesBlock(sources = []) {
  const wrap = document.createElement('div'); wrap.className = 'srcs';
  const acted = sources.filter((s) => s.outcome === 'skipped' || s.outcome === 'error');
  const missed = sources.filter((s) => s.outcome === 'miss');
  for (const s of acted) {
    const l1 = document.createElement('div'); l1.className = 'src-fix';
    const what = s.outcome === 'error' ? 'error'
      : (s.envVarSet ? 'key present · still refused' : 'no access');
    l1.textContent = `${s.name} — ${what}`;
    wrap.appendChild(l1);
    const l2 = document.createElement('div'); l2.className = 'src-fixnote';
    // El remedio depende del ESTADO, no del nombre de la var: con la key ya puesta, «add VAR»
    // manda a hacer lo que ya se hizo.
    if (s.outcome === 'error') l2.textContent = 'transient · retry';
    else if (!s.envVarSet) l2.textContent = s.envVar ? `add ${s.envVar} to .env` : 'unavailable';
    else if (s.reason === 'quota') l2.textContent = 'quota reached · retry later';
    else if (s.reason === 'http 400') l2.textContent = `key not valid · re-check what you pasted${s.envVar ? ` into ${s.envVar}` : ''}`;
    else if (s.reason === 'http 403') l2.textContent = `key rejected · enable this API for the key${s.envVar ? ` (${s.envVar})` : ''}`;
    else l2.textContent = `key present but refused${s.reason ? ` · ${s.reason}` : ''}`;
    wrap.appendChild(l2);
  }
  if (missed.length) {
    const m = document.createElement('div'); m.className = 'src-miss';
    m.textContent = missed.map((s) => `${s.name} ✗`).join(' · ');
    wrap.appendChild(m);
  }
  return wrap;
}
// copiar sin context seguro (en http://LAN no hay navigator.clipboard) → textarea + execCommand
async function copyText(text) {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
function isbnChip(isbn) {
  const el = document.createElement('button');
  el.className = 'chip'; el.type = 'button'; el.textContent = fmtIsbn(isbn);
  el.title = 'tap to copy';
  el.onclick = async () => {
    const ok = await copyText(String(isbn || ''));
    el.textContent = ok ? 'copied ✓' : fmtIsbn(isbn);
    if (ok) setTimeout(() => (el.textContent = fmtIsbn(isbn)), 1300);
  };
  return el;
}

// --- §5.2 lomo: franja borde largo IZQUIERDO, 14 % ancho, altura central 84 %,
// color por FILA MEDIANA, un bit de espejo, empate → sin banda. Se calcula en canvas
// porque la stdlib del server no decodifica JPEG y no queremos dep de imagen. ---
async function computeStrip(file) {
  const none = { color: null, present: false, mirrored: false };
  try {
    const bmp = await createImageBitmap(file);
    const W = bmp.width, H = bmp.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const bandW = Math.max(1, Math.round(W * 0.14));
    const y0 = Math.round(H * 0.08), hh = Math.round(H * 0.84);
    function stats(x0) {
      const d = ctx.getImageData(x0, y0, bandW, hh).data;
      const rows = [];
      for (let y = 0; y < hh; y++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let x = 0; x < bandW; x++) { const i = (y * bandW + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r /= n; g /= n; b /= n;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        rows.push({ r, g, b, L, S: mx ? (mx - mn) / mx : 0 });
      }
      const meanL = rows.reduce((s, x) => s + x.L, 0) / rows.length;
      const meanS = rows.reduce((s, x) => s + x.S, 0) / rows.length;
      const sdL = Math.sqrt(rows.reduce((s, x) => s + (x.L - meanL) ** 2, 0) / rows.length);
      const med = [...rows].sort((a, b) => a.L - b.L)[Math.floor(rows.length / 2)];
      const hex = '#' + [med.r, med.g, med.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      return { meanL, meanS, sdL, hex };
    }
    const left = stats(0), right = stats(W - bandW);
    const isPaper = (s) => s.meanL > 150 && s.meanS < 0.22 && s.sdL < 40; // canto de páginas
    const lp = isPaper(left), rp = isPaper(right);
    if (!lp && rp) return { color: left.hex, present: true, mirrored: false };  // lomo a la izquierda
    if (lp && !rp) return { color: right.hex, present: true, mirrored: true };   // espejada → se voltea
    return none;                                                                // empate/dudosa → sin banda
  } catch { return none; }
}

// dígito de control: EAN-13 (mod-10) e ISBN-10 (mod-11, X = 10). Un ISBN que no lo
// pasa es una captura/lectura corrupta — buscarlo es tirar la búsqueda.
function validIsbn(t) {
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

// --- decode ISBN en el navegador (zxing-wasm) ---
async function decodeIsbn(file) {
  try {
    const res = await readBarcodesFromImageFile(file, {
      formats: ['EAN-13', 'EAN-8', 'UPC-A'], tryHarder: true, tryRotate: true,
    });
    for (const r of res || []) {
      const t = String(r.text || '').replace(/[^0-9Xx]/g, '').toUpperCase();
      if (validIsbn(t)) return t;
    }
  } catch { /* sin lectura → estado B */ }
  return null;
}

// --- OCR de portada (tesseract.js self-host, spa): extrae el título para el estado C.
// Un solo worker cacheado; no bloquea — completa el campo cuando puede.
let _ocr = null;
async function ocrWorker() {
  if (!window.Tesseract) return null;
  if (!_ocr) _ocr = await window.Tesseract.createWorker('spa', 1, {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath: '/vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath: '/vendor/tesseract',
  });
  return _ocr;
}
function bestTitleLine(ocr) {
  const text = String(ocr?.text || '');
  const lines = text.split('\n').map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 80 && !/^[\d\s.,º°-]+$/.test(l));
  if (!lines.length) return null;
  // Señal fuerte: el título suele ser el TEXTO MÁS GRANDE del bloque. Agrupamos por línea
  // OCR (bbox: altura de caja) y quedamos con la de mayor altura; empate → la más larga.
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const heights = new Map();
  for (const l of (ocr?.lines || [])) {
    const words = (l.words || []).map((w) => (w.bbox ? w.bbox.y1 - w.bbox.y0 : 0)).filter(Boolean);
    const h = words.length ? Math.max(...words) : 0;
    const k = norm(l.text);
    if (k && (!heights.has(k) || h > heights.get(k))) heights.set(k, h);
  }
  const maxH = heights.size ? Math.max(...heights.values()) : 0;
  const big = lines.filter((l) => heights.get(norm(l)) === maxH);
  const pool = big.length ? big : lines; // sin datos de bbox → fallback
  return [...pool].sort((a, b) => b.length - a.length)[0];
}
async function coverPicked(file) {
  if (!file) return;
  const held = $('#entry')?.value.trim();
  session.cover = file;
  session.coverUrl = URL.createObjectURL(file);
  session.entry = session.entry || held || null;
  renderConfirm('C');
  const line = await ocrTitleFrom(file);
  const e = $('#entry');
  if (e && line && !e.value.trim()) { e.value = line; session.entry = line; }
}
async function ocrTitleFrom(file) {
  const t = await ocrWorker();
  if (!t) return null;
  return Promise.race([
    t.recognize(file).then(({ data }) => bestTitleLine(data)),
    new Promise((res) => setTimeout(() => res(null), 25000)),
  ]).catch(() => null);
}
function pickCover() { const i = $('#cover'); i.value = ''; i.onchange = () => coverPicked(i.files[0]); i.click(); }

// Portada de un libro YA guardado: elegir una foto → recortarla (encuadre y zoom) → subir.
function addCoverTo(id) { const i = $('#cover'); i.value = ''; i.onchange = () => { const f = i.files[0]; if (f) openCoverCrop(id, f); }; i.click(); }

// Editor mínimo: encuadrar la foto en un recorte 2:3 (arrastrar para mover, slider para zoom).
// Sale un JPEG recortado; el original queda intacto. Dialog dinámico, sin deps.
function openCoverCrop(id, file) {
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      const mask = document.createElement('div'); mask.className = 'cropmask';
      mask.innerHTML = `<div class="croppanel">
        <div class="cropbox"></div>
        <div class="croptools"><span>Zoom</span>
          <input type="range" min="1" max="8" step="0.01" value="1"><span>Arrastra para encuadrar</span></div>
        <div class="cropbtns">
          <button type="button" class="btn" id="cropOK">Usar esta portada</button>
          <button type="button" class="btn ghost" id="cropX">Cancelar</button>
        </div></div>`;
      document.body.appendChild(mask);
      const box = mask.querySelector('.cropbox');
      const el = document.createElement('img'); el.src = rd.result; box.appendChild(el);
      const zoom = mask.querySelector('input[type=range]');
      const W = box.clientWidth, H = box.clientHeight;
      const nw = img.naturalWidth || W, nh = img.naturalHeight || H;
      const s0 = Math.max(W / nw, H / nh);   // el recorte siempre queda cubierto
      let z = 1, tx = (W - nw * s0) / 2, ty = (H - nh * s0) / 2, drag = null;
      const clamp = () => {
        const rw = nw * s0 * z, rh = nh * s0 * z;
        tx = Math.max(Math.min(0, W - rw), Math.min(tx, 0));
        ty = Math.max(Math.min(0, H - rh), Math.min(ty, 0));
        el.style.width = rw + 'px'; el.style.height = rh + 'px';
        el.style.transform = `translate(${tx}px,${ty}px)`;
      };
      // zoom mantiene el punto central del recorte fijo sobre la imagen
      zoom.oninput = () => {
        const cx = (W / 2 - tx) / (s0 * z), cy = (H / 2 - ty) / (s0 * z);
        z = Number(zoom.value);
        tx = W / 2 - cx * s0 * z; ty = H / 2 - cy * s0 * z;
        clamp();
      };
      box.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY };
        box.classList.add('pan'); box.setPointerCapture(e.pointerId);
      });
      box.addEventListener('pointermove', (e) => {
        if (!drag) return;
        tx += e.clientX - drag.x; ty += e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY }; clamp();
      });
      box.addEventListener('pointerup', () => { drag = null; box.classList.remove('pan'); });
      clamp();
      mask.querySelector('#cropX').onclick = () => mask.remove();
      mask.querySelector('#cropOK').onclick = () => {
        const S = s0 * z, sx = -tx / S, sy = -ty / S, sw = W / S, sh = H / S;
        const out = document.createElement('canvas'); out.width = 360; out.height = 540;
        out.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, 360, 540);
        out.toBlob((blob) => {
          mask.remove();
          if (blob) uploadCover(id, blob);   // JPEG recortado
          else uploadCover(id, file);        // sin recorte posible → original
        }, 'image/jpeg', 0.9);
      };
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(file);
}

async function uploadCover(id, file) {
  const view = $('#view'); view.innerHTML = '<div class="spin">subiendo portada…</div>';
  try {
    const fd = new FormData(); fd.append('photo', file);
    await fetch(`/api/covers/front/${id}`, { method: 'POST', body: fd }).then((x) => x.json());
  } catch { /* portada opcional */ }
  renderShelf();
}

// --- tema + vista (persistidos) ---
const THEMES = ['dark', 'sepia', 'light'];
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('biblioteca-theme', t);
  const btn = $('#themeBtn');
  if (btn) { btn.title = `Tema: ${t}`; }
}
applyTheme(localStorage.getItem('biblioteca-theme') || 'dark');
const themeBtn = $('#themeBtn');
if (themeBtn) {
  themeBtn.onclick = () => {
    const cur = THEMES.indexOf(localStorage.getItem('biblioteca-theme') || 'dark');
    applyTheme(THEMES[(cur + 1) % THEMES.length]);
  };
}
function setView(v) {
  localStorage.setItem('biblioteca-view', v);
  $('#viewShelf')?.classList.toggle('active', v === 'shelf');
  $('#viewGrid')?.classList.toggle('active', v === 'grid');
  renderShelf();
}
$('#viewShelf') && ($('#viewShelf').onclick = () => setView('shelf'));
$('#viewGrid') && ($('#viewGrid').onclick = () => setView('grid'));
{ const initial = localStorage.getItem('biblioteca-view') || 'shelf';
  $('#viewShelf')?.classList.toggle('active', initial === 'shelf');
  $('#viewGrid')?.classList.toggle('active', initial === 'grid'); }

// --- libros por balda (vista estante) ---
// 6 máximo en escritorio, 3 en teléfono: nunca una segunda línea en la misma balda.
const perRowEl = $('#perRow');
function maxPerRow() { return matchMedia('(min-width:900px)').matches ? 6 : 3; }
function setPerRow(v) {
  v = Math.max(1, Math.min(Number(v) || 6, maxPerRow()));
  localStorage.setItem('biblioteca-perrow', String(v));
  const el = $('#perRowVal'); if (el) el.textContent = String(v);
  if (perRowEl) perRowEl.value = String(v);
  return v;
}
if (perRowEl) {
  perRowEl.max = String(maxPerRow());
  setPerRow(localStorage.getItem('biblioteca-perrow') || '6');
  perRowEl.oninput = () => { setPerRow(perRowEl.value); vtx(renderShelf); }; // reorganiza con animación
  matchMedia('(min-width:900px)').addEventListener('change', () => {        // PC ↔ teléfono
    perRowEl.max = String(maxPerRow());
    setPerRow(perRowEl.value);
    vtx(renderShelf);
  });
}

// --- ficha del libro: página completa, portada grande, sin ficha técnica ---
function blurbText(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}
async function openDetail(b) {
  let bk = b;
  if (b.id) { try { bk = await api(`/api/books/${b.id}`); } catch {} }
  const view = $('#view');
  const ttl = displayTitle(bk);
  const page = document.createElement('div'); page.className = 'page';
  const back = document.createElement('button'); back.type = 'button'; back.className = 'btn ghost back'; back.textContent = '‹ Biblioteca';
  back.onclick = () => vtx(renderShelf); // la portada regresa volando a su balda
  page.appendChild(back);

  const layout = document.createElement('div'); layout.className = 'dlayout';
  const cv = document.createElement('div'); cv.className = 'bcover';
  const hasCover = !!(bk.cover_front || bk.cover_url);
  // cada libro conserva su nombre → la portada "vuela" de la balda a la ficha y vuelve
  if (bk.id) cv.style.viewTransitionName = `b${bk.id}`;
  if (bk.cover_front) cv.style.backgroundImage = `url("/${bk.cover_front}")`;
  else if (bk.cover_url) cv.style.backgroundImage = `url("${bk.cover_url}")`;
  else { cv.style.background = bk.strip_color || 'var(--strip)'; }
  if (!hasCover) {
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = ttl; cv.appendChild(l);
  }
  const coverCol = document.createElement('div'); coverCol.className = 'covercol';
  coverCol.appendChild(cv);
  if (bk.id) { // cambiar/poner portada: siempre visible, debajo de la tapa, en color
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn coverbtn';
    add.textContent = hasCover ? '＋ reemplazar portada' : '＋ subir portada';
    add.onclick = () => { addCoverTo(bk.id); };
    coverCol.appendChild(add);
  }
  layout.appendChild(coverCol);

  const right = document.createElement('div'); right.className = 'dright';
  const h = document.createElement('h1'); h.classList.add('btitle'); h.textContent = ttl; right.appendChild(h);
  const au = displayAuthor(bk);
  if (au) { const a = document.createElement('div'); a.className = 'bauthor'; a.textContent = au; right.appendChild(a); }
  const desc = blurbText(bk.description);
  if (desc) { const dd = document.createElement('div'); dd.className = 'blurb'; dd.textContent = desc; right.appendChild(dd); }
  layout.appendChild(right);
  page.appendChild(layout);
  vtx(() => { view.innerHTML = ''; view.appendChild(page); });
}

// --- render ---
const openBook = (b, el) => openDetail(b);

function tile(b, { showBand = true } = {}) {
  const el = document.createElement('div');
  const hasCover = !!(b.cover_front || b.cover_url);
  const title = displayTitle(b);
  el.className = 'tile' + (hasCover ? '' : ' gen');
  el.title = `${title}${b.location ? ` · ${locText(b.location)}` : ''}`;
  // nombre estable por libro: anima el morph de ficha Y el reordenado entre baldas
  if (b.id) el.style.viewTransitionName = `b${b.id}`;
  if (b.cover_front) el.style.backgroundImage = `url("/${b.cover_front}")`, el.style.backgroundSize = 'cover';
  else if (b.cover_url) el.style.backgroundImage = `url("${b.cover_url}")`, el.style.backgroundSize = 'cover';
  else {
    el.style.background = b.strip_color || '#3a332a';
    if (showBand && b.strip_present) {
      const band = document.createElement('div'); band.className = 'band';
      band.style.background = b.strip_color || '#3a332a';
      band.style.filter = 'brightness(1.18)';
      el.appendChild(band);
    }
  }
  if (b.needs_review) { const r = document.createElement('div'); r.className = 'rev'; el.appendChild(r); }
  if (hasCover) {
    el.onclick = () => openBook(b, el);
    return el; // con portada: solo la portada, sin título encima
  }
  // sin portada → el título ES la portada; si está guardado, ficha + ＋ para subir la foto
  if (b.id) {
    el.onclick = () => openBook(b, el);
    const badge = document.createElement('div'); badge.className = 'covbadge'; badge.textContent = '＋';
    badge.title = 'subir portada';
    badge.onclick = (e) => { e.stopPropagation(); addCoverTo(b.id); };
    el.appendChild(badge);
    el.title += ' · sin portada (toca ＋)';
  }
  const l = document.createElement('div'); l.className = 'lbl'; l.textContent = title;
  el.appendChild(l);
  return el;
}
const locText = (l) => `${l.shelf} · fila ${l.row} · ${l.pos}.º`;

async function renderShelf() {
  document.body.classList.remove('typing');
  const view = $('#view');
  let books = [];
  try { books = await api('/api/books'); } catch {}
  view.innerHTML = '';
  if (!books.length) return renderEmpty(view);
  if ((localStorage.getItem('biblioteca-view') || 'shelf') === 'shelf') return renderBookshelf(view, books);
  const grid = document.createElement('div'); grid.className = 'grid';
  for (const b of books) grid.appendChild(tile(b));
  view.appendChild(grid);
}

// estante: libros agrupados por ubicación; SIEMPRE se muestran las baldas del mueble
// (vacías si no hay libros ahí), para que la biblioteca se vea como tal.
const SHELF_UNITS = [['A', 1], ['A', 2], ['B', 1], ['B', 2], ['C', 1], ['C', 2]];
// Reordena los libros del mueble: `per` libros por balda. Pedido estable (por ubicación),
// los que no tienen ubicación van al final. Mínimo 6 baldas aunque haya pocos libros.
function renderBookshelf(view, books) {
  const per = Math.max(1, Math.min(Number(localStorage.getItem('biblioteca-perrow') || '6'), maxPerRow()));
  const ordered = [...books].sort((a, b2) => {
    const la = a.location, lb = b2.location;
    if (!la && !lb) return 0; if (!la) return 1; if (!lb) return -1;
    const ka = `${la.shelf}`, kb = `${lb.shelf}`;
    return ka < kb ? -1 : ka > kb ? 1 : la.row < lb.row ? -1 : la.row > lb.row ? 1 : (la.pos ?? 0) - (lb.pos ?? 0);
  });
  const rows = Math.max(SHELF_UNITS.length, Math.ceil(ordered.length / Math.max(per, 1)));
  const units = [];
  for (let i = 0; i < rows; i++) {
    const [sh, rw] = i < SHELF_UNITS.length ? SHELF_UNITS[i] : [String.fromCharCode(65 + Math.floor(i / 2)), (i % 2) + 1];
    units.push(`${sh}-${rw}`);
  }
  const groups = new Map(units.map((k) => [k, []]));
  ordered.forEach((b, i) => groups.get(units[Math.min(Math.floor(i / per), rows - 1)]).push(b));
  const wrap = document.createElement('div'); wrap.className = 'shelfview';
  for (const [key, list] of groups) {
    const row = document.createElement('div'); row.className = 'shelfrow';
    for (const cls of ['back-panel', 'wall wall-left', 'wall wall-right', 'plank-top', 'plank-front'])
      row.appendChild(Object.assign(document.createElement('i'), { className: cls }));
    for (const b of list) row.appendChild(tile(b));
    wrap.appendChild(row);
  }
  view.appendChild(wrap);
}

// §6.2 — al abrir sin libros: el mueble, vacío + una sola acción. Cero texto de obra.
function renderEmpty(view) {
  const wrap = document.createElement('div'); wrap.className = 'empty';
  const shelf = document.createElement('div'); shelf.className = 'shelf';
  for (const r of ['A', 'B']) {
    const row = document.createElement('div'); row.className = 'row';
    const lbl = document.createElement('div'); lbl.className = 'lblrow'; lbl.textContent = `fila ${r}`;
    shelf.appendChild(row); shelf.appendChild(lbl);
  }
  wrap.appendChild(shelf);
  const cta = document.createElement('div'); cta.className = 'cta';
  cta.innerHTML = `<button class="btn" id="go">Escanear un libro</button>
    <div class="gest">una foto → ISBN → listo</div>`;
  wrap.appendChild(cta);
  view.appendChild(wrap);
  $('#go').onclick = pickPhoto;
}

// --- flujo de escaneo + confirmación (4 estados) ---
let session = null; // { file, strip, ticket, isbn, meta, existing }

function pickPhoto() { const i = $('#photo'); i.value = ''; i.onchange = () => onPhoto(i.files[0]); i.click(); }

// entrada sin cámara (diálogo o fallo de lectura): búsqueda por título/ISBN
async function onPhoto(file) {
  if (!file) return;
  const view = $('#view');
  view.innerHTML = '<div class="spin">leyendo el código…</div>';
  const strip = await computeStrip(file);
  const isbn = await decodeIsbn(file);
  const fd = new FormData();
  fd.append('photo', file);
  if (isbn) fd.append('isbn', isbn);
  if (strip.color) fd.append('strip_color', strip.color);
  fd.append('strip_present', strip.present ? '1' : '0');
  fd.append('mirrored', strip.mirrored ? '1' : '0');
  let scan;
  try { scan = await fetch('/api/scan', { method: 'POST', body: fd }).then((r) => r.json()); }
  catch { scan = { ticket: null, existing: [] }; }
  session = { file, strip, ticket: scan.ticket, isbn, meta: null, existing: scan.existing || [], entry: null };
  if (!isbn) {
    // EAN no leído → el título se saca de la MISMA foto (portada/lomo) antes de pedir
    // el ISBN a mano: si sale algo, el flujo salta directo al estado C con el campo ya lleno.
    view.innerHTML = '<div class="spin">leyendo el título de la foto…</div>';
    const title = await ocrTitleFrom(file);
    session.entry = title || null;
    return renderConfirm(title ? 'C' : 'B');
  }
  await lookupMeta(isbn);
  renderConfirm(session.existing.length ? 'D' : (!session.meta ? 'C' : 'A'));
}

function confirmTile() {
  const e0 = session.existing[0];
  const b = {
    title_native: session.meta?.title_native || (e0 && e0.title_native) || session.typed || null,
    isbn: session.isbn,
    strip_color: session.strip.color, strip_present: session.strip.present,
    cover_front: session.meta?.cover_front || null,
    cover_url: session.meta?.cover_url || (e0 && e0.cover_url) || null, needs_review: false,
  };
  return tile(b, { showBand: true });
}

function renderConfirm(state) {
  // en búsqueda desde el diálogo, el resultado vive EN el modal (sin página intermedia)
  const modal = !!session?._modal;
  const view = modal ? $('#ndRes') : $('#view');
  view.innerHTML = '';
  const box = document.createElement('div'); box.className = 'confirm';
  const back = document.createElement('button'); back.type = 'button';
  back.className = 'btn ghost back';
  if (modal) {
    back.textContent = '‹ Nueva búsqueda';
    back.onclick = () => { session = null; $('#ndRes').classList.add('hide'); $('#ndRes').innerHTML = ''; $('#ndStart').classList.remove('hide'); $('#newTitle').focus(); };
  } else {
    back.textContent = '‹ Biblioteca';
    back.onclick = () => { session = null; renderShelf(); };
  }
  box.appendChild(back);
  const frame = document.createElement('div'); frame.className = 'cframe';
  const t = confirmTile(); t.classList.add('ctile'); frame.appendChild(t);

  const meta = document.createElement('div'); meta.className = 'cmeta';
  const m = session.meta;
  const e0 = session.existing[0];
  const h = document.createElement('h2');
  if (state === 'A' || state === 'D') h.textContent = (m && m.title_native) || (e0 && e0.title_native) || '';
  else if (state === 'B') { h.className = 'none'; h.textContent = session.manual ? 'Escribe el ISBN o el título' : 'No se leyó el código'; }
  else {
    h.className = 'none';
    h.textContent = session.isbn ? 'Sin match en la base' : (session.entry ? 'Título detectado · verifica' : 'Sin ISBN · escríbelo o usa ＋ portada');
  }
  meta.appendChild(h);

  if (state === 'A' || state === 'D') {
    const src = m || e0;
    const au = src && displayAuthor({ authors: src.authors });
    if (au) { const d = document.createElement('div'); d.className = 'a'; d.textContent = au; meta.appendChild(d); }
    if (m && m.series) { const d = document.createElement('div'); d.className = 'a'; d.textContent = m.series; meta.appendChild(d); }
  }

  // ISBN: siempre visible y copiable con un toque (no re-tipear 13 dígitos)
  if (session.isbn) {
    const chipRow = document.createElement('div'); chipRow.className = 'chiprow';
    const lead = document.createElement('span'); lead.className = 'muted'; lead.textContent = 'ISBN';
    chipRow.appendChild(lead); chipRow.appendChild(isbnChip(session.isbn));
    meta.appendChild(chipRow);
  }

  // sin match: el reporte POR FUENTE, ordenado por acción — lo accionable (mustard) antes que la cobertura (gris)
  if (state === 'C') meta.appendChild(sourcesBlock(session.sources));
  frame.appendChild(meta);
  box.appendChild(frame);

  if (state === 'D') {
    const who = document.createElement('div'); who.className = 'who';
    who.textContent = `Ya tienes ${session.existing.length} ejemplar(es): `
      + session.existing.map((e) => (e.location ? `${locText(e.location)}${e.needs_review ? ' (revisar)' : ''}` : 'sin ubicación')).join(' · ');
    box.appendChild(who);
  }

  const actions = [...actionsFor(state)];
  if (state === 'B' || state === 'C') {
    const inp = document.createElement('input'); inp.className = 'input';
    inp.placeholder = state === 'B' ? (session.manual ? 'escribe el ISBN o el título' : 'escribe el ISBN (13 dígitos)') : 'título';
    inp.id = 'entry'; box.appendChild(inp);
    inp.value = session.entry || (state === 'B' ? session.isbn || '' : '');
    if (state === 'B' && session.badIsbn) {
      const err = document.createElement('div'); err.className = 'muted'; err.id = 'entry-err';
      err.style.fontSize = '12.5px'; err.style.marginTop = '6px'; err.style.color = 'var(--mustard)';
      err.textContent = 'el último dígito no cuadra (verifica el ISBN)';
      box.appendChild(err);
    }
  }
  if (state === 'C') {
    const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'upCover';
    btn.className = 'btn ghost'; btn.textContent = session.cover ? '＋ otra portada' : '＋ portada (lee el título)';
    btn.onclick = pickCover;
    box.appendChild(btn);
    if (session.coverUrl) {
      const img = document.createElement('img'); img.className = 'cvthumb'; img.alt = 'portada';
      img.src = session.coverUrl; box.appendChild(img);
    }
  }
  const actionsWrap = document.createElement('div'); actionsWrap.className = 'actions';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (a.kind === 'primary' ? '' : ' ghost');
    btn.textContent = a.label; btn.onclick = a.run;
    actionsWrap.appendChild(btn);
  }
  box.appendChild(actionsWrap);
  view.appendChild(box);
  const e = $('#entry');
  if (e) {
    // con el teclado abierto la barra de acciones se retira (no tapa el campo) y vuelve al salir
    e.addEventListener('focus', () => document.body.classList.add('typing'));
    e.addEventListener('blur', () => document.body.classList.remove('typing'));
    e.focus();
  } else {
    document.body.classList.remove('typing');
  }
}

function actionsFor(state) {
  const again = session.ticket ? { label: 'Volver a tomar', kind: 'seco', run: pickPhoto } : null;
  const withAgain = []; if (again) withAgain.push(again);
  if (state === 'A') return [
    { label: 'Sí, es este', kind: 'primary', run: () => commit('A', 'create', proposal()) },
    { label: 'Corregir', kind: 'seco', run: () => { session.editManual = true; renderConfirm('C'); } },
    ...withAgain,
  ];
  if (state === 'B') return [
    { label: 'Buscar', kind: 'primary', run: () => submitManual() },
    ...withAgain,
  ];
  if (state === 'C') return [
    { label: 'Buscar por título', kind: 'primary', run: () => { const q = ($('#entry')?.value || '').trim(); return q ? searchByTitle(q) : $('#entry')?.focus(); } },
    { label: 'Poner título a mano', kind: 'seco', run: () => {
        const v = ($('#entry')?.value || '').trim();
        if (!v) { $('#entry')?.focus(); return; }
        commit('C', 'create', { ...proposal(), title_native: v });
      } },
    { label: 'Guardar sin título', kind: 'seco', run: () => commit('C', 'create', proposal()) },
    ...withAgain,
  ];
  if (state === 'D') return [
    { label: 'Ya lo tengo', kind: 'primary', run: () => { if (session?._modal) $('#new').close(); renderShelf(); } },
    { label: 'Es otro ejemplar · suma una copia', kind: 'seco', run: () => commit('D', 'create', proposal()) },
  ];
  return [];
}

// B manual: acepta un ISBN (10/13 dígitos) o un título para buscar.
// `text` opcional: el flujo del diálogo pasa el texto sin pantalla intermedia.
async function submitManual(raw) {
  const text = (raw ?? $('#entry')?.value ?? '').trim();
  const v = text.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (v.length === 10 || v.length === 13) {
    if (!validIsbn(v)) { session.badIsbn = true; session.entry = text; return renderConfirm('B'); }
    session.badIsbn = false; session.entry = null; session.isbn = v;
    await lookupMeta(v);
    try { session.existing = (await api(`/api/lookup/${v}`)).existing; } catch {}
    return renderConfirm(session.existing.length ? 'D' : (!session.meta ? 'C' : 'A'));
  }
  if (text.length >= 2) return searchByTitle(text);
  $('#entry')?.focus();
}

// Buscar un libro por su nombre (sin ISBN): título → obra de Open Library (portada + sinopsis).
async function searchByTitle(q) {
  const host = session?._modal ? $('#ndRes') : $('#view');
  host.innerHTML = '<div class="spin">buscando…</div>';
  let hit = null;
  try { hit = (await api(`/api/search?q=${encodeURIComponent(q)}`)).hit; } catch {}
  session.entry = q;
  if (hit) {
    session.meta = hit; session.isbn = session.isbn || null;
    session.sources = [{ name: 'Open Library', outcome: 'hit' }];
    return renderConfirm('A');
  }
  renderConfirm('C'); // sin resultado: vuelve al campo con el texto escrito
}

function proposal() {
  const b = { isbn: session.isbn, location: { shelf: 'A', row: 1 } }; // propuesta de un toque (editable)
  const m = session.meta;
  if (m) { b.title_native = m.title_native; b.title_romaji = m.title_romaji; b.authors = m.authors; b.pages = m.pages; b.cover_url = m.cover_url || null; b.cover_front = (m.cover_front || '').split('?')[0] || null; b.source = m.source; b.confidence = m.confidence; b.description = m.description || null; }
  return b;
}

async function commit(state, action, book) {
  const wasModal = !!session?._modal;
  const host = wasModal ? $('#ndRes') : $('#view');
  host.innerHTML = '<div class="spin">guardando…</div>';
  try {
    const r = await fetch('/api/confirm', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket: session.ticket, state, action, id: session.existing[0]?.id, book, strip: session.strip }),
    }).then((x) => x.json());
    if (r.error) throw new Error(r.error);
    if (session.cover) {
      try {
        const fd = new FormData(); fd.append('photo', session.cover);
        await fetch(`/api/covers/front/${r.id}`, { method: 'POST', body: fd }).then((x) => x.json());
      } catch { /* portada opcional: el libro ya se guardó */ }
    }
    session = null;
    renderShelf();
    if (wasModal) $('#new').close();
  } catch (e) { host.innerHTML = `<div class="spin">no se pudo guardar: ${esc(e.message)}</div>`; }
}

// ＋ abre el menú de entrada: escanear o buscar directo (título/ISBN)
const newDlg = $('#new');
const ndStart = $('#ndStart'), ndRes = $('#ndRes');
function openNew() { session = null; ndRes.innerHTML = ''; ndRes.classList.add('hide'); ndStart.classList.remove('hide'); newDlg.showModal(); }
$('#add').onclick = openNew;
$('#fab').onclick = openNew;
newDlg.addEventListener('click', (e) => { if (e.target === newDlg) newDlg.close(); });
$('#optScan').onclick = () => { newDlg.close(); pickPhoto(); };
const newTitle = $('#newTitle');
const optSearch = $('#optSearch');
function searchFromDialog() {
  const raw = (newTitle.value || '').trim();
  if (!raw) return newTitle?.focus();
  // mismo modal: pasamos a la vista de resultado, sin página intermedia
  ndStart.classList.add('hide'); ndRes.classList.remove('hide');
  ndRes.innerHTML = '<div class="spin">buscando…</div>';
  session = { file: null, strip: { color: null, present: false, mirrored: false },
    ticket: null, isbn: null, meta: null, existing: [], manual: true, entry: raw, _modal: true };
  submitManual(raw);
}
optSearch.onclick = searchFromDialog;
newTitle.onkeydown = (e) => { if (e.key === 'Enter') searchFromDialog(); };
renderShelf();
