import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n.js';
import { displayTitle } from '../lib/book.js';
import Icon from './Icon.jsx';

export default function MoveDialog({ book, to, onCancel, onMove }) {
  const dlgRef = useRef(null);
  const destination = to === 'buy' ? t('por comprar', 'your wishlist') : t('mi estante', 'your shelf');

  useEffect(() => {
    const dialog = dlgRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dlgRef} onClose={onCancel} onClick={(e) => { if (e.target === dlgRef.current) onCancel(); }}>
      <div className="nd">
        <h2 className="nd-title">{t('Mover libro', 'Move book')}</h2>
        <p className="del-book">{t('¿Mover', 'Move')} <b>{displayTitle(book)}</b> {t('a', 'to')} <b>{destination}</b>?</p>
        <div className="actions">
          <button type="button" className="btn" onClick={onMove}><Icon name="move" />{t('Sí, mover', 'Yes, move')}</button>
          <button type="button" className="btn ghost" onClick={onCancel} autoFocus>{t('Cancelar', 'Cancel')}</button>
        </div>
      </div>
    </dialog>
  );
}
