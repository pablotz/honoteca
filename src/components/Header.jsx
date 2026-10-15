import { t } from '../lib/i18n.js';
import Icon from './Icon.jsx';
// Cabecera: sección (mi estante / por comprar), vistas, tema, libros por balda, escanear.
// La sección NO pregunta al guardar: lo escaneado cae en el estante que esté activo aquí.
export default function Header({ view, onView, theme, onCycleTheme, section, onSection, perRow, maxPerRow, onPerRow, onAdd, onLogout, user }) {
  return (
    <header>
      <img src="/apple-touch-icon.png" alt="Honoteca" className="brand-ico" />
      <button type="button" className={`ico${view === 'shelf' ? ' active' : ''}`} aria-label={t("Estante", "Shelf")} aria-pressed={view === 'shelf'} title={t("Estante", "Shelf")} onClick={() => onView('shelf')}><Icon name="shelf" /></button>
      <button type="button" className={`ico${view === 'grid' ? ' active' : ''}`} aria-label={t("Cuadrícula", "Grid")} aria-pressed={view === 'grid'} title={t("Cuadrícula", "Grid")} onClick={() => onView('grid')}><Icon name="grid" /></button>
      <span className="seg" role="tablist" aria-label={t("Sección de la biblioteca", "Library section")}>
        <button type="button" role="tab" aria-selected={section === 'owned'} className={section === 'owned' ? 'active' : ''} onClick={() => onSection('owned')}>{t("Mi estante", "My shelf")}</button>
        <button type="button" role="tab" aria-selected={section === 'buy'} className={section === 'buy' ? 'active' : ''} onClick={() => onSection('buy')}>{t("Comprar", "Wishlist")}</button>
      </span>
      <button type="button" className="ico" title={`${t('Tema', 'Theme')}: ${{ dark: t('Oscuro', 'Dark'), sepia: t('Sepia', 'Sepia'), light: t('Claro', 'Light') }[theme]}`} onClick={onCycleTheme}><Icon name="theme" /></button>
      <div className="perrow" role="group" aria-label={t('Libros por balda', 'Books per shelf')}>
        <span className="perrow-label">{t('Libros por balda', 'Books per shelf')}</span>
        <div className="perrow-stepper">
          <button type="button" aria-label={t('Menos libros por balda', 'Fewer books per shelf')} disabled={perRow <= 3} onClick={() => onPerRow(perRow - 1)}><Icon name="minus" /></button>
          <output aria-live="polite">{perRow}</output>
          <button type="button" aria-label={t('Más libros por balda', 'More books per shelf')} disabled={perRow >= maxPerRow} onClick={() => onPerRow(perRow + 1)}><Icon name="plus" /></button>
        </div>
      </div>
      <span className="grow" />
      {onLogout && (
        <button type="button" className="logout-btn" title={`${t('Salir', 'Log out')}${user ? ` (${user})` : ''}`} onClick={onLogout}>
          <Icon name="logout" />
          <span className="logout-lbl">{t("Salir", "Log out")}</span>
        </button>
      )}
      <button className="add" title={t("Escanear un libro", "Scan a book")} onClick={onAdd}><Icon name="plus" /></button>
    </header>
  );
}
