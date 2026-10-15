import { t } from '../lib/i18n.js';
import { useEffect, useRef } from 'react';
import { displayTitle } from '../lib/book.js';
import Icon from './Icon.jsx';

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
        <h2 className="nd-title">{t("Eliminar libro", "Delete book")}</h2>
        <p className="del-book">{t('¿Eliminar', 'Delete')} <b>{title}</b> {t('de la biblioteca?', 'from your library?')}
          {copies > 1 && <> {t('Ejemplares de este título en el estante:', 'Copies of this title on your shelf:')} {copies}.</>}</p>
        <div className="actions">
          {copies > 1 ? (
            <>
              <button type="button" className="btn danger" onClick={onRemoveOne}><Icon name="trash" />{t("Quitar solo este ejemplar", "Remove this copy")}</button>
              <button type="button" className="btn ghost danger" onClick={onRemoveAll}><Icon name="trash" />{t('Eliminar libro completo', 'Delete all copies')} ({copies})</button>
            </>
          ) : (
            <button type="button" className="btn danger" onClick={onRemoveOne}><Icon name="trash" />{t("Eliminar libro", "Delete book")}</button>
          )}
          <button type="button" className="btn ghost" onClick={onCancel}>{t("Cancelar", "Cancel")}</button>
        </div>
      </div>
    </dialog>
  );
}
