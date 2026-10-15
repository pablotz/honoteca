import { t } from './lib/i18n.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, lookupMeta } from './lib/api.js';
import { authMe, logout } from './lib/auth.js';
import { decodeIsbn } from './lib/barcode.js';
import { computeStrip } from './lib/strip.js';
import { ocrTitleFrom } from './lib/ocr.js';
import { validIsbn, displayTitle } from './lib/book.js';
import { vtx } from './lib/vtx.js';
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
import MoveDialog from './components/MoveDialog.jsx';
import Burst3D from './components/Burst3D.jsx';
import FlyingBook from './components/FlyingBook.jsx';
import SearchLoader from './components/SearchLoader.jsx';
import Login from './components/Login.jsx';
import HomeScreenGuide from './components/HomeScreenGuide.jsx';
import Icon from './components/Icon.jsx';
import { THEMES, readPreferences, savePreferences, initialTheme } from './lib/preferences.js';

const clampPerRow = (v, max) => Math.max(1, Math.min(Number(v) || 6, max));

export default function App() {
  const maxPerRow = 6;

  const [theme, setTheme] = useState(initialTheme);
  const [view, setView] = useState(() => readPreferences().view);
  const [section, setSection] = useState(() => readPreferences().section); // owned | buy
  const sectionRef = useRef(section);
  const [preferredPerRow, setPerRowState] = useState(() => readPreferences().perRow);
  const perRow = Math.max(3, clampPerRow(preferredPerRow, maxPerRow));
  const [books, setBooks] = useState([]);
  const [bookCounts, setBookCounts] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const booksRequest = useRef(0);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);       // { text, modal, scan? } | null
  const [session, setSession] = useState(null); // flujo de escaneo (espejo del `session` viejo)
  const [confirmState, setConfirmState] = useState(null); // A | B | C | D
  const [entry, setEntry] = useState('');       // campo $entry (estados B/C)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [crop, setCrop] = useState(null);       // { id, file }
  const [deleteTarget, setDeleteTarget] = useState(null); // libro a eliminar (ficha)
  const [moveTarget, setMoveTarget] = useState(null); // { book, to }
  const [toast, setToast] = useState(null);     // { id, kind: 'add'|'remove', title, note? } | null
  const toastTimer = useRef(null);
  const toastKey = useRef(0);
  const [fly, setFly] = useState(null);          // clon del libro volando de la balda al panel
  const [auth, setAuth] = useState(null);        // null = comprobando; luego { authed, user, required, mail }
  const [logoutOpen, setLogoutOpen] = useState(false);
  const logoutRef = useRef(null);
  useEffect(() => {
    const dialog = logoutRef.current;
    if (!dialog) return;
    if (logoutOpen && !dialog.open) dialog.showModal();
    if (!logoutOpen && dialog.open) dialog.close();
  }, [logoutOpen]);
  useEffect(() => {
    authMe().then((result) => {
      const saved = readPreferences(result.user);
      setTheme(saved.theme); setView(saved.view); setSection(saved.section); setPerRowState(saved.perRow);
      sectionRef.current = saved.section;
      setAuth(result);
    });
  }, []);
  const doLogout = async () => {
    setLogoutOpen(false);
    await logout();
    setBooks([]); setBookCounts(null); setDetail(null); setConfirmState(null); setSessionBoth(null);
    setAuth((a) => ({ ...a, authed: false, user: null }));
  };
  const [panelShow, setPanelShow] = useState(false); // el panel se revela al llegar el libro
  const [vtId, setVtId] = useState(null);             // único libro con viewTransitionName en el estante
  const reflowRef = useRef(0);

  const showToast = (kind, title, note = '') => {
    setToast({ id: ++toastKey.current, kind, title: title || (kind === 'add' ? t("Libro", "Book") : t("El libro", "The book")), note });
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
  }, [theme]);
  useEffect(() => {
    if (auth?.authed) savePreferences(auth.user, { theme, view, section, perRow: preferredPerRow });
  }, [auth?.authed, auth?.user, theme, view, section, preferredPerRow]);
  useEffect(() => { sectionRef.current = section; }, [section]);
  const changeSection = (s) => {
    if (s === sectionRef.current) { goLibrary(); return; }
    sectionRef.current = s;
    setSection(s);
    goLibrary(); // cada sección es su propio estante: se vuelve a la balda correspondiente
  };
  const cycleTheme = () => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);
  const setPerRow = (v) => {
    const n = clampPerRow(v, maxPerRow);
    setPerRowState(n);
  };
  const reflowBooks = (update) => {
    const token = ++reflowRef.current;
    document.documentElement.classList.add('book-reflow');
    const transition = vtx(update);
    const finish = () => {
      if (token === reflowRef.current) document.documentElement.classList.remove('book-reflow');
    };
    if (transition) transition.finished.then(finish, finish);
    else finish();
  };

  // ---- datos ----
  const refresh = useCallback(async () => {
    const requestedSection = sectionRef.current;
    const request = ++booksRequest.current;
    try {
      const [result, counts] = await Promise.all([
        api(`/api/books?section=${requestedSection}`), api('/api/books/counts'),
      ]);
      if (request === booksRequest.current && requestedSection === sectionRef.current) {
        setBooks(result);
        setBookCounts(counts);
      }
    } catch { /* deja lo que había */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (auth?.authed) refresh(); }, [refresh, auth?.authed]);
  useEffect(() => { if (auth?.authed) refresh(); }, [section, auth?.authed]); // al cambiar de estante, recargar esa balda

  // vuelve a la biblioteca: sin ficha, sin confirmación, sin sesión
  const goLibrary = () => {
    setConfirmState(null); setDetail(null); setSessionBoth(null); setBusy(null); setFly(null); setPanelShow(false); setVtId(null);
    document.body.classList.remove('typing');
    refresh();
  };

  const closeDetail = () => {
    const returningId = detail?.id || null;
    if (matchMedia('(min-width:900px)').matches) {
      vtx(() => { setVtId(returningId); setDetail(null); setPanelShow(false); setFly(null); });
    } else {
      setDetail(null); setPanelShow(false); setFly(null); setVtId(null);
    }
  };

  const openBook = (b, e) => {
    const el = e && e.currentTarget ? e.currentTarget : null;
    const rect = el ? el.getBoundingClientRect() : null;
    if (matchMedia('(min-width:900px)').matches) {
      // SOLO el libro tocado recibe viewTransitionName antes de la captura: el resto del estante
      // no se extrae a capas ::view-transition y sus sombras nunca parpadean.
      if (el && b.id) el.style.viewTransitionName = `b${b.id}`;
      const prevId = detail?.id || null;
      vtx(() => { setVtId(prevId); setDetail(b); setPanelShow(true); setFly(null); });
    } else {
      // móvil: FlyingBook hace el vuelo 3D directo sin snapshot de View Transition
      setVtId(null);
      setDetail(b);
      setPanelShow(false);
      setFly(rect ? { id: b.id, from: { x: rect.left, y: rect.top, w: rect.width, h: rect.height } } : null);
    }
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
    setBusy({ text: t("leyendo el código…", "reading the barcode…"), modal: false, scan: true });
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
      setBusy({ text: t("leyendo el título de la foto…", "reading the cover title…"), modal: false, scan: true });
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
    setBusy({ text: t("buscando…", "searching…"), modal: !!sessionRef.current?._modal, search: true });
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
    setBusy({ text: t("guardando…", "saving…"), modal });
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
      showToast('add', book ? displayTitle(book) : '');
    } catch (e) { setBusy({ text: `${t('no se pudo guardar', 'could not save')}: ${e.message}`, modal }); }
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
    setBusy({ text: t("subiendo portada…", "uploading cover…"), modal: false });
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
    setBusy({ text: t("eliminando…", "deleting…"), modal: false });
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
    setBusy({ text: t("moviendo…", "moving…"), modal: false });
    try {
      await api(`/api/books/${book.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: to }),
      });
      changeSection(to); // te sigue al estante de destino: ves el libro aterrizar
      showToast('move', displayTitle(book), to === 'buy' ? t("a \"por comprar\"", "to your wishlist") : t("a mi biblioteca", "to your library"));
    } catch { setBusy(null); }
  };
  const editMetadata = async (book, metadata) => {
    try {
      const updated = await api(`/api/books/${book.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(metadata),
      });
      setDetail(updated);
      refresh();
    } catch { /* ignorar */ }
  };

  const refreshSynopsis = async (book) => {
    const result = await api(`/api/books/${book.id}/synopsis`, { method: 'POST' });
    if (result.book) { setDetail(result.book); refresh(); }
    return result.found;
  };

  const setLoan = async (book, borrower) => {
    const updated = await api(`/api/books/${book.id}/loan`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ borrower }),
    });
    setDetail((current) => current?.id === book.id ? updated : current);
    refresh();
  };

  // ---- diálogo «＋» ----
  const openNew = () => { setSessionBoth(null); setConfirmState(null); setBusy(null); setDialogOpen(true); };
  const dismissDialog = () => { setDialogOpen(false); setSessionBoth(null); setConfirmState(null); setBusy(null); };
  const searchFromDialog = (text) => {
    setSessionBoth({ file: null, strip: { color: null, present: false, mirrored: false }, ticket: null, isbn: null, meta: null, sources: [], existing: [], manual: true, entry: text, _modal: true });
    setBusy({ text: t("buscando…", "searching…"), modal: true, search: true }); // el resultado vive EN el modal (sin página intermedia)
    submitManual(text);
  };
  const backToStart = () => { setSessionBoth(null); setConfirmState(null); setBusy(null); setDialogOpen(true); };
  const doneExisting = () => { if (sessionRef.current?._modal) setDialogOpen(false); goLibrary(); };

  const selectOnlineCover = async (book, ed) => {
    try {
      const r = await api(`/api/books/${book.id}/select-cover`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cover_url: ed.cover_url, publisher: ed.publisher || book.publisher }),
      });
      if (r.book) setDetail(r.book);
      refresh();
      showToast('info', displayTitle(book), ed.publisher ? `${t('Portada', 'Cover')} · ${ed.publisher}` : t("¡portada actualizada!", "cover updated!"));
    } catch {
      showToast('info', displayTitle(book), t("no se pudo aplicar la portada", "could not apply the cover"));
    }
  };

  const modal = !!session?._modal;
  const mainBusy = busy && !busy.modal;
  const dialogBusy = busy && busy.modal;

  // Puerta de acceso: sin sesión (y con auth configurada) solo se ve la pantalla de entrada.
  if (auth === null) return null;
  if (auth.required && !auth.authed) return <Login mail={auth.mail} turnstileSiteKey={auth.turnstileSiteKey} />;

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
        <ShelfView books={books} perRow={perRow} onOpen={openBook} onAddCover={addCoverTo} buy={section === 'buy'} holeId={holeId} vtId={vtId} />
        <div className="empty-cta">
          <button type="button" className="btn" onClick={pickPhoto}>
            {section === 'buy' ? t("Escanear un libro para comprar", "Scan a book to buy") : t("Escanear un libro", "Scan a book")}
          </button>
          <div className="gest">{t("una foto → ISBN → listo", "one photo → ISBN → done")}</div>
        </div>
      </>
    ) : <EmptyShelf onScan={pickPhoto} buy={section === 'buy'} />)
    : view === 'shelf'
      ? <ShelfView books={books} perRow={perRow} onOpen={openBook} onAddCover={addCoverTo} buy={section === 'buy'} holeId={holeId} vtId={vtId} />
      : <GridView books={books} onOpen={openBook} onAddCover={addCoverTo} holeId={holeId} vtId={vtId} />;

  return (
    <>
      <Header
        view={view} onView={(v) => reflowBooks(() => setView(v))}
        theme={theme} onCycleTheme={cycleTheme}
        section={section} onSection={changeSection} bookCounts={bookCounts}
        perRow={perRow} maxPerRow={maxPerRow} onPerRow={(v) => reflowBooks(() => setPerRow(v))}
        onAdd={openNew}
        onLogout={() => setLogoutOpen(true)}
        user={auth.user}
      />

      <main>
        <HomeScreenGuide />
        {mainBusy ? (busy.scan
          ? <div className="scanwrap"><ScanFrame label={busy.text} /></div>
          : busy.search
            ? <div className="scanwrap"><SearchLoader label={busy.text} /></div>
            : <div className="spin">{busy.text}</div>)
          : confirmState && !modal ? <ConfirmPanel {...confirmProps} modal={false} onBack={() => vtx(goLibrary)} />
          : (
            // La columna de la ficha está SIEMPRE reservada: el mueble no se recoloca al abrir
            // un libro. Si se movía, la sombra del estante viajaba en la transición y parpadeaba.
            <div className="split">
              <div className="split-shelf">{libraryView}</div>
              {detail
                ? <BookDetail key={detail.id} book={detail} visible={panelShow} onBack={closeDetail} onAddCover={addCoverTo} onDelete={setDeleteTarget} onMove={(book, to) => setMoveTarget({ book, to })} onSelectCover={selectOnlineCover} onEditMetadata={editMetadata} onRefreshSynopsis={refreshSynopsis} onSetLoan={setLoan} />
                : <aside className="detail-panel" aria-hidden="true" />}
            </div>
          )}
      </main>

      <div className="room-floor" aria-hidden="true" />

      {panelShow && <div className="panel-fade" onClick={closeDetail} aria-hidden="true" />}
      {fly && <FlyingBook key={fly.id} book={detail} fly={fly} onArrive={() => setPanelShow(true)} onDone={() => setFly(null)} />}

      <button className="fab" aria-label={t("Escanear un libro", "Scan a book")} onClick={openNew}><Icon name="plus" /></button>

      {toast && (
        <div className="toast" role="status">
          <span aria-hidden="true">{toast.kind === 'add' ? '🎉' : toast.kind === 'remove' ? '🗑️' : toast.kind === 'remove-fail' ? '⚠️' : toast.kind === 'info' ? '🖼️' : '⇄'}</span>
          {toast.kind === 'add' ? <span><b>{toast.title}</b> {t('registrado!', 'added!')}</span>
            : toast.kind === 'remove' ? <span><b>{toast.title}</b> {t('eliminado', 'deleted')}</span>
            : toast.kind === 'remove-fail' ? <span>{t("no se pudo eliminar · inténtalo de nuevo", "could not delete · try again")}</span>
            : toast.kind === 'info' ? <span><b>{toast.title}</b> — {toast.note}</span>
            : <span><b>{toast.title}</b> → {toast.note}</span>}
        </div>
      )}
      {toast?.kind === 'add' && <Burst3D key={toast.id} />}

      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="filehidden"
        onChange={(e) => onPhoto(e.target.files[0])} />
      <input ref={coverRef} type="file" accept="image/*" className="filehidden"
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

      {moveTarget && (
        <MoveDialog
          book={moveTarget.book}
          to={moveTarget.to}
          onCancel={() => setMoveTarget(null)}
          onMove={() => { const target = moveTarget; setMoveTarget(null); moveSection(target.book, target.to); }}
        />
      )}

      <dialog ref={logoutRef} className="logout-dlg" aria-labelledby="logout-title" onClose={() => setLogoutOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setLogoutOpen(false); }}>
        <div className="nd">
          <h2 id="logout-title" className="nd-title">{t("Cerrar sesión", "Log out")}</h2>
          <p className="del-book">
            {t('¿Seguro que quieres salir de tu biblioteca', 'Log out of your library')}{auth.user ? <> (<b>{auth.user}</b>)</> : ''}?
            {' '}{t('Tendrás que pedir un nuevo enlace para volver a entrar.', 'You’ll need a new login link to sign in again.')}
          </p>
          <div className="actions">
            <button type="button" className="btn danger" onClick={doLogout}><Icon name="logout" />{t("Sí, cerrar sesión", "Yes, log out")}</button>
            <button type="button" className="btn ghost" onClick={() => setLogoutOpen(false)} autoFocus>{t("Cancelar", "Cancel")}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
