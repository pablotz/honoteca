import { displayTitle, displayAuthor, blurbText } from '../lib/book.js';
import Cover3D from './Cover3D.jsx';

// Panel lateral: el libro se "saca" del estante (deja un hueco) y aterriza aquí, a la derecha
// de la biblioteca, con todas sus opciones. Cerrar = volver a la balda (el libro "vuela" al morf).
export default function BookDetail({ book, visible, morph, onBack, onAddCover, onDelete, onMove }) {
  const ttl = displayTitle(book);
  const hasCover = !!(book.cover_front || book.cover_url);
  const au = displayAuthor(book);
  const desc = blurbText(book.description);
  const next = book.section === 'buy' ? 'owned' : 'buy';

  return (
    <aside className={`detail-panel${visible ? ' show' : ''}`} aria-label={`Ficha de ${ttl}`}>
      <button type="button" className="panel-close" onClick={onBack} title="Volver al estante" aria-label="Cerrar y volver al estante">✕</button>

      <h2 className="ptitle">{ttl}</h2>
      {(au || book.publisher) && (
        <div className="dmeta">
          {au && <div className="mline"><span className="mk">Autor</span><span className="mv">{au}</span></div>}
          {book.publisher && <div className="mline"><span className="mk">Editorial</span><span className="mv">{book.publisher}</span></div>}
        </div>
      )}

      <Cover3D book={book} style={morph && book.id ? { viewTransitionName: `b${book.id}` } : undefined} />
      {desc && <div className="cv-hint">Toca o gira el libro: la sinopsis vive en su contraportada</div>}

      {book.id && (
        <>
          <button type="button" className="btn coverbtn" onClick={() => onAddCover(book.id)}>
            {hasCover ? '＋ reemplazar portada' : '＋ subir portada'}
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
    </aside>
  );
}