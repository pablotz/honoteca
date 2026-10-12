// Marco «buscando código»: viewfinder con barras de código, esquinas de lector y una línea
// que barre. `empty` muestra un «?» (no se leyó nada); `mini` achica para tarjetas.
export default function ScanFrame({ label, empty = false, mini = false }) {
  return (
    <div className={`scan${mini ? ' scan-mini' : ''}`}>
      <div className="scan-box" aria-hidden="true">
        <div className="scan-bars" />
        {empty ? <div className="scan-q">?</div> : <div className="scan-line" />}
      </div>
      {label && <div className="scan-cap">{label}</div>}
    </div>
  );
}