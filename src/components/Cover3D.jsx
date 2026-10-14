import { useLayoutEffect, useRef, useState } from 'react';
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry,
  MeshBasicMaterial, MeshStandardMaterial, AmbientLight, DirectionalLight,
  Texture, CanvasTexture, SRGBColorSpace,
} from 'three';
import { displayTitle, blurbText } from '../lib/book.js';
import { wrapSynopsis, averageColor, hexToRgb } from '../lib/synopsis.js';

// Título de contraportada: encoje la fuente hasta que el título complete entre en ≤2 líneas
// dentro del ancho útil (medido, no a ciegas). Solo si ni a 56px cabe, corta con « … ».
function fitTitle(c, raw, maxWidth, maxLines) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  const wrapAt = (font) => {
    c.font = `700 ${font}px Georgia, serif`;
    const lines = [];
    let cur = '';
    for (const w of t.split(' ')) {
      if (c.measureText((cur + ' ' + w).trim()).width > maxWidth) {
        if (cur) lines.push(cur.trim());
        cur = w;
      } else cur = (cur + ' ' + w).trim();
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  };
  for (let f = 100; f >= 56; f -= 4) {
    const lines = wrapAt(f);
    if (lines.length <= maxLines) return { lines, font: f };
  }
  const lines = wrapAt(56);
  if (lines.length > maxLines) { // título rarísimo: cortar la última línea con « … »
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + ' …';
  }
  return { lines, font: 56 };
}

// Contraportada: canvas 1280×2048 con el título arriba y la sinopsis envuelta debajo,
// sobre el color dominante de la portada (oscurecido para que el texto respire).
// El texto es GRANDE (≈84px en la textura): al mostrarse en el panel queda legible (~20px),
// por eso se recorta a ~12 líneas de ~24 caracteres en vez de meter la sinopsis entera.
function backCanvas(title, lines, bg, ink) {
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 2048;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, 1280, 2048);
  c.fillStyle = ink;

  // título: fuente auto-ajustada para que entre completo (≤2 líneas)
  const fit = fitTitle(c, title, 900, 2);
  const titleLh = fit.font ? Math.round(fit.font * 1.32) : 0;
  const titleH = fit.lines.length ? fit.lines.length * titleLh : 0;
  const bodyH = (lines || []).length * 124;
  // espacio reservado entre título y cuerpo: descendientes + regla + aire AMPLIO
  const ruleZone = fit.lines.length ? 36 + 3 + 86 : 0;
  const blockTop = Math.max(90, Math.round((2048 - (titleH + ruleZone + bodyH)) / 2)); // centrado vertical

  if (fit.lines.length) {
    c.textAlign = 'center';
    c.font = `700 ${fit.font}px Georgia, serif`;
    let y = blockTop;
    for (const ln of fit.lines) { c.fillText(ln, 640, y); y += titleLh; }
    y += 36;                           // aire generoso tras los descendientes del título
    c.globalAlpha = 0.4; c.fillRect(190, y, 900, 3); c.globalAlpha = 1; // regla
  }

  // sinopsis grande y legible, con aire de sobra para no rozar la regla
  c.font = '84px Georgia, serif';
  c.textAlign = 'left';
  let y = blockTop + titleH + 36 + 3 + 86;
  for (const ln of lines || []) { c.fillText(ln, 150, y); y += 124; }
  return cv;
}

// Portada en 3D (three.js): el libro ES UNA CAJA con lomo, cantos de páginas y — ¡contraportada
// con la sinopsis escrita! Grande (1.4×) para que el texto se lea:
//   · tap/click → el libro da media vuelta (sinopsis al frente); otro tap vuelve
//   · arrastrar → lo giras a mano (siempre) · cursor/giroscopio → parallax
//   · la contraportada se pinta del color promedio de la portada (y recorta sinopsis enormes)
//   · WebGL ausente → vuelve a la portada estática de CSS
export default function Cover3D({ book, style }) {
  const hostRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const hasCover = !!(book.cover_front || book.cover_url);
  const src = book.cover_front ? `/${book.cover_front}` : book.cover_url || null;

  // useLayoutEffect (no useEffect): el primer fotograma debe estar PINTADO antes de que el
  // navegador capture la transición de vista — si no, la ficha captura un canvas vacío y el
  // libro vuela hacia la nada y luego aparece de golpe.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || host.clientWidth === 0 || host.clientHeight === 0) return;
    setFailed(false);

    let renderer;
    try { renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); }
    catch { setFailed(true); return; } // sin WebGL → portada estática
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const sceneMeshes = []; // todos los meshes de la escena, para desmontar sin fugas
    const camera = new PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.1, 20);
    camera.position.set(0, 0.5, 7.0); // atrás: aire arriba y abajo del libro
    camera.lookAt(0, -0.1, 0);

    // luces: ambiental (lo que rebota) + direccional (la que "dibuja" cada cara)
    scene.add(new AmbientLight(0xffffff, 0.75));
    const key = new DirectionalLight(0xfff2dd, 1.15);
    key.position.set(1.6, 2.2, 3);
    scene.add(key);

    // (sin sombra de suelo: el libro flota limpio, a petición del diseño)
    // --- el libro: caja con 6 materiales (orden three: +x,-x,+y,-y,+z,-z), grande (1.4×) ---
    // portada (+z) y contraportada (-z) → MeshBasic SIN luces: la foto y la sinopsis se leen
    // tal cual. Lomo/cantos/tapas → MeshStandard: ahí viven las sombras del volumen.
    const strip = book.strip_color || '#3a332a';
    const front = new MeshBasicMaterial({ color: strip });
    const back = new MeshBasicMaterial({ color: '#241708' }); // se pinta con la sinopsis abajo
    const pages = new MeshStandardMaterial({ color: '#efe8d6', roughness: 0.95 });
    // lomo SIN luces, como las tapas: así su color es EXACTAMENTE el de la contraportada
    // (una cubierta que envuelve el lomo). Con material iluminado el tono cambiaba al girar.
    const spine = new MeshBasicMaterial({ color: strip });
    const board = new MeshStandardMaterial({ color: '#3a2f24', roughness: 0.85 });
    const mesh = new Mesh(new BoxGeometry(2, 3, 0.22), [pages, spine, board, board, front, back]);
    const book3d = new Group();
    book3d.add(mesh);
    book3d.scale.setScalar(1.15); // grande para leer la sinopsis, sin pixelar ni rebasar
    scene.add(book3d);
    sceneMeshes.push(mesh);

    let texture = null;
    const setTexture = (map) => {
      if (texture) texture.dispose();
      texture = map;
      // needsUpdate: una Texture hecha a mano NO se sube a la GPU sin esto (CanvasTexture sí
      // se marca sola) — sin ello la tapa se ve negra.
      if (map) { map.colorSpace = SRGBColorSpace; map.anisotropy = 8; map.needsUpdate = true; }
      front.map = map;
      front.color.set('#ffffff');
      front.needsUpdate = true;
    };
    if (src) {
      // UNA sola descarga: la misma imagen sirve de textura de la tapa y para muestrear el
      // color de la contraportada (antes se bajaba dos veces).
      const img = new Image();
      // crossOrigin SOLO para portadas remotas (hotlink): en las locales deja la petición igual
      // que la del estante, para que el navegador reutilice la MISMA imagen ya decodificada
      // (con crossOrigin la clave de caché cambia y la tapa se volvía a bajar → parpadeo).
      if (!src.startsWith('/')) img.crossOrigin = 'anonymous';
      img.onload = () => {
        setTexture(new Texture(img));
        const base = averageColor(img);
        if (base) paintBack(wrapSynopsis(blurbText(book.description), 12, 24), base);
      };
      img.onerror = () => setTexture(null);
      img.src = src;
    }

    // --- contraportada: sinopsis sobre el color dominante de la portada ---
    let backTex = null;
    const paintBack = (lines, base, inkOverride) => {
      const lum = base ? 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b : 0;
      // fondo del color de la portada, pero con LA LUMINOSIDAD SUBIDA (×0.85 + 30): no queremos
      // una contraportada apagada — el texto (blanco o tinta) se elige según el brillo de base
      const mk = (v) => Math.min(255, Math.round(v));
      const bg = base ? `rgb(${mk(base.r * 0.85 + 30)}, ${mk(base.g * 0.85 + 30)}, ${mk(base.b * 0.85 + 30)})` : 'rgb(70,52,34)';
      const ink = inkOverride || (lum > 150 ? '#241a10' : '#f4ead8');
      spine.color.set(bg); // el lomo va del MISMO color que la contraportada
      if (backTex) backTex.dispose();
      backTex = new CanvasTexture(backCanvas(displayTitle(book), lines, bg, ink));
      backTex.colorSpace = SRGBColorSpace;
      back.map = backTex;
      back.color.set('#ffffff');
      back.needsUpdate = true;
    };
    const fallbackBase = hexToRgb(book.strip_color) || { r: 36, g: 23, b: 8 };
    const backLines = wrapSynopsis(blurbText(book.description), 12, 24); // letra GRANDE → menos líneas, legible
    paintBack(backLines, fallbackBase);

    // --- entradas: dedo (spin + tap para voltear), ratón (parallax), giroscopio ---
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rect = null;
    const measure = () => { rect = host.getBoundingClientRect(); };
    measure();

    const BASE = -0.35;
    let flipped = false;              // si la sinopsis (contraportada) mira al frente
    let rotY = BASE, rotX = 0, velY = 0, drag = null, moved = false, down = { x: 0, y: 0, t: 0 };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    // el arrastre queda en ±60° alrededor de la cara visible (portada O contraportada)
    const clampY = (v) => clamp(v, BASE + (flipped ? Math.PI : 0) - 1.0, BASE + (flipped ? Math.PI : 0) + 1.0);
    const pointer = { x: 0, y: 0, has: false };   // ratón, normalizado −1..1
    const gyro = { x: 0, y: 0, has: false };      // sensor, suavizado (EMA)

    const onDown = (e) => {
      drag = { x: e.clientX, last: e.clientX, t: performance.now() };
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      moved = false;
      pointer.has = false;
      try { host.setPointerCapture(e.pointerId); } catch { /* sintético */ }
    };
    const onMove = (e) => {
      if (drag) {
        const now = performance.now();
        if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) moved = true;
        const dx = e.clientX - drag.x;
        rotY = clampY(rotY + dx * 0.012);
        velY = (e.clientX - drag.last) / Math.max(now - drag.t, 1) * 0.014;
        drag.x = e.clientX; drag.last = e.clientX; drag.t = now;
        return;
      }
      if (e.pointerType !== 'mouse' || !rect) return; // parallax solo con el cursor
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.has = true;
    };
    const onUp = () => {
      if (drag && !moved && performance.now() - down.t < 500) flipped = !flipped; // tap → media vuelta
      drag = null;
    };
    const onLeave = () => { pointer.has = false; };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('pointerleave', onLeave);

    // giroscopio: gamma (izq/der) → rotY, beta (adelante/atrás) → rotX.
    const onOrientation = (e) => {
      const g = clamp(e.gamma / 30, -1, 1);
      const b = clamp((e.beta - 10) / 45, -1, 1);
      gyro.x += (g - gyro.x) * 0.25;
      gyro.y += (b - gyro.y) * 0.25;
      gyro.has = true;
    };
    let removeOri = null;
    const enableGyro = () => { window.addEventListener('deviceorientation', onOrientation, true); removeOri = () => window.removeEventListener('deviceorientation', onOrientation, true); };
    try {
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function')
        window.DeviceOrientationEvent.requestPermission().then((p) => { if (p === 'granted') enableGyro(); }).catch(() => {});
      else if ('DeviceOrientationEvent' in window) enableGyro();
    } catch { /* sin sensor */ }

    // --- bucle: easing hacia el objetivo (cara visible + sway + paralaje + giro) ---
    const decay = (dt) => Math.exp(-3.2 * dt);
    let raf = 0, last = performance.now();
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((t - last) / 1000, 0.05); last = t;
      if (!drag) {
        if (velY) { rotY = clampY(rotY + velY * dt * 60); velY *= decay(dt); }
        const sway = reduced ? 0 : Math.sin(t / 900) * 0.06;
        const gx = gyro.has ? gyro.x * 0.5 : 0;
        const gy = gyro.has ? gyro.y * -0.3 : 0;
        const k = Math.min(1, dt * 4);
        const fronting = BASE + (flipped ? Math.PI : 0); // hacia la cara que se quiere ver
        rotY += ((fronting + sway + (pointer.has ? -pointer.x * 0.5 : 0) + gx) - rotY) * k; // sin topo: la vuelta cruza 180°
        rotX += ((pointer.has ? pointer.y * 0.3 : 0) + gy - rotX) * k;
      }
      book3d.rotation.y = rotY;
      book3d.rotation.x = rotX;
      book3d.position.y = Math.sin(t / 1100) * 0.08; // flota
      renderer.render(scene, camera);
    };
    book3d.rotation.y = BASE;               // fotograma 0 ya pintado (sin esperar al rAF)
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      measure();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // desmontaje: cortar todo y DEVOLVER los recursos de three
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onLeave);
      if (removeOri) removeOri();
      if (texture) texture.dispose();
      for (const m of sceneMeshes) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) { if (mat.map) mat.map.dispose(); mat.dispose(); }
      }
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [book.id, src]);

  // degradado (sin WebGL): la portada estática de siempre
  if (failed) {
    const cssStyle = {};
    if (book.cover_front) cssStyle.backgroundImage = `url("/${book.cover_front}")`;
    else if (book.cover_url) cssStyle.backgroundImage = `url("${book.cover_url}")`;
    else cssStyle.background = book.strip_color || 'var(--strip)';
    return (
      <div className="bcover" style={{ ...cssStyle, ...style }}>
        {!hasCover && <div className="lbl">{displayTitle(book)}</div>}
      </div>
    );
  }

  return (
    <div className="bcover bcover3d" style={style} ref={hostRef}>
      {!hasCover && <div className="lbl">{displayTitle(book)}</div>}
    </div>
  );
}