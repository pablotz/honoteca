import { t } from '../lib/i18n.js';
import { useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Carrusel horizontal de portadas por edición: tocar una miniatura cambia tanto la portada
// como la editorial asociada. Descarta automáticamente portadas vacías (1x1 de Open Library).
export default function CoverCarousel({ editions = [], selectedUrl, onSelect, label = t("Elige la portada de tu edición", "Choose your edition’s cover") }) {
  const trackRef = useRef(null);
  const [hidden, setHidden] = useState({});

  const visible = editions.filter((e) => e && e.cover_url && !hidden[e.cover_url]);
  if (visible.length === 0) return null;

  const scroll = (dir) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * 210, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  return (
    <div className="c-carousel">
      <div className="c-carousel-head">
        <span className="c-carousel-lbl">{label} ({visible.length})</span>
        {visible.length > 3 && (
          <div className="c-carousel-nav">
            <button type="button" className="c-nav-btn" onClick={() => scroll(-1)} aria-label={t("Anterior", "Previous")}><Icon name="left" /></button>
            <button type="button" className="c-nav-btn" onClick={() => scroll(1)} aria-label={t("Siguiente", "Next")}><Icon name="right" /></button>
          </div>
        )}
      </div>
      <div className="c-carousel-track" ref={trackRef}>
        {visible.map((ed) => {
          const active = selectedUrl === ed.cover_url;
          return (
            <button
              key={ed.cover_url}
              type="button"
              className={`c-card${active ? ' active' : ''}`}
              aria-pressed={active}
              onClick={() => onSelect(ed)}
              title={ed.publisher ? `${t('Editorial', 'Publisher')}: ${ed.publisher}` : t("Elegir esta portada", "Choose this cover")}
            >
              <div className="c-card-imgwrap">
                <img
                  src={ed.cover_url}
                  alt={ed.publisher || t("Portada", "Cover")}
                  loading="lazy"
                  onLoad={(e) => {
                    if (e.currentTarget.naturalWidth < 20) {
                      setHidden((h) => ({ ...h, [ed.cover_url]: true }));
                    }
                  }}
                  onError={() => setHidden((h) => ({ ...h, [ed.cover_url]: true }))}
                />
              </div>
              <span className="c-card-pub">{ed.publisher || t("Otra edición", "Other edition")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
