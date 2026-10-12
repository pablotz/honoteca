import { useEffect, useRef, useState } from 'react';
import ScanFrame from './ScanFrame.jsx';

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
            <h2 className="nd-title">Agregar un libro</h2>
            <button type="button" className="card scan-card" onClick={onScan}>
              <ScanFrame mini />
              <span className="scan-card-txt">
                <span className="card-t">Escanear el lomo</span>
                <span className="card-d">una foto del código de barras → datos, portada y sinopsis solos</span>
              </span>
            </button>
            <div className="nd-search">
              <label htmlFor="newTitle">…o búscalo por nombre o ISBN</label>
              <div className="nd-row">
                <input
                  id="newTitle" className="input" placeholder="ej. Hábitos atómicos" autoComplete="off"
                  ref={titleRef} value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                />
                <button type="button" className="btn" onClick={submit}>Buscar</button>
              </div>
              <p className="nd-hint">Sirve el título del libro o un ISBN de 10/13 dígitos.</p>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
