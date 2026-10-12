import { useCallback, useEffect, useRef, useState } from 'react';
import { api, lookupMeta } from './lib/api.js';
import { decodeIsbn } from './lib/barcode.js';
import { computeStrip } from './lib/strip.js';
import { ocrTitleFrom } from './lib/ocr.js';
import { validIsbn, displayTitle } from './lib/book.js';
import { vtx } from './lib/vtx.js';
import { useMediaQuery } from './lib/useMediaQuery.js';
import Header from './components/Header.jsx';
import ShelfView from './components/ShelfView.jsx';
import GridView from './components/GridView.jsx';
import EmptyShelf from './components/EmptyShelf.jsx';
import BookDetail from './components/BookDetail.jsx';
import AddDialog from './components/AddDialog.jsx';
import ConfirmPanel from './components/ConfirmPanel.jsx';
import CropDialog from './components/CropDialog.jsx';
import ScanFrame from './components/ScanFrame.jsx';
import DeleteDialog from './components/DeleteDialog.jsx';
import Burst3D from './components/Burst3D.jsx';
import FlyingBook from './components/FlyingBook.jsx';
import SearchLoader from './components/SearchLoader.jsx';

const THEMES = ['dark', 'sepia', 'light'];
const clampPerRow = (v, max) => Math.max(1, Math.min(Number(v) || 6, max));

export default function App() {
  const wide = useMediaQuery('(min-width:900px)');
  const maxPerRow = wide ? 6 : 3;

  const [theme, setTheme] = useState(() => localStorage.getItem('biblioteca-theme') || 'dark');
  const [view, setView] = useState(() => localStorage.getItem('biblioteca-view') || 'shelf');
  const [section, setSection] = useState(() => localStorage.getItem('biblioteca-section') || 'owned'); // owned | buy
  const sectionRef = useRef(section);
  const [perRow, setPerRowState] = useState(() => clampPerRow(localStorage.getItem('biblioteca-perrow') || 6, wide ? 6 : 3));
  const [books, setBooks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);       // { text, modal, scan? } | null
  const [session, setSession] = useState(null); // flujo de escaneo (espejo del `session` viejo)
  const [confirmState, setConfirmState] = useState(null); // A | B | C | D
  const [entry, setEntry] = useState('');       // campo $entry (estados B/C)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [crop, setCrop] = useState(null);       // { id, file }
  const [deleteTarget, setDeleteTarget] = useState(null); // libro a eliminar (ficha)
  const [toast, setToast] = useState(null);     // { id, kind: 'add'|'remove', title, note? } | null
  const toastTimer = useRef(null);
  const toastKey = useRef(0);
  const [fly, setFly] = useState(null);          // clon del libro volando de la balda al panel
  const [panelShow, setPanelShow] = useState(false); // el panel se revela al llegar el libro

  const showToast = (kind, title, note = '') => {
    setToast({ id: ++toastKey.current, kind, title: title || (kind === 'add' ? 'Libro' : 'El libro'), note });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2700);
  };

  const sessionRef = useRef(null);
  const photoRef = useRef(null);
  const coverRef = useRef(null);
  const coverActionRef = useRef(null);

  const setSessionBoth = (s) => { sessionRef.current = s; setSession(s); };
  const patchSession = (patch) => { const next = { ...(sessionRef.current || {}), ...patch }; setSessionBoth(next); return next; };

  // ---- tema / vista / balda (persistidos) ----
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('biblioteca-theme', theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem('biblioteca-view', view); }, [view]);
  useEffect(() => { sectionRef.current = section; }, [section]);
  const changeSection = (s) => {
    if (s === section) { goLibrary(); return; }
    setSection(s);
    localStorage.setItem('biblioteca-section', s);
    goLibrary(); // cada sección es su propio estante: se vuelve a la balda correspondiente
  };
  useEffect(() => { setPerRowState((p) => clampPerRow(p, wide ? 6 : 3)); }, [wide]); // PC ↔ teléfono
  const cycleTheme = () => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);
  const setPerRow = (v) => {
    const n = clampPerRow(v, maxPerRow);
    localStorage.setItem('biblioteca-perrow', String(n));
    setPerRowState(n);
  };

  // ---- datos ----
  const refresh = useCallback(async () => {
    try { setBooks(await api(`/api/books?section=${sectionRef.current}`)); } catch { /* deja lo que había */ }
    setLoaded(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refresh(); }, [section]); // al cambiar de estante, recargar esa balda

  // vuelve a la biblioteca: sin ficha, sin confirmación, sin sesión
  const goLibrary = () => {
    setConfirmState(null); setDetail(null); setSessionBoth(null); setBusy(null); setFly(null); setPanelShow(false);
    document.body.classList.remove('typing');
    refresh();
  };

  const openBook = async (b, e) => {
    // leer la posición SÍNCRONO: React anula e.currentTarget en cuanto vuelve el handler
    const rect = e && e.currentTarget ? e.currentTarget.getBoundingClientRect() : null;
    let bk = b;
    if (b.id) { try { bk = await api(`/api/books/${b.id}`); } catch { /* usa el resumen */ } }
    vtx(() => {
      setDetail(bk);
      if (matchMedia('(min-width:900px)').matches) {
        // escritorio: el MORF clásico — el libro cruza literalmente al panel (View Transition)
        setPanelShow(true);
        setFly(null);
      } else {
        // móvil: el overlay 3D vuela de la balda al panel (más predecible con WebGL)
        setPanelShow(false);
        setFly(rect ? { id: bk.id, from: { x: rect.left, y: rect.top, w: rect.width, h: rect.height } } : null);
      }
    });
  };

  // ---- §5.2/§5.3 flujo de escaneo (4 estados) ----
  const renderConfirm = (state, patch) => {
    const next = patch ? patchSession(patch) : (sessionRef.current || {});
    setEntry(next.entry || (state === 'B' ? next.isbn || '' : ''));
    setBusy(null);
    document.body.classList.remove('typing');
    setConfirmState(state);
  };

  const pickPhoto = () => { const i = photoRef.current; i.value = ''; i.click(); };

  const onPhoto = async (file) => {
    if (!file) return;
    setDialogOpen(false); setConfirmState(null);
    setBusy({ text: 'leyendo el código…', modal: false, scan: true });
    const strip = await computeStrip(file);   // §5.2, en canvas del navegador
    const isbn = await decodeIsbn(file);
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('section', sectionRef.current || 'owned'); // sin preguntar: cae en el estante activo
    if (isbn) fd.append('isbn', isbn);
    if (strip.color) fd.append('strip_color', strip.color);
    fd.append('strip_present', strip.present ? '1' : '0');
    fd.append('mirrored', strip.mirrored ? '1' : '0');
    let scan;
    try { scan = await fetch('/api/scan', { method: 'POST', body: fd }).then((r) => r.json()); }
    catch { scan = { ticket: null, existing: [] }; }
    setSessionBoth({ file, strip, ticket: scan.ticket, isbn, meta: null, sources: [], existing: scan.existing || [], entry: null });
    if (!isbn) {
      // EAN no leído → el título se saca de la MISMA foto antes de pedir el ISBN a mano
      setBusy({ text: 'leyendo el título de la foto…', modal: false, scan: true });
      const title = await ocrTitleFrom(file);
      patchSession({ entry: title || null });
      return renderConfirm(title ? 'C' : 'B');
    }
    const { meta, sources } = await lookupMeta(isbn);
    patchSession({ meta, sources });
    renderConfirm(scan.existing.length ? 'D' : (!meta ? 'C' : 'A'));
  };

  // B manual: acepta un ISBN (10/13 dígitos) o un título para buscar.
  const submitManual = async (raw) => {
    const text = String(raw ?? entry ?? '').trim();
    const v = text.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (v.length === 10 || v.length === 13) {
      if (!validIsbn(v)) { patchSession({ badIsbn: true, entry: text }); return renderConfirm('B'); }
      patchSession({ badIsbn: false, entry: null, isbn: v });
      const { meta, sources } = await lookupMeta(v);
      patchSession({ meta, sources });
      try { patchSession({ existing: (await api(`/api/lookup/${v}?section=${sectionRef.current || 'owned'}`)).existing }); } catch { /* sin existentes */ }
      const s = sessionRef.current;
      return renderConfirm(s.existing?.length ? 'D' : (!s.meta ? 'C' : 'A'));
    }
    if (text.length >= 2) return searchByTitle(text);
  };

  // Buscar un libro por su nombre (sin ISBN): título → obra de Open Library (portada + sinopsis).
  const searchByTitle = async (q) => {
    setBusy({ text: 'buscando…', modal: !!sessionRef.current?._modal, search: true });
    let hit = null;
    try { hit = (await api(`/api/search?q=${encodeURIComponent(q)}`)).hit; } catch { /* sin resultado */ }
    patchSession({ entry: q });
    if (hit) {
      patchSession({ meta: hit, isbn: sessionRef.current.isbn || null, sources: [{ name: 'Open Library', outcome: 'hit' }] });
      return renderConfirm('A');
    }
    renderConfirm('C'); // sin resultado: vuelve al campo con el texto escrito
  };

  const proposal = () => {
    const s = sessionRef.current || {};
    const b = { isbn: s.isbn, location: { shelf: 'A', row: 1 }, section: sectionRef.current || 'owned' }; // se guarda en el estante activo
    const m = s.meta;
    if (m) {
      b.title_native = m.title_native; b.title_romaji = m.title_romaji; b.authors = m.authors; b.pages = m.pages;
      b.publisher = m.publisher || null;
      b.cover_url = m.cover_url || null; b.cover_front = (m.cover_front || '').split('?')[0] || null;
      b.source = m.source; b.confidence = m.confidence; b.description = m.description || null;
    }
    return b;
  };

  const commit = async (state, action, book) => {
    const s = sessionRef.current || {};
    const modal = !!s._modal;
    setBusy({ text: 'guardando…', modal });
    try {
      const r = await fetch('/api/confirm', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: s.ticket, state, action, id: s.existing?.[0]?.id, book, strip: s.strip }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      if (s.cover) {
        try {
          const fd = new FormData(); fd.append('photo', s.cover);
          await fetch(`/api/covers/front/${r.id}`, { method: 'POST', body: fd }).then((x) => x.json());
        } catch { /* portada opcional: el libro ya se guardó */ }
      }
      setDialogOpen(false);
      goLibrary();
      showToast('add', (book && (book.title_native || book.title_romaji)) || '');
    } catch (e) { setBusy({ text: `no se pudo guardar: ${e.message}`, modal }); }
  };

  const editManual = () => { patchSession({ editManual: true }); renderConfirm('C'); };

  // ---- portada: elegir/cambiar + editor de recorte ----
  const onPickCover = () => { coverActionRef.current = (file) => coverPicked(file); const i = coverRef.current; i.value = ''; i.click(); };
  const addCoverTo = (id) => { coverActionRef.current = (file) => setCrop({ id, file }); const i = coverRef.current; i.value = ''; i.click(); };

  const coverPicked = async (file) => {
    if (!file) return;
    const held = entry;
    patchSession({ cover: file, coverUrl: URL.createObjectURL(file), entry: sessionRef.current.entry || held || null });
    renderConfirm('C');
    const line = await ocrTitleFrom(file); // completa el campo cuando puede
    if (line && !sessionRef.current?.entry) { patchSession({ entry: line }); setEntry(line); }
  };

  const uploadCover = async (id, file) => {
    setBusy({ text: 'subiendo portada…', modal: false });
    try {
      const fd = new FormData(); fd.append('photo', file);
      await fetch(`/api/covers/front/${id}`, { method: 'POST', body: fd }).then((x) => x.json());
    } catch { /* portada opcional */ }
    goLibrary();
  };
  const onCropDone = (blob) => { const id = crop && crop.id; setCrop(null); if (id) uploadCover(id, blob); };

  // ---- borrado / mover de estante ----
  const removeBooks = async (ids, title) => {
    setDeleteTarget(null);
    setBusy({ text: 'eliminando…', modal: false });
    let ok = true;
    for (const id of ids) {
      try { await api(`/api/books/${id}`, { method: 'DELETE' }); } catch { ok = false; }
    }
    setBusy(null);
    goLibrary();
    showToast(ok ? 'remove' : 'remove-fail', title);
  };
  const removeAllCopies = async () => {
    const ids = [deleteTarget.id];
    if (deleteTarget.isbn) {
      try { ids.push(...(await api(`/api/lookup/${deleteTarget.isbn}`)).existing.map((e) => e.id)); } catch { /* solo este id */ }
    }
    removeBooks([...new Set(ids)], displayTitle(deleteTarget));
  };
  const moveSection = async (book, to) => {
    setBusy({ text: 'moviendo…', modal: false });
    try {
      await api(`/api/books/${book.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: to }),
      });
      changeSection(to); // te sigue al estante de destino: ves el libro aterrizar
      showToast('move', displayTitle(book), to === 'buy' ? 'a "por comprar"' : 'a mi biblioteca');
    } catch { setBusy(null); }
  };

  // ---- diálogo «＋» ----
  const openNew = () => { setSessionBoth(null); setConfirmState(null); setBusy(null); setDialogOpen(true); };
  const dismissDialog = () => { setDialogOpen(false); setSessionBoth(null); setConfirmState(null); setBusy(null); };
  const searchFromDialog = (text) => {
    setSessionBoth({ file: null, strip: { color: null, present: false, mirrored: false }, ticket: null, isbn: null, meta: null, sources: [], existing: [], manual: true, entry: text, _modal: true });
    setBusy({ text: 'buscando…', modal: true, search: true }); // el resultado vive EN el modal (sin página intermedia)
    submitManual(text);
  };
  const backToStart = () => { setSessionBoth(null); setConfirmState(null); setBusy(null); setDialogOpen(true); };
  const doneExisting = () => { if (sessionRef.current?._modal) setDialogOpen(false); goLibrary(); };

  const modal = !!session?._modal;
  const mainBusy = busy && !busy.modal;
  const dialogBusy = busy && busy.modal;

  const confirmProps = {
    session, state: confirmState, entry, onEntry: setEntry,
    onRetake: pickPhoto, onPickCover, onCommit: commit, onProposal: proposal,
    onSearchTitle: searchByTitle, onManual: submitManual, onEditManual: editManual, onDone: doneExisting,
  };

  // el estante siempre se dibuja; si hay ficha abierta, su libro queda como un hueco (está
  // "sacado") y el resto de la biblioteca se ve a la izquierda del panel.
  const holeId = detail ? detail.id : undefined;
  const libraryView = !loaded ? null
    : books.length === 0 ? (view === 'shelf' ? (
      <>
        <ShelfView books={books} perRow={perRow} onOpen={openBook} onAddCover={addCoverTo} buy={section === 'buy'} holeId={holeId} />
        <div className="empty-cta">
          <button type="button" className="btn" onClick={pickPhoto}>
            {section === 'buy' ? 'Escanear un libro para comprar' : 'Escanear un libro'}
          </button>
          <div className="gest">una foto → ISBN → listo</div>
        </div>
      </>
    ) : <EmptyShelf onScan={pickPhoto} buy={section === 'buy'} />)
    : view === 'shelf'
      ? <ShelfView books={books} perRow={perRow} onOpen={openBook} onAddCover={addCoverTo} buy={section === 'buy'} holeId={holeId} />
      : <GridView books={books} onOpen={openBook} onAddCover={addCoverTo} holeId={holeId} />;

  return (
    <>
      <Header
        view={view} onView={(v) => vtx(() => setView(v))}
        theme={theme} onCycleTheme={cycleTheme}
        section={section} onSection={changeSection}
        perRow={perRow} maxPerRow={maxPerRow} onPerRow={(v) => vtx(() => setPerRow(v))}
        onAdd={openNew}
      />

      <main>
        {section === 'buy' && <div className="shelf-cap">Estante de compras: lo que escanees desde aquí cae en esta lista, sin preguntar.</div>}
        {mainBusy ? (busy.scan
          ? <div className="scanwrap"><ScanFrame label={busy.text} /></div>
          : busy.search
            ? <div className="scanwrap"><SearchLoader label={busy.text} /></div>
            : <div className="spin">{busy.text}</div>)
          : confirmState && !modal ? <ConfirmPanel {...confirmProps} modal={false} onBack={() => vtx(goLibrary)} />
          : detail ? (
            <div className="split">
              <div className="split-shelf">{libraryView}</div>
              <BookDetail book={detail} visible={panelShow} morph={matchMedia('(min-width:900px)').matches} onBack={() => vtx(goLibrary)} onAddCover={addCoverTo} onDelete={setDeleteTarget} onMove={moveSection} />
            </div>
          )
          : libraryView}
      </main>

      {panelShow && <div className="panel-fade" onClick={() => vtx(goLibrary)} aria-hidden="true" />}
      {fly && <FlyingBook key={fly.id} book={detail} fly={fly} onArrive={() => setPanelShow(true)} onDone={() => setFly(null)} />}

      <button className="fab" aria-label="Escanear un libro" onClick={openNew}>＋</button>

      {toast && (
        <div className="toast" role="status">
          <span aria-hidden="true">{toast.kind === 'add' ? '🎉' : toast.kind === 'remove' ? '🗑️' : toast.kind === 'remove-fail' ? '⚠️' : '⇄'}</span>
          {toast.kind === 'add' ? <span>¡<b>{toast.title}</b> registrado!</span>
            : toast.kind === 'remove' ? <span><b>{toast.title}</b> eliminado</span>
            : toast.kind === 'remove-fail' ? <span>no se pudo eliminar · inténtalo de nuevo</span>
            : <span><b>{toast.title}</b> → {toast.note}</span>}
        </div>
      )}
      {toast?.kind === 'add' && <Burst3D key={toast.id} />}

      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hide"
        onChange={(e) => onPhoto(e.target.files[0])} />
      <input ref={coverRef} type="file" accept="image/*" className="hide"
        onChange={(e) => { const f = e.target.files[0]; if (f) coverActionRef.current?.(f); }} />

      <AddDialog
        open={dialogOpen} showResult={modal}
        onDismiss={dismissDialog}
        onScan={() => { setDialogOpen(false); pickPhoto(); }}
        onSearch={searchFromDialog}
      >
        {dialogBusy ? (busy.scan
          ? <div className="scanwrap"><ScanFrame label={busy.text} /></div>
          : busy.search
            ? <div className="scanwrap"><SearchLoader label={busy.text} /></div>
            : <div className="spin">{busy.text}</div>)
          : confirmState ? <ConfirmPanel {...confirmProps} modal onBack={backToStart} />
          : null}
      </AddDialog>

      {crop && <CropDialog file={crop.file} onCancel={() => setCrop(null)} onDone={onCropDone} />}

      {deleteTarget && (
        <DeleteDialog
          book={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onRemoveOne={() => removeBooks([deleteTarget.id], displayTitle(deleteTarget))}
          onRemoveAll={removeAllCopies}
        />
      )}
    </>
  );
}
