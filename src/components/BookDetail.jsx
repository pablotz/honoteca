import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import { displayTitle, displayAuthor, blurbText } from '../lib/book.js';
import Cover3D from './Cover3D.jsx';
import CoverCarousel from './CoverCarousel.jsx';

// Ficha FLOTANTE (sin caja): título centrado, línea, autor, libro y botones. El contenedor no
// se mueve: al elegir otro libro solo cambian los VALORES (el bloque hace un fundido suave).
export default function BookDetail({ book, visible, onBack, onAddCover, onDelete, onMove, onSelectCover, onEditPublisher }) {
  const ttl = displayTitle(book);
  const hasCover = !!(book.cover_front || book.cover_url);
  const au = displayAuthor(book);
  const desc = blurbText(book.description, book);
  const next = book.section === 'buy' ? 'owned' : 'buy';
  const [editPub, setEditPub] = useState(false);
  const [pubVal, setPubVal] = useState(book.publisher || '');
  const [editions, setEditions] = useState(null); // null = cerrado; [] = sin resultados; [...] = carrusel
  const [loadingCovers, setLoadingCovers] = useState(false);
  const synopsisRef = useRef(null);

  useEffect(() => {
    setEditPub(false);
    setPubVal(book.publisher || '');
    setEditions(null);
    setLoadingCovers(false);
  }, [book.id, book.publisher]);

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

  const savePub = () => {
    setEditPub(false);
    const trimmed = pubVal.trim();
    if (trimmed !== (book.publisher || '') && onEditPublisher) onEditPublisher(book, trimmed || null);
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
      <button type="button" className="panel-close" onClick={onBack} title={t("Volver al estante", "Back to shelf")} aria-label={t("Cerrar y volver al estante", "Close and return to shelf")}>✕</button>

      <div className="pane" key={book.id}>
        <h2 className="ptitle" ref={titleRef}>{ttl}</h2>
        <span className="prule" aria-hidden="true" />
        <div className="pmeta">
          {au && <div className="pauthor">{au}</div>}
          {editPub ? (
            <input
              className="input pub-input"
              placeholder={t("Editorial…", "Publisher…")}
              value={pubVal}
              onChange={(e) => setPubVal(e.target.value)}
              onBlur={savePub}
              onKeyDown={(e) => { if (e.key === 'Enter') savePub(); if (e.key === 'Escape') setEditPub(false); }}
              autoFocus
            />
          ) : (
            <button type="button" className="ppub-btn" onClick={() => setEditPub(true)} title={t("Cambiar editorial", "Edit publisher")}>
              {book.publisher ? <>{book.publisher} <span className="edit-pen">✎</span></> : t("+ agregar editorial", "+ add publisher")}
            </button>
          )}
        </div>

        <Cover3D book={book} style={book.id ? { viewTransitionName: `b${book.id}` } : undefined} />
        {desc && <div className="cv-hint">{t("Toca el libro para ver un adelanto de la sinopsis", "Tap the book for a synopsis preview")}</div>}
        {desc && (
          <button type="button" className="btn ghost synopsis-read" onClick={() => synopsisRef.current.showModal()}>{t("Leer Sinopsis", "Read Synopsis")}</button>
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
            {editions && editions.length > 0 && (
              <CoverCarousel
                editions={editions}
                selectedUrl={book.cover_url}
                onSelect={(ed) => onSelectCover && onSelectCover(book, ed)}
              />
            )}
            {editions && editions.length === 0 && (
              <div className="cv-hint">{t("No se hallaron otras portadas online · puedes subir una foto", "No other covers found online · you can upload a photo")}</div>
            )}
            <button type="button" className="btn coverbtn" onClick={() => onAddCover(book.id)}>
              {hasCover ? t("＋ subir foto de portada", "＋ upload cover photo") : t("＋ subir portada", "＋ upload cover")}
            </button>
            <button type="button" className="retry-cover" onClick={loadCovers} disabled={loadingCovers}>
              {loadingCovers ? t("buscando ediciones…", "finding editions…") : t("🖼 elegir portada online", "🖼 choose online cover")}
            </button>
            <div className="page-foot">
              <button
                type="button" className="btn"
                onClick={() => onMove(book, next)}
                title={book.section === 'buy' ? t("Ya lo compré → mi estante", "Bought it → my shelf") : t("Mover a «por comprar»", "Move to wishlist")}
              >{t("⇄ Mover", "⇄ Move")}</button>
              <button type="button" className="btn danger" onClick={() => onDelete(book)} title={t("Eliminar este libro", "Delete this book")}>{t("🗑 Eliminar", "🗑 Delete")}</button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
