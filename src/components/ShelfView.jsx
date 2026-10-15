import Tile from './Tile.jsx';

// Objetos vividos sobre las baldas: alternan por fila (no en todas, para no saturar).
const PROPS = ['plant', 'lamp'];
function Prop({ kind }) {
  if (kind === 'plant') {
    return <i className="prop plant" aria-hidden="true"><i className="leaf l1" /><i className="leaf l2" /><i className="leaf l3" /><i className="pot" /></i>;
  }
  if (kind === 'lamp') {
    return <i className="prop lamp" aria-hidden="true"><i className="glow" /><i className="shade" /><i className="stem" /><i className="base" /></i>;
  }
  return null;
}

// estante: libros agrupados por ubicación; SIEMPRE se muestran las baldas del mueble
// (vacías si no hay libros ahí), para que la biblioteca se vea como tal.
// `buy`: el mueble de compras (la madera cambia para que se lea como OTRO estante).
const SHELF_UNITS = [['A', 1], ['A', 2], ['B', 1], ['B', 2], ['C', 1], ['C', 2]];
const DECOR = ['plank-top', 'plank-front'];

// Reordena los libros del mueble: `perRow` libros por balda. Pedido estable (por ubicación),
// los que no tienen ubicación van al final. Mínimo 6 baldas aunque haya pocos libros.
export default function ShelfView({ books, perRow, onOpen, onAddCover, buy = false, holeId, vtId }) {
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
    <div className={`shelfview${buy ? ' buy' : ''}`} style={{ '--books-per-row': perRow }}>
      {units.map((u, ri) => (
        <div className={`shelfrow${groups.get(u).length ? '' : ' is-empty'}`} key={u}>
          {DECOR.map((c) => <i key={c} className={c} />)}
          {groups.get(u).map((b) => b.id === holeId
            ? <div key={`hole-${b.id}`} className="tile slot" /> // el libro está "sacado" del estante
            : <Tile key={b.id} book={b} onOpen={onOpen} onAddCover={onAddCover} vtActive={b.id === vtId} />)}
          {ri % 2 === 0 && <Prop key={`prop-${u}`} kind={PROPS[(ri / 2) % PROPS.length]} />}
        </div>
      ))}
    </div>
  );
}
