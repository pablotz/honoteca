import { useEffect, useRef } from 'react';
import { displayTitle } from '../lib/book.js';

// Confirmación de borrado. `copies > 1` → dos acciones: quitar solo este ejemplar o
// eliminar el título completo (todos sus renglones del ISBN).
export default function DeleteDialog({ book, onCancel, onRemoveOne, onRemoveAll }) {
  const dlgRef = useRef(null);
  const title = displayTitle(book);
  const copies = book.copies || 1;

  useEffect(() => {
    const d = dlgRef.current;
    if (!d) return;
    d.showModal();
    return () => d.close();
  }, []);

  return (
    <dialog ref={dlgRef} onClose={onCancel} onClick={(e) => { if (e.target === dlgRef.current) onCancel(); }}>
      <div className="nd">
        <h2 className="nd-title">Eliminar libro</h2>
        <p className="del-book">¿Eliminar <b>{title}</b> de la biblioteca?
          {copies > 1 && <> Este título tiene {copies} ejemplares en el estante.</>}</p>
        <div className="actions">
          {copies > 1 ? (
            <>
              <button type="button" className="btn danger" onClick={onRemoveOne}>Quitar solo este ejemplar</button>
              <button type="button" className="btn ghost danger" onClick={onRemoveAll}>Eliminar libro completo ({copies})</button>
            </>
          ) : (
            <button type="button" className="btn danger" onClick={onRemoveOne}>Eliminar libro</button>
          )}
          <button type="button" className="btn ghost" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </dialog>
  );
}