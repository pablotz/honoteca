import { t } from '../lib/i18n.js';
import { displayTitle, locText } from '../lib/book.js';
import Icon from './Icon.jsx';

// Un azulejo de libro. Con portada: solo la tapa. Sin portada: el título ES la portada.
export default function Tile({ book, showBand = true, onOpen, onAddCover, className = '', vtActive = false }) {
  const hasCover = !!(book.cover_front || book.cover_url);
  const title = displayTitle(book);
  const style = {};
  if (book.id) style['--book-transition'] = `b${book.id}`;
  if (vtActive && book.id) style.viewTransitionName = `b${book.id}`; // morph SOLO del libro activo
  const saved = !!book.id;
  if (book.cover_front) { style.backgroundImage = `url("/${book.cover_front}")`; style.backgroundSize = 'cover'; }
  else if (book.cover_url) { style.backgroundImage = `url("${book.cover_url}")`; style.backgroundSize = 'cover'; }
  else style.background = book.strip_color || '#3a332a';

  let titleAttr = `${title}${book.location ? ` · ${locText(book.location)}` : ''}`;
  if (!hasCover && saved) titleAttr += ` · ${t('sin portada (toca ＋)', 'no cover (tap ＋)')}`;

  return (
    <div
      className={`tile${hasCover ? '' : ' gen'}${className ? ` ${className}` : ''}`}
      style={style}
      title={titleAttr}
      onClick={hasCover || saved ? (e) => onOpen(book, e) : undefined}
    >
      {!hasCover && showBand && book.strip_present && (
        <div className="band" style={{ background: book.strip_color || '#3a332a', filter: 'brightness(1.18)' }} />
      )}
      {book.needs_review && <div className="rev" />}
      {book.loaned_to && <div className="loan-badge" role="img" aria-label={`${t('Prestado a', 'Lent to')} ${book.loaned_to}`} title={`${t('Prestado a', 'Lent to')} ${book.loaned_to}`}><Icon name="move" /></div>}
      {book.section === 'buy' && <div className="wish" aria-label={t("por comprar", "on wishlist")} title={t("por comprar", "on wishlist")}>🛒</div>}
      {!hasCover && saved && (
        <div className="covbadge" title={t("subir portada", "upload cover")} onClick={(e) => { e.stopPropagation(); onAddCover(book.id); }}>＋</div>
      )}
      {!hasCover && <div className="lbl">{title}</div>}
    </div>
  );
}
