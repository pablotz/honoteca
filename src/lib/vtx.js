import { flushSync } from 'react-dom';

// View Transitions API: anima el cambio de vista (estantería ↔ ficha). Sin soporte (o pestaña
// oculta: el navegador aborta la transición) → render directo.
// flushSync dentro del callback: React debe confirmar el DOM ANTES de que el navegador
// capture el «antes/después» de la transición, si no la animación no encuentra el estado final.
export const vtx = (fn) => {
  if (!document.startViewTransition || document.visibilityState !== 'visible') { fn(); return; }
  try { document.startViewTransition(() => flushSync(fn)); } catch { fn(); }
};
