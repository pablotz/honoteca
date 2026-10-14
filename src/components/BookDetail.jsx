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
    <aside className={`detail-panel${visible ? ' show' : ''}`} aria-label={`Ficha de ${ttl}`}>
      <button type="button" className="panel-close" onClick={onBack} title="Volver al estante" aria-label="Cerrar y volver al estante">✕</button>

      <div className="pane" key={book.id}>
        <h2 className="ptitle" ref={titleRef}>{ttl}</h2>
        <span className="prule" aria-hidden="true" />
        <div className="pmeta">
          {au && <div className="pauthor">{au}</div>}
          {editPub ? (
            <input
              className="input pub-input"
              placeholder="Editorial…"
              value={pubVal}
              onChange={(e) => setPubVal(e.target.value)}
              onBlur={savePub}
              onKeyDown={(e) => { if (e.key === 'Enter') savePub(); if (e.key === 'Escape') setEditPub(false); }}
              autoFocus
            />
          ) : (
            <button type="button" className="ppub-btn" onClick={() => setEditPub(true)} title="Cambiar editorial">
              {book.publisher ? <>{book.publisher} <span className="edit-pen">✎</span></> : '+ agregar editorial'}
            </button>
          )}
        </div>

        <Cover3D book={book} style={book.id ? { viewTransitionName: `b${book.id}` } : undefined} />
        {desc && <div className="cv-hint">Toca el libro para ver un adelanto de la sinopsis</div>}
        {desc && (
          <button type="button" className="btn ghost synopsis-read" onClick={() => synopsisRef.current.showModal()}>Leer Sinopsis</button>
        )}

        {desc && (
          <dialog ref={synopsisRef} className="synopsis-dialog" aria-labelledby="synopsis-title" onClick={(e) => { if (e.target === synopsisRef.current) synopsisRef.current.close(); }}>
            <div className="nd">
              <h2 id="synopsis-title" className="nd-title">Sinopsis · {ttl}</h2>
              <div className="synopsis-text" tabIndex={0}>{desc}</div>
              <button type="button" className="btn ghost" onClick={() => synopsisRef.current.close()} autoFocus>Cerrar</button>
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
              <div className="cv-hint">No se hallaron otras portadas online · puedes subir una foto</div>
            )}
            <button type="button" className="btn coverbtn" onClick={() => onAddCover(book.id)}>
              {hasCover ? '＋ subir foto de portada' : '＋ subir portada'}
            </button>
            <button type="button" className="retry-cover" onClick={loadCovers} disabled={loadingCovers}>
              {loadingCovers ? 'buscando ediciones…' : '🖼 elegir portada online'}
            </button>
            <div className="page-foot">
              <button
                type="button" className="btn"
                onClick={() => onMove(book, next)}
                title={book.section === 'buy' ? 'Ya lo compré → mi estante' : 'Mover a «por comprar»'}
              >⇄ Mover</button>
              <button type="button" className="btn danger" onClick={() => onDelete(book)} title="Eliminar este libro">🗑 Eliminar</button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
