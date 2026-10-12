import { useRef, useState } from 'react';
import Tile from './Tile.jsx';
import SourcesReport from './SourcesReport.jsx';
import ScanFrame from './ScanFrame.jsx';
import { displayAuthor, fmtIsbn, locText } from '../lib/book.js';
import { copyText } from '../lib/clipboard.js';

// ISBN: siempre visible y copiable con un toque (no re-tipear 13 dígitos)
function IsbnChip({ isbn }) {
  const [label, setLabel] = useState(fmtIsbn(isbn));
  return (
    <button
      type="button" className="chip" title="tap to copy"
      onClick={async () => {
        const ok = await copyText(String(isbn || ''));
        setLabel(ok ? 'copied ✓' : fmtIsbn(isbn));
        if (ok) setTimeout(() => setLabel(fmtIsbn(isbn)), 1300);
      }}
    >{label}</button>
  );
}

// Flujo de escaneo + confirmación (4 estados A/B/C/D). Presentacional: la lógica vive en App.
export default function ConfirmPanel({
  session, state, modal, entry, onEntry,
  onBack, onRetake, onPickCover, onCommit, onProposal, onSearchTitle, onManual, onEditManual, onDone,
}) {
  const entryRef = useRef(null);
  const m = session.meta;
  const e0 = session.existing && session.existing[0];

  // tile de confirmación: título/sinopsis de meta (o del ejemplar existente), sin portada → generada
  const confirmBook = {
    title_native: (m && m.title_native) || (e0 && e0.title_native) || session.typed || null,
    isbn: session.isbn,
    strip_color: session.strip.color, strip_present: session.strip.present,
    cover_front: (m && m.cover_front) || null,
    cover_url: (m && m.cover_url) || (e0 && e0.cover_url) || null, needs_review: false,
  };

  let heading, headingCls = '';
  if (state === 'A' || state === 'D') heading = (m && m.title_native) || (e0 && e0.title_native) || '';
  else if (state === 'B') { headingCls = 'none'; heading = session.manual ? 'Escribe el ISBN o el título' : 'No se leyó el código'; }
  else {
    headingCls = 'none';
    heading = session.isbn ? 'Sin match en la base' : (session.entry ? 'Título detectado · verifica' : 'Sin ISBN · escríbelo o usa ＋ portada');
  }

  const src = m || e0;
  const au = state === 'A' || state === 'D' ? displayAuthor({ authors: src && src.authors }) : '';

  const again = session.ticket ? { label: 'Volver a tomar', kind: 'seco', run: onRetake } : null;
  const withAgain = again ? [again] : [];
  const actions = {
    A: [
      { label: 'Sí, es este', kind: 'primary', run: () => onCommit('A', 'create', onProposal()) },
      { label: 'Corregir', kind: 'seco', run: onEditManual },
      ...withAgain,
    ],
    B: [{ label: 'Buscar', kind: 'primary', run: () => onManual(entry) }, ...withAgain],
    C: [
      { label: 'Buscar por título', kind: 'primary', run: () => { const q = entry.trim(); return q ? onSearchTitle(q) : entryRef.current?.focus(); } },
      { label: 'Poner título a mano', kind: 'seco', run: () => { const v = entry.trim(); if (!v) { entryRef.current?.focus(); return; } onCommit('C', 'create', { ...onProposal(), title_native: v }); } },
      { label: 'Guardar sin título', kind: 'seco', run: () => onCommit('C', 'create', onProposal()) },
      ...withAgain,
    ],
    D: [
      { label: 'Ya lo tengo', kind: 'primary', run: onDone },
      { label: 'Es otro ejemplar · suma una copia', kind: 'seco', run: () => onCommit('D', 'create', onProposal()) },
    ],
  }[state] || [];

  return (
    <div className="confirm">
      <button type="button" className="btn ghost back" onClick={onBack}>
        {modal ? '‹ Nueva búsqueda' : '‹ Biblioteca'}
      </button>
      <div className="cframe">
        <Tile book={confirmBook} className="ctile" />
        <div className="cmeta">
          <h2 className={headingCls || undefined}>{heading}</h2>
          {state === 'B' && <div className="scan-row"><ScanFrame mini empty /></div>}
          {au && <div className="a">{au}</div>}
          {state !== 'B' && state !== 'C' && m && m.series && <div className="a">{m.series}</div>}
          {session.isbn && (
            <div className="chiprow">
              <span className="muted">ISBN</span>
              <IsbnChip isbn={session.isbn} />
            </div>
          )}
          {state === 'C' && <SourcesReport sources={session.sources} />}
        </div>
      </div>

      {state === 'D' && (
        <div className="who">
          Ya tienes {session.existing.length} ejemplar(es):{' '}
          {session.existing.map((e) => (e.location ? `${locText(e.location)}${e.needs_review ? ' (revisar)' : ''}` : 'sin ubicación')).join(' · ')}
        </div>
      )}

      {(state === 'B' || state === 'C') && (
        <>
          <input
            ref={entryRef} className="input" id="entry"
            placeholder={state === 'B' ? (session.manual ? 'escribe el ISBN o el título' : 'escribe el ISBN (13 dígitos)') : 'título'}
            value={entry}
            onChange={(e) => onEntry(e.target.value)}
            onFocus={() => document.body.classList.add('typing')}
            onBlur={() => document.body.classList.remove('typing')}
            autoFocus
          />
          {state === 'B' && session.badIsbn && (
            <div className="muted" style={{ fontSize: '12.5px', marginTop: '6px', color: 'var(--mustard)' }}>
              el último dígito no cuadra (verifica el ISBN)
            </div>
          )}
        </>
      )}

      {state === 'C' && (
        <>
          <button type="button" className="btn ghost" onClick={onPickCover}>
            {session.cover ? '＋ otra portada' : '＋ portada (lee el título)'}
          </button>
          {session.coverUrl && <img className="cvthumb" alt="portada" src={session.coverUrl} />}
        </>
      )}

      <div className="actions">
        {actions.map((a) => (
          <button key={a.label} type="button" className={`btn${a.kind === 'primary' ? '' : ' ghost'}`} onClick={a.run}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
