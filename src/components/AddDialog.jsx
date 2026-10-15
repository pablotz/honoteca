import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import ScanFrame from './ScanFrame.jsx';
import Icon from './Icon.jsx';

// Diálogo «＋»: escanear o buscar directo (título/ISBN). El resultado de la búsqueda vive
// EN el modal (sin página intermedia) — ver `showResult` + children (ConfirmPanel).
export default function AddDialog({ open, showResult, children, onDismiss, onScan, onSearch }) {
  const dlgRef = useRef(null);
  const titleRef = useRef(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const d = dlgRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => { if (open) setQ(''); }, [open]);

  const submit = () => {
    const raw = q.trim();
    if (!raw) { titleRef.current?.focus(); return; }
    onSearch(raw);
  };

  return (
    <dialog
      ref={dlgRef}
      onClose={onDismiss}
      onClick={(e) => { if (e.target === dlgRef.current) onDismiss(); }}
    >
      <div className="nd">
        {showResult ? children : (
          <>
            <h2 className="nd-title">{t("Agregar un libro", "Add a book")}</h2>
            <button type="button" className="card scan-card" onClick={onScan}>
              <ScanFrame mini />
              <span className="scan-card-txt">
                <span className="card-t">{t("Escanear el lomo", "Scan a book")}</span>
                <span className="card-d">{t("una foto del código de barras → datos, portada y sinopsis solos", "one barcode photo → details, cover and synopsis")}</span>
              </span>
            </button>
            <div className="nd-search">
              <label htmlFor="newTitle">{t("…o búscalo por nombre o ISBN", "…or search by title or ISBN")}</label>
              <div className="nd-row">
                <input
                  id="newTitle" className="input" placeholder={t("ej. Hábitos atómicos", "e.g. Atomic Habits")} autoComplete="off"
                  ref={titleRef} value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                />
                <button type="button" className="btn" onClick={submit}><Icon name="search" />{t("Buscar", "Search")}</button>
              </div>
              <p className="nd-hint">{t("Sirve el título del libro o un ISBN de 10/13 dígitos.", "Use a book title or a 10/13-digit ISBN.")}</p>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
