import { t } from '../lib/i18n.js';
import { useRef, useState } from 'react';
import Tile from './Tile.jsx';
import SourcesReport from './SourcesReport.jsx';
import ScanFrame from './ScanFrame.jsx';
import CoverCarousel from './CoverCarousel.jsx';
import { displayAuthor, displayTitle, fmtIsbn, locText } from '../lib/book.js';
import { copyText } from '../lib/clipboard.js';

// ISBN: siempre visible y copiable con un toque (no re-tipear 13 dígitos)
function IsbnChip({ isbn }) {
  const [label, setLabel] = useState(fmtIsbn(isbn));
  return (
    <button
      type="button" className="chip" title={t("toca para copiar", "tap to copy")}
      onClick={async () => {
        const ok = await copyText(String(isbn || ''));
        setLabel(ok ? t("copiado ✓", "copied ✓") : fmtIsbn(isbn));
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
  const [pub, setPub] = useState(() => (m && m.publisher) || (e0 && e0.publisher) || '');
  const [chosenCover, setChosenCover] = useState(() => (m && m.cover_url) || (e0 && e0.cover_url) || null);
  const [editingPub, setEditingPub] = useState(false);
  const pubOptions = (m && m.publishers) || [];
  const editions = (m && m.editions) || [];

  const withPub = (base) => {
    const out = { ...base, publisher: pub.trim() || base.publisher || null };
    if (chosenCover && chosenCover !== (m && m.cover_url)) {
      out.cover_url = chosenCover;
      out.cover_front = null; // la portada elegida en el carrusel manda sobre la cacheada del ISBN
    } else if (chosenCover && !out.cover_front) {
      out.cover_url = chosenCover;
    }
    return out;
  };

  // tile de confirmación: título/sinopsis de meta (o del ejemplar existente), sin portada → generada
  const confirmBook = {
    title_native: (m && m.title_native) || (e0 && e0.title_native) || session.typed || null,
    isbn: session.isbn,
    strip_color: session.strip.color, strip_present: session.strip.present,
    cover_front: chosenCover && chosenCover !== (m && m.cover_url) ? null : ((m && m.cover_front) || null),
    cover_url: chosenCover || (m && m.cover_url) || (e0 && e0.cover_url) || null, needs_review: false,
  };

  let heading, headingCls = '';
  if (state === 'A' || state === 'D') heading = displayTitle(m || e0 || {});
  else if (state === 'B') { headingCls = 'none'; heading = session.manual ? t("Escribe el ISBN o el título", "Enter the ISBN or title") : t("No se leyó el código", "Barcode not read"); }
  else {
    headingCls = 'none';
    heading = session.isbn ? t("Sin match en la base", "No catalog match") : (session.entry ? t("Título detectado · verifica", "Title detected · check it") : t("Sin ISBN · escríbelo o usa ＋ portada", "No ISBN · enter it or use ＋ cover"));
  }

  const src = m || e0;
  const au = state === 'A' || state === 'D' ? displayAuthor({ authors: src && src.authors }) : '';

  const again = session.ticket ? { label: t("Volver a tomar", "Retake photo"), kind: 'seco', run: onRetake } : null;
  const withAgain = again ? [again] : [];
  const actions = {
    A: [
      { label: t("Sí, es este", "Yes, this one"), kind: 'primary', run: () => onCommit('A', 'create', withPub(onProposal())) },
      { label: t("Corregir", "Correct details"), kind: 'seco', run: onEditManual },
      ...withAgain,
    ],
    B: [{ label: t("Buscar", "Search"), kind: 'primary', run: () => onManual(entry) }, ...withAgain],
    C: [
      { label: t("Buscar por título", "Search by title"), kind: 'primary', run: () => { const q = entry.trim(); return q ? onSearchTitle(q) : entryRef.current?.focus(); } },
      { label: t("Poner título a mano", "Enter title manually"), kind: 'seco', run: () => { const v = entry.trim(); if (!v) { entryRef.current?.focus(); return; } onCommit('C', 'create', withPub({ ...onProposal(), title_native: v })); } },
      { label: t("Guardar sin título", "Save without title"), kind: 'seco', run: () => onCommit('C', 'create', withPub(onProposal())) },
      ...withAgain,
    ],
    D: [
      { label: t("Ya lo tengo", "Already owned"), kind: 'primary', run: onDone },
      { label: t("Es otro ejemplar · suma una copia", "Another copy · add it"), kind: 'seco', run: () => onCommit('D', 'create', onProposal()) },
    ],
  }[state] || [];

  return (
    <div className="confirm">
      <button type="button" className="btn ghost back" onClick={onBack}>
        {modal ? t("‹ Nueva búsqueda", "‹ New search") : t("‹ Estante", "‹ Shelf")}
      </button>
      <div className="cframe">
        <Tile book={confirmBook} className="ctile" />
        <div className="cmeta">
          <h2 className={headingCls || undefined}>{heading}</h2>
          {state === 'B' && <div className="scan-row"><ScanFrame mini empty /></div>}
          {au && <div className="a">{au}</div>}
          {state !== 'B' && state !== 'C' && m && m.series && <div className="a">{m.series}</div>}
          {state === 'A' && (
            <div className="pub-pick">
              <div className="pub-label">
                {t('Editorial', 'Publisher')}:{' '}
                {editingPub ? (
                  <input
                    className="input pub-input"
                    placeholder={t("ej. Debolsillo, Planeta…", "e.g. Penguin, Planeta…")}
                    value={pub}
                    onChange={(e) => setPub(e.target.value)}
                    onBlur={() => setEditingPub(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingPub(false); }}
                    autoFocus
                  />
                ) : (
                  <button type="button" className="chip pub-edit" onClick={() => setEditingPub(true)}>
                    {pub || t("＋ elegir editorial", "＋ choose publisher")} ✎
                  </button>
                )}
              </div>
              {pubOptions.length > 1 && editions.length <= 1 && (
                <div className="pub-chips">
                  {pubOptions.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`chip${pub === p ? ' active' : ''}`}
                      onClick={() => { setPub(p); setEditingPub(false); }}
                    >{p}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {session.isbn && (
            <div className="chiprow">
              <span className="muted">ISBN</span>
              <IsbnChip isbn={session.isbn} />
            </div>
          )}
          {state === 'C' && <SourcesReport sources={session.sources} />}
        </div>
      </div>

      {state === 'A' && editions.length > 1 && (
        <CoverCarousel
          editions={editions}
          selectedUrl={chosenCover}
          onSelect={(ed) => {
            setChosenCover(ed.cover_url);
            if (ed.publisher) { setPub(ed.publisher); setEditingPub(false); }
          }}
        />
      )}

      {state === 'D' && (
        <div className="who">
          {t('Ejemplares que ya tienes:', 'Copies already owned:')} {session.existing.length}:{' '}
          {session.existing.map((e) => (e.location ? `${locText(e.location)}${e.needs_review ? t(" (revisar)", " (review)") : ''}` : t("sin ubicación", "no location"))).join(' · ')}
        </div>
      )}

      {(state === 'B' || state === 'C') && (
        <>
          <input
            ref={entryRef} className="input" id="entry"
            placeholder={state === 'B' ? (session.manual ? t("escribe el ISBN o el título", "enter the ISBN or title") : t("escribe el ISBN (13 dígitos)", "enter the ISBN (13 digits)")) : t("título", "title")}
            value={entry}
            onChange={(e) => onEntry(e.target.value)}
            onFocus={() => document.body.classList.add('typing')}
            onBlur={() => document.body.classList.remove('typing')}
            autoFocus
          />
          {state === 'B' && session.badIsbn && (
            <div className="muted" style={{ fontSize: '12.5px', marginTop: '6px', color: 'var(--mustard)' }}>
              {t('el último dígito no cuadra (verifica el ISBN)', 'the check digit does not match (check the ISBN)')}
            </div>
          )}
        </>
      )}

      {state === 'C' && (
        <>
          <button type="button" className="btn ghost" onClick={onPickCover}>
            {session.cover ? t("＋ otra portada", "＋ another cover") : t("＋ portada (lee el título)", "＋ cover (read the title)")}
          </button>
          {session.coverUrl && <img className="cvthumb" alt={t("portada", "cover")} src={session.coverUrl} />}
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
