import { useEffect, useState } from 'react';
import Cover3D from './Cover3D.jsx';

// El libro 3D DE VERDAD es el que vuela: su canvas vive en un overlay fijo que crece desde la
// balda hasta el hueco de portada del panel. Nunca hay una imagen plana que "se vuelve 3D" —
// es objeto desde el primer frame. Al aterrizar se funde con el libro idéntico del panel.
export default function FlyingBook({ book, fly, onArrive, onDone }) {
  const [pos, setPos] = useState(fly.from);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let alive = true;
    const measureTimer = setTimeout(() => {
      // objetivo = hueco de portada del panel (montado ya, aunque esté a opacity 0)
      const host = document.querySelector('.detail-panel .bcover');
      if (host && alive) {
        const r = host.getBoundingClientRect();
        setPos({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }, 60);
    const arriveTimer = setTimeout(() => alive && onArrive(), 400);   // el panel empieza a verse
    const fadeTimer = setTimeout(() => alive && setFading(true), 450); // aterrizó → se funde
    const endTimer = setTimeout(() => alive && onDone(), 720);         // y se retira
    return () => {
      alive = false;
      clearTimeout(measureTimer); clearTimeout(arriveTimer); clearTimeout(fadeTimer); clearTimeout(endTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`flybook3d${fading ? ' fade' : ''}`}
      style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
      aria-hidden="true"
    >
      <Cover3D book={book} />
    </div>
  );
}