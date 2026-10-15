import { t } from '../lib/i18n.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// clamp: el recorte siempre queda cubierto (no se ve el fondo detrás de la foto).
// `nw`/`nh` son las dimensiones naturales de la imagen.
function clampView(v, nw, nh) {
  const rw = nw * v.s0 * v.z, rh = nh * v.s0 * v.z;
  return {
    ...v,
    tx: Math.max(Math.min(0, v.W - rw), Math.min(v.tx, 0)),
    ty: Math.max(Math.min(0, v.H - rh), Math.min(v.ty, 0)),
  };
}

// Editor mínimo: encuadrar la foto en un recorte 2:3 (arrastrar para mover, slider para zoom).
// Sale un JPEG recortado; el original queda intacto.
export default function CropDialog({ file, onCancel, onDone }) {
  const boxRef = useRef(null);
  const imgRef = useRef(null);
  const drag = useRef(null);
  const [src, setSrc] = useState(null);
  const [nat, setNat] = useState(null);       // { nw, nh }
  const [view, setView] = useState(null);     // { W, H, s0, z, tx, ty }
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const rd = new FileReader();
    rd.onload = () => setSrc(rd.result);
    rd.readAsDataURL(file);
  }, [file]);

  useLayoutEffect(() => {
    if (!src || !nat || !boxRef.current) return;
    const W = boxRef.current.clientWidth, H = boxRef.current.clientHeight;
    const s0 = Math.max(W / nat.nw, H / nat.nh);
    // el recorte siempre queda cubierto: centrado al abrir
    setView(clampView({ W, H, s0, z: 1, tx: (W - nat.nw * s0) / 2, ty: (H - nat.nh * s0) / 2 }, nat.nw, nat.nh));
  }, [src, nat]);

  // zoom mantiene el punto central del recorte fijo sobre la imagen
  const onZoom = (nz) => setView((v) => {
    if (!v || !nat) return v;
    const cx = (v.W / 2 - v.tx) / (v.s0 * v.z), cy = (v.H / 2 - v.ty) / (v.s0 * v.z);
    return clampView({ ...v, z: nz, tx: v.W / 2 - cx * v.s0 * nz, ty: v.H / 2 - cy * v.s0 * nz }, nat.nw, nat.nh);
  });
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => {
    if (!drag.current || !nat) return;
    const { x, y } = drag.current;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => clampView({ ...v, tx: v.tx + e.clientX - x, ty: v.ty + e.clientY - y }, nat.nw, nat.nh));
  };
  const onUp = () => { drag.current = null; setDragging(false); };

  const ok = () => {
    if (!view || !imgRef.current) return;
    const S = view.s0 * view.z, sx = -view.tx / S, sy = -view.ty / S, sw = view.W / S, sh = view.H / S;
    const out = document.createElement('canvas'); out.width = 360; out.height = 540;
    out.getContext('2d').drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, 360, 540);
    out.toBlob((blob) => onDone(blob || file), 'image/jpeg', 0.9); // sin recorte posible → original
  };

  const imgStyle = view && nat
    ? { width: nat.nw * view.s0 * view.z + 'px', height: nat.nh * view.s0 * view.z + 'px', transform: `translate(${view.tx}px,${view.ty}px)` }
    : { display: 'none' };

  return (
    <div className="cropmask">
      <div className="croppanel">
        <div
          ref={boxRef}
          className={`cropbox${dragging ? ' pan' : ''}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
          {src && (
            <img
              ref={imgRef} src={src} style={imgStyle} alt=""
              onLoad={(e) => setNat({ nw: e.target.naturalWidth, nh: e.target.naturalHeight })}
            />
          )}
        </div>
        <div className="croptools">
          <span>Zoom</span>
          <input type="range" min="1" max="8" step="0.01" value={view ? view.z : 1} onChange={(e) => onZoom(Number(e.target.value))} />
          <span>{t("Arrastra para encuadrar", "Drag to crop")}</span>
        </div>
        <div className="cropbtns">
          <button type="button" className="btn" onClick={ok} disabled={!view}>{t("Usar esta portada", "Use this cover")}</button>
          <button type="button" className="btn ghost" onClick={onCancel}>{t("Cancelar", "Cancel")}</button>
        </div>
      </div>
    </div>
  );
}
