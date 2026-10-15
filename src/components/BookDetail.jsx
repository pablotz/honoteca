import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import { displayTitle, displayAuthor, blurbText } from '../lib/book.js';
import Cover3D from './Cover3D.jsx';
import CoverCarousel from './CoverCarousel.jsx';
import Icon from './Icon.jsx';

// Ficha FLOTANTE (sin caja): título centrado, línea, autor, libro y botones. El contenedor no
// se mueve: al elegir otro libro solo cambian los VALORES (el bloque hace un fundido suave).
export default function BookDetail({ book, visible, onBack, onAddCover, onDelete, onMove, onSelectCover, onEditMetadata, onRefreshSynopsis, onSetLoan }) {
  const ttl = displayTitle(book);
  const hasCover = !!(book.cover_front || book.cover_url);
  const au = displayAuthor(book);
  const desc = blurbText(book.description, book);
  const next = book.section === 'buy' ? 'owned' : 'buy';
  const [editing, setEditing] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [pubVal, setPubVal] = useState('');
  const [authorVal, setAuthorVal] = useState('');
  const [editions, setEditions] = useState(null); // null = cerrado; [] = sin resultados; [...] = carrusel
  const [loadingCovers, setLoadingCovers] = useState(false);
  const [loadingSynopsis, setLoadingSynopsis] = useState(false);
  const [synopsisStatus, setSynopsisStatus] = useState('');
  const [lending, setLending] = useState(false);
  const [borrower, setBorrower] = useState('');
  const [savingLoan, setSavingLoan] = useState(false);
  const [loanError, setLoanError] = useState(false);
  const synopsisRef = useRef(null);
  const metadataRef = useRef(null);

  useEffect(() => {
    setEditing(false);
    setPubVal(book.publisher || '');
    setAuthorVal((book.authors || []).map((author) => String(author).normalize('NFKC').replace(/\s+/g, ' ').trim()).join('; '));
    setEditions(null);
    setLoadingCovers(false);
  }, [book.id, book.publisher]);

  useEffect(() => {
    const d = metadataRef.current;
    if (editing && !d.open) d.showModal();
    if (!editing && d.open) d.close();
  }, [editing]);

  const loadCovers = async () => {
    if (loadingCovers) return;
    setLoadingCovers(true);
    try {
      const r = await fetch(`/api/books/${book.id}/covers`).then((x) => x.json());
      setEditions(r.editions || []);
    } catch {
      setEditions([]);
    } finally {
      setLoadingCovers(false);
    }
  };

  const saveMetadata = (e) => {
    e.preventDefault();
    setEditing(false);
    const title = titleVal.trim();
    const publisher = pubVal.trim();
    const authors = authorVal.split(/\s*;\s*/).map((author) => author.trim()).filter(Boolean);
    if ((title !== (book.title_native || '') || publisher !== (book.publisher || '') || JSON.stringify(authors) !== JSON.stringify(book.authors || [])) && onEditMetadata) {
      onEditMetadata(book, { title_native: title || null, publisher: publisher || null, authors });
    }
  };

  const saveLoan = async (name) => {
    setSavingLoan(true);
    setLoanError(false);
    try {
      await onSetLoan(book, name);
      setLending(false);
      setBorrower('');
    } catch { setLoanError(true); }
    finally { setSavingLoan(false); }
  };

  // Título: 2 líneas MÁXIMO. Si no cabe, se reduce la fuente (hasta 16px); si aún así sobra, recorta.
  const titleRef = useRef(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.classList.remove('clamp');
    el.style.fontSize = '';
    const maxH = () => parseFloat(getComputedStyle(el).lineHeight) * 2 + 1;
    let size = Math.round(parseFloat(getComputedStyle(el).fontSize)) || 29;
    while (el.scrollHeight > maxH() && size > 16) { size -= 1; el.style.fontSize = size + 'px'; }
    if (el.scrollHeight > maxH()) el.classList.add('clamp');
  }, [book.id, ttl]);

  return (
    <aside className={`detail-panel${visible ? ' show' : ''}`} aria-label={`${t('Ficha de', 'Details for')} ${ttl}`}>
      <button type="button" className="panel-close" onClick={onBack} title={t("Volver al estante", "Back to shelf")} aria-label={t("Cerrar y volver al estante", "Close and return to shelf")}><Icon name="close" /></button>

      <div className="pane" key={book.id}>
        <h2 className="ptitle" ref={titleRef}>{ttl}</h2>
        <span className="prule" aria-hidden="true" />
        <div className="pmeta">
          {au && <div className="pauthor">{au}</div>}
          <div className="ppub">{book.publisher || t("Sin editorial", "No publisher")}</div>
        </div>

        <Cover3D book={book} style={book.id ? { viewTransitionName: `b${book.id}` } : undefined} />
        {desc && (
          <button type="button" className="btn ghost" onClick={() => synopsisRef.current.showModal()}><Icon name="read" />{t("Leer Sinopsis", "Read Synopsis")}</button>
        )}
        {desc && (
          <dialog ref={synopsisRef} className="synopsis-dialog" aria-labelledby="synopsis-title" onClick={(e) => { if (e.target === synopsisRef.current) synopsisRef.current.close(); }}>
            <div className="nd">
              <h2 id="synopsis-title" className="nd-title">{t('Sinopsis', 'Synopsis')} · {ttl}</h2>
              <div className="synopsis-text" tabIndex={0}>{desc}</div>
              <button type="button" className="btn ghost" onClick={() => synopsisRef.current.close()} autoFocus>{t("Cerrar", "Close")}</button>
            </div>
          </dialog>
        )}

        {book.id && (
          <>
            <button type="button" className="btn coverbtn" onClick={() => { setTitleVal(ttl); setPubVal(book.publisher || ''); setAuthorVal((book.authors || []).map((author) => String(author).normalize('NFKC').replace(/\s+/g, ' ').trim()).join('; ')); setEditing(true); }}>
              <Icon name="edit" />{t("Editar datos y portada", "Edit details and cover")}
            </button>
            <dialog ref={metadataRef} className="metadata-dialog" aria-labelledby="metadata-title" onClose={() => setEditing(false)} onClick={(e) => { if (e.target === metadataRef.current) metadataRef.current.close(); }}>
              <form className="nd" onSubmit={saveMetadata}>
                <h2 id="metadata-title" className="nd-title">{t("Editar libro", "Edit book")}</h2>
                <div className="metadata-fields">
                  <label htmlFor="edit-book-title">{t("Título", "Title")}</label>
                  <input id="edit-book-title" className="input" value={titleVal} onChange={(e) => setTitleVal(e.target.value)} maxLength={300} />
                  <label htmlFor="edit-book-authors">{t("Autor(es)", "Author(s)")}</label>
                  <input id="edit-book-authors" className="input" value={authorVal} onChange={(e) => setAuthorVal(e.target.value)} maxLength={300} />
                  <label htmlFor="edit-book-publisher">{t("Editorial", "Publisher")}</label>
                  <input id="edit-book-publisher" className="input" value={pubVal} onChange={(e) => setPubVal(e.target.value)} maxLength={120} />
                </div>
                <div className="metadata-cover-actions">
                  <button type="button" className="retry-cover" onClick={() => { metadataRef.current.close(); onAddCover(book.id); }}><Icon name="upload" />{hasCover ? t("Subir foto de portada", "Upload cover photo") : t("Subir portada", "Upload cover")}</button>
                  <button type="button" className="retry-cover" onClick={loadCovers} disabled={loadingCovers}>
                    <Icon name="image" />{loadingCovers ? t("buscando ediciones…", "finding editions…") : t("Buscar portadas online", "Find online covers")}
                  </button>
                </div>
                {editions?.length > 0 && <CoverCarousel editions={editions} selectedUrl={book.cover_url} onSelect={(ed) => onSelectCover && onSelectCover(book, ed)} />}
                {editions?.length === 0 && <div className="cv-hint">{t("No se hallaron otras portadas online", "No other online covers found")}</div>}
                <div className="synopsis-refresh">
                  <button type="button" className="retry-cover" disabled={loadingSynopsis} onClick={async () => {
                    setLoadingSynopsis(true);
                    setSynopsisStatus('');
                    try { setSynopsisStatus(await onRefreshSynopsis(book) ? 'found' : 'missing'); }
                    catch { setSynopsisStatus('error'); }
                    finally { setLoadingSynopsis(false); }
                  }}><Icon name="read" />{loadingSynopsis ? t('Buscando sinopsis…', 'Searching synopsis…') : t('Buscar / actualizar sinopsis', 'Find / refresh synopsis')}</button>
                  {synopsisStatus && <span role="status">{synopsisStatus === 'found' ? t('Sinopsis actualizada', 'Synopsis updated') : synopsisStatus === 'missing' ? t('No se encontró sinopsis; puedes volver a intentarlo.', 'No synopsis found; you can try again.') : t('No se pudo buscar la sinopsis.', 'Could not search for a synopsis.')}</span>}
                </div>
                <div className="metadata-footer">
                  <button type="submit" className="btn"><Icon name="edit" />{t("Guardar datos", "Save details")}</button>
                  <button type="button" className="btn ghost" onClick={() => metadataRef.current.close()}>{t("Cerrar", "Close")}</button>
                </div>
              </form>
            </dialog>
            {book.section !== 'buy' && <div className="loan-controls">
              {book.loaned_to ? <>
                <p className="loan-summary"><Icon name="move" /><span>{t('Prestado a', 'Lent to')} <strong>{book.loaned_to}</strong>{book.loaned_at && <small>{t('Desde', 'Since')} {new Date(book.loaned_at).toLocaleDateString()}</small>}</span></p>
                <button type="button" className="retry-cover" disabled={savingLoan} onClick={() => saveLoan(null)}>{savingLoan ? t('Guardando…', 'Saving…') : t('Marcar devuelto', 'Mark returned')}</button>
              </> : lending ? <form className="loan-form" aria-busy={savingLoan} onSubmit={(e) => { e.preventDefault(); if (borrower.trim()) saveLoan(borrower.trim()); }}>
                  <label htmlFor="loan-borrower">{t('¿A quién se lo prestaste?', 'Who did you lend it to?')}</label>
                  <div className="loan-form-row">
                    <input id="loan-borrower" className="input" value={borrower} onChange={(e) => setBorrower(e.target.value)} maxLength={120} required autoFocus />
                    <button type="submit" className="btn" disabled={savingLoan || !borrower.trim()} aria-label={t('Guardar préstamo', 'Save loan')} title={t('Guardar préstamo', 'Save loan')}><Icon name="check" /></button>
                    <button type="button" className="btn ghost" disabled={savingLoan} aria-label={t('Cancelar', 'Cancel')} title={t('Cancelar', 'Cancel')} onClick={() => { setLending(false); setLoanError(false); }}><Icon name="close" /></button>
                  </div>
                </form> : <button type="button" className="retry-cover" onClick={() => { setLoanError(false); setLending(true); }}><Icon name="move" />{t('Prestar libro', 'Lend book')}</button>}
              {loanError && <p role="alert">{t('No se pudo guardar el préstamo. Inténtalo de nuevo.', 'Could not save the loan. Please try again.')}</p>}
            </div>}
            {!lending && <div className="page-foot">
              <button
                type="button" className="btn"
                disabled={!!book.loaned_to}
                onClick={() => onMove(book, next)}
                title={book.loaned_to ? t('Marca el libro como devuelto antes de moverlo', 'Mark the book returned before moving it') : book.section === 'buy' ? t("Ya lo compré → mi estante", "Bought it → my shelf") : t("Mover a «por comprar»", "Move to wishlist")}
              ><Icon name="move" />{t("Mover", "Move")}</button>
              <button type="button" className="btn danger" onClick={() => onDelete(book)} title={t("Eliminar este libro", "Delete this book")}><Icon name="trash" />{t("Eliminar", "Delete")}</button>
            </div>}
          </>
        )}
      </div>
    </aside>
  );
}
