// copiar sin context seguro (en http://LAN no hay navigator.clipboard) → textarea + execCommand
export async function copyText(text) {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; } } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
