import Tile from './Tile.jsx';

// estante: libros agrupados por ubicación; SIEMPRE se muestran las baldas del mueble
// (vacías si no hay libros ahí), para que la biblioteca se vea como tal.
// `buy`: el mueble de compras (la madera cambia para que se lea como OTRO estante).
const SHELF_UNITS = [['A', 1], ['A', 2], ['B', 1], ['B', 2], ['C', 1], ['C', 2]];
const DECOR = ['back-panel', 'wall wall-left', 'wall wall-right', 'plank-top', 'plank-front'];

// Reordena los libros del mueble: `perRow` libros por balda. Pedido estable (por ubicación),
// los que no tienen ubicación van al final. Mínimo 6 baldas aunque haya pocos libros.
export default function ShelfView({ books, perRow, onOpen, onAddCover, buy = false, holeId }) {
  const ordered = [...books].sort((a, b) => {
    const la = a.location, lb = b.location;
    if (!la && !lb) return 0; if (!la) return 1; if (!lb) return -1;
    const ka = `${la.shelf}`, kb = `${lb.shelf}`;
    return ka < kb ? -1 : ka > kb ? 1 : la.row < lb.row ? -1 : la.row > lb.row ? 1 : (la.pos ?? 0) - (lb.pos ?? 0);
  });
  const rows = Math.max(SHELF_UNITS.length, Math.ceil(ordered.length / Math.max(perRow, 1)));
  const units = [];
  for (let i = 0; i < rows; i++) {
    const [sh, rw] = i < SHELF_UNITS.length ? SHELF_UNITS[i] : [String.fromCharCode(65 + Math.floor(i / 2)), (i % 2) + 1];
    units.push(`${sh}-${rw}`);
  }
  const groups = new Map(units.map((k) => [k, []]));
  ordered.forEach((b, i) => groups.get(units[Math.min(Math.floor(i / perRow), rows - 1)]).push(b));

  return (
    <div className={`shelfview${buy ? ' buy' : ''}`}>
      {units.map((u) => (
        <div className="shelfrow" key={u}>
          {DECOR.map((c) => <i key={c} className={c} />)}
          {groups.get(u).map((b) => b.id === holeId
            ? <div key={`hole-${b.id}`} className="tile slot" /> // el libro está "sacado" del estante
            : <Tile key={b.id} book={b} onOpen={onOpen} onAddCover={onAddCover} />)}
        </div>
      ))}
    </div>
  );
}
