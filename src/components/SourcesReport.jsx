import { Fragment } from 'react';

// Reporte por fuente, ordenado por lo que se puede HACER: skipped/error primero (mustard,
// con su remedio en una línea muted), los miss después (gris). «no lo tiene» ≠ «no se pudo preguntar».
// El remedio depende del ESTADO, no del nombre de la var: con la key ya puesta, «add VAR»
// manda a hacer lo que ya se hizo.
function note(s) {
  if (s.outcome === 'error') return 'transient · retry';
  if (!s.envVarSet) return s.envVar ? `add ${s.envVar} to .env` : 'unavailable';
  if (s.reason === 'quota') return 'quota reached · retry later';
  if (s.reason === 'http 400') return `key not valid · re-check what you pasted${s.envVar ? ` into ${s.envVar}` : ''}`;
  if (s.reason === 'http 403') return `key rejected · enable this API for the key${s.envVar ? ` (${s.envVar})` : ''}`;
  return `key present but refused${s.reason ? ` · ${s.reason}` : ''}`;
}

export default function SourcesReport({ sources = [] }) {
  const acted = sources.filter((s) => s.outcome === 'skipped' || s.outcome === 'error');
  const missed = sources.filter((s) => s.outcome === 'miss');
  if (!acted.length && !missed.length) return null;
  return (
    <div className="srcs">
      {acted.map((s, i) => (
        <Fragment key={i}>
          <div className="src-fix">
            {s.name} — {s.outcome === 'error' ? 'error' : (s.envVarSet ? 'key present · still refused' : 'no access')}
          </div>
          <div className="src-fixnote">{note(s)}</div>
        </Fragment>
      ))}
      {missed.length > 0 && <div className="src-miss">{missed.map((s) => `${s.name} ✗`).join(' · ')}</div>}
    </div>
  );
}
