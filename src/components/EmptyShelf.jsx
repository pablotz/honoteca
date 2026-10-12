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
            <div className="lblrow">fila {r}</div>
          </Fragment>
        ))}
      </div>
      <div className="cta">
        <button type="button" className="btn" onClick={onScan}>
          {buy ? 'Escanear un libro para comprar' : 'Escanear un libro'}
        </button>
        <div className="gest">una foto → ISBN → listo</div>
      </div>
    </div>
  );
}
