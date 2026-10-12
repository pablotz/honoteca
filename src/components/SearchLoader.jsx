// Cargador de búsqueda: una mini balda cuyos libros aparecen por turnos mientras una línea
// de escaneo mustard los recorre. Puro CSS, sin deps — encaja con la estética del mueble.
export default function SearchLoader({ label = 'Buscando…' }) {
  return (
    <div className="sloader">
      <div className="sloader-books" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className={`sbook sbook-${i}`} />)}
        <i className="sloader-line" />
      </div>
      <div className="sloader-cap">{label}</div>
    </div>
  );
}