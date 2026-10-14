// Cabecera: sección (mi estante / por comprar), vistas, tema, libros por balda, escanear.
// La sección NO pregunta al guardar: lo escaneado cae en el estante que esté activo aquí.
export default function Header({ view, onView, theme, onCycleTheme, section, onSection, perRow, maxPerRow, onPerRow, onAdd, onLogout, user }) {
  return (
    <header>
      <img src="/apple-touch-icon.png" alt="Honoteca" className="brand-ico" />
      <button type="button" className={`ico${view === 'shelf' ? ' active' : ''}`} title="Estante" onClick={() => onView('shelf')}>≡</button>
      <button type="button" className={`ico${view === 'grid' ? ' active' : ''}`} title="Cuadrícula" onClick={() => onView('grid')}>▦</button>
      <span className="seg" role="tablist" aria-label="Sección de la biblioteca">
        <button type="button" role="tab" className={section === 'owned' ? 'active' : ''} onClick={() => onSection('owned')}>Mi estante</button>
        <button type="button" role="tab" className={section === 'buy' ? 'active' : ''} onClick={() => onSection('buy')}>Comprar</button>
      </span>
      <button type="button" className="ico" title={`Tema: ${theme}`} onClick={onCycleTheme}>◐</button>
      <label className="perrow" title="libros por balda">
        <input type="range" min="3" max={maxPerRow} step="1" value={perRow} onChange={(e) => onPerRow(e.target.value)} />
        <b>{perRow}</b>
      </label>
      <span className="grow" />
      {onLogout && <button type="button" className="ico" title={user ? `Salir (${user})` : 'Salir'} onClick={onLogout}>⏻</button>}
      <button className="add" title="Escanear un libro" onClick={onAdd}>＋</button>
    </header>
  );
}