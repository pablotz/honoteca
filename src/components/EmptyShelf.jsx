import { t } from '../lib/i18n.js';
import { Fragment } from 'react';

// §6.2 — al abrir sin libros: el mueble, vacío + una sola acción. Cero texto de obra.
// `buy`: estante de compras — mismo mueble, texto que invita a escanear lo que se quiere.
export default function EmptyShelf({ onScan, buy = false }) {
  return (
    <div className={`empty${buy ? ' buy' : ''}`}>
      <div className="shelf">
        {['A', 'B'].map((r) => (
          <Fragment key={r}>
            <div className="row" />
            <div className="lblrow">{t('fila', 'row')} {r}</div>
          </Fragment>
        ))}
      </div>
      <div className="cta">
        <button type="button" className="btn" onClick={onScan}>
          {buy ? t("Escanear un libro para comprar", "Scan a book to buy") : t("Escanear un libro", "Scan a book")}
        </button>
        <div className="gest">{t("una foto → ISBN → listo", "one photo → ISBN → done")}</div>
      </div>
    </div>
  );
}
