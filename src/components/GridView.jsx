import Tile from './Tile.jsx';

// Cuadrícula: igual que el estante, con el mismo "hueco" cuando un libro está abierto en el panel.
export default function GridView({ books, onOpen, onAddCover, holeId, vtId }) {
  return (
    <div className="grid">
      {books.map((b) => b.id === holeId
        ? <div key={`hole-${b.id}`} className="tile slot" />
        : <Tile key={b.id} book={b} onOpen={onOpen} onAddCover={onAddCover} vtActive={b.id === vtId} />)}
    </div>
  );
}
