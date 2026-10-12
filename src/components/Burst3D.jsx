import { useEffect, useRef } from 'react';
import { WebGLRenderer, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial, MathUtils } from 'three';

// Ráfaga de celebración en 3D al registrar un libro: unos veinte «libritos» salen disparados
// del centro, caen con gravedad, se desvanecen y la escena se suicida sola (~1.5 s).
// Escena autocontenida: monta, anima su propio bucle, limpia y muere — sin tocar la app.
const COLORS = ['#d99a2b', '#e0715f', '#3a332a', '#e3c48c'];

export default function Burst3D() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const w = host.clientWidth || 1, h = host.clientHeight || 1;

    let renderer;
    try { renderer = new WebGLRenderer({ alpha: true, antialias: true }); }
    catch { return; } // sin WebGL → la celebración se queda en el toast
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(45, w / h, 0.1, 30);
    camera.position.z = 9;

    // libritos: cajitas con velocidad radial, giro y un temporizador de vida (para el fade)
    const pieces = [];
    for (let i = 0; i < 22; i++) {
      const mesh = new Mesh(
        new BoxGeometry(0.32, 0.42, 0.1),
        new MeshBasicMaterial({ color: COLORS[i % COLORS.length], transparent: true }),
      );
      const a = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 3.5;
      mesh.userData = {
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed + 2.4, vz: -Math.random() * 2,
        rot: MathUtils.randFloatSpread(7), grav: -5.5, life: 1.3 + Math.random() * 0.5,
      };
      scene.add(mesh);
      pieces.push(mesh);
    }

    let raf = 0, last = performance.now(), elapsed = 0;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((t - last) / 1000, 0.05); last = t; elapsed += dt;
      for (const p of pieces) {
        const d = p.userData;
        d.vy += d.grav * dt;
        p.position.x += d.vx * dt;
        p.position.y += d.vy * dt;
        p.position.z += d.vz * dt;
        p.rotation.x += d.rot * dt; p.rotation.y += d.rot * 1.3 * dt; p.rotation.z += d.rot * 0.5 * dt;
        d.life -= dt;
        p.material.opacity = Math.max(d.life, 0); // aparece → se desvanece
      }
      renderer.render(scene, camera);
      if (elapsed > 1.6) {
        cancelAnimationFrame(raf);
        for (const p of pieces) { p.geometry.dispose(); p.material.dispose(); }
        renderer.dispose();
        host.removeChild(renderer.domElement);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf); // si la app lo desmonta antes, cortamos el bucle
  }, []);

  return <div ref={hostRef} className="burst3d" aria-hidden="true" />;
}