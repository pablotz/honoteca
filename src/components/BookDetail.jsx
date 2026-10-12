import { useEffect, useRef } from 'react';
import { displayTitle, displayAuthor, blurbText } from '../lib/book.js';
import Cover3D from './Cover3D.jsx';

// Ficha FLOTANTE (sin caja): título centrado, línea, autor, libro y botones. El contenedor no
// se mueve: al elegir otro libro solo cambian los VALORES (el bloque hace un fundido suave).
export default function BookDetail({ book, visible, onBack, onAddCover, onDelete, onMove, onRetryCover }) {
  const ttl = displayTitle(book);
  const hasCover = !!(book.cover_front || book.cover_url);
  const au = displayAuthor(book);
  const desc = blurbText(book.description);
  const next = book.section === 'buy' ? 'owned' : 'buy';

  // Título: 2 líneas MÁXIMO. Si no cabe, se reduce la fuente (hasta 16px); si aún así sobra, recorta.
  const titleRef = useRef(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.classList.remove('clamp');
    el.style.fontSize = '';
    const maxH = () => parseFloat(getComputedStyle(el).lineHeight) * 2 + 1;
    let size = 29;
    el.style.fontSize = size + 'px';
    while (el.scrollHeight > maxH() && size > 16) { size -= 1; el.style.fontSize = size + 'px'; }
    if (el.scrollHeight > maxH()) el.classList.add('clamp');
  }, [book.id, ttl]);

  return (
    <aside className={`detail-panel${visible ? ' show' : ''}`} aria-label={`Ficha de ${ttl}`}>
      <button type="button" className="panel-close" onClick={onBack} title="Volver al estante" aria-label="Cerrar y volver al estante">✕</button>

      <div className="pane" key={book.id}>
        <h2 className="ptitle" ref={titleRef}>{ttl}</h2>
        <span className="prule" aria-hidden="true" />
        {(au || book.publisher) && (
          <div className="pmeta">
            {au && <div className="pauthor">{au}</div>}
            {book.publisher && <div className="ppub">{book.publisher}</div>}
          </div>
        )}

        <Cover3D book={book} style={book.id ? { viewTransitionName: `b${book.id}` } : undefined} />
        {desc && <div className="cv-hint">Toca o gira el libro: la sinopsis vive en su contraportada</div>}

        {book.id && (
          <>
            <button type="button" className="btn coverbtn" onClick={() => onAddCover(book.id)}>
              {hasCover ? '＋ reemplazar portada' : '＋ subir portada'}
            </button>
            {!hasCover && book.isbn && (
              <button type="button" className="retry-cover" onClick={() => onRetryCover(book)}>＋ intentar portada online</button>
            )}
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