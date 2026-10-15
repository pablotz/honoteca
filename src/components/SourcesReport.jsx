import { Fragment } from 'react';
import { t } from '../lib/i18n.js';

// Reporte por fuente, ordenado por lo que se puede HACER: skipped/error primero (mustard,
// con su remedio en una línea muted), los miss después (gris). «no lo tiene» ≠ «no se pudo preguntar».
// El remedio depende del ESTADO, no del nombre de la var: con la key ya puesta, «add VAR»
// manda a hacer lo que ya se hizo.
function note(s) {
  if (s.outcome === 'error') return t('temporal · reintenta', 'transient · retry');
  if (!s.envVarSet) return s.envVar ? `${t('configura', 'set')} ${s.envVar} ${t('en .env', 'in .env')}` : t('no disponible', 'unavailable');
  if (s.reason === 'quota') return t('cuota agotada · reintenta más tarde', 'quota reached · retry later');
  if (s.reason === 'http 400') return `${t('clave inválida · verifica el valor', 'invalid key · check the value')}${s.envVar ? ` (${s.envVar})` : ''}`;
  if (s.reason === 'http 403') return `${t('clave rechazada · activa esta API', 'key rejected · enable this API')}${s.envVar ? ` (${s.envVar})` : ''}`;
  return `${t('clave presente pero rechazada', 'key present but refused')}${s.reason ? ` · ${s.reason}` : ''}`;
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
            {s.name} — {s.outcome === 'error' ? 'error' : (s.envVarSet ? t('clave presente · rechazada', 'key present · still refused') : t('sin acceso', 'no access'))}
          </div>
          <div className="src-fixnote">{note(s)}</div>
        </Fragment>
      ))}
      {missed.length > 0 && <div className="src-miss">{missed.map((s) => `${s.name} ✗`).join(' · ')}</div>}
    </div>
  );
}
