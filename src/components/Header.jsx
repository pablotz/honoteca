import { t } from '../lib/i18n.js';
// Cabecera: sección (mi estante / por comprar), vistas, tema, libros por balda, escanear.
// La sección NO pregunta al guardar: lo escaneado cae en el estante que esté activo aquí.
export default function Header({ view, onView, theme, onCycleTheme, section, onSection, perRow, maxPerRow, onPerRow, onAdd, onLogout, user }) {
  return (
    <header>
      <img src="/apple-touch-icon.png" alt="Honoteca" className="brand-ico" />
      <button type="button" className={`ico${view === 'shelf' ? ' active' : ''}`} aria-pressed={view === 'shelf'} title={t("Estante", "Shelf")} onClick={() => onView('shelf')}>≡</button>
      <button type="button" className={`ico${view === 'grid' ? ' active' : ''}`} aria-pressed={view === 'grid'} title={t("Cuadrícula", "Grid")} onClick={() => onView('grid')}>▦</button>
      <span className="seg" role="tablist" aria-label={t("Sección de la biblioteca", "Library section")}>
        <button type="button" role="tab" aria-selected={section === 'owned'} className={section === 'owned' ? 'active' : ''} onClick={() => onSection('owned')}>{t("Mi estante", "My shelf")}</button>
        <button type="button" role="tab" aria-selected={section === 'buy'} className={section === 'buy' ? 'active' : ''} onClick={() => onSection('buy')}>{t("Comprar", "Wishlist")}</button>
      </span>
      <button type="button" className="ico" title={`${t('Tema', 'Theme')}: ${{ dark: t('Oscuro', 'Dark'), sepia: t('Sepia', 'Sepia'), light: t('Claro', 'Light') }[theme]}`} onClick={onCycleTheme}>◐</button>
      <label className="perrow" title={t("libros por balda", "books per shelf")}>
        <input type="range" min="3" max={maxPerRow} step="1" value={perRow} onChange={(e) => onPerRow(e.target.value)} />
        <b>{perRow}</b>
      </label>
      <span className="grow" />
      {onLogout && (
        <button type="button" className="logout-btn" title={`${t('Salir', 'Log out')}${user ? ` (${user})` : ''}`} onClick={onLogout}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="logout-lbl">{t("Salir", "Log out")}</span>
        </button>
      )}
      <button className="add" title={t("Escanear un libro", "Scan a book")} onClick={onAdd}>＋</button>
    </header>
  );
}
