import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n.js';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import Icon from './Icon.jsx';

export default function HomeScreenGuide() {
  const mobile = useMediaQuery('(max-width:899px)');
  const standalone = useMediaQuery('(display-mode: standalone)');
  const [open, setOpen] = useState(false);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dialog = useRef(null);
  const show = mobile && !standalone && !navigator.standalone;

  useEffect(() => {
    if (!show) { setOpen(false); return; }
    const element = dialog.current;
    if (!element) return;
    if (open && show && !element.open) element.showModal();
    if ((!open || !show) && element.open) element.close();
  }, [open, show]);

  if (!show) return null;
  const close = () => setOpen(false);
  return (
    <div className="home-screen-guide">
      <button type="button" className="home-screen-trigger" onClick={() => setOpen(true)}>
        <Icon name="phone" />
        {t('Añadir a pantalla de inicio', 'Add to Home Screen')}
      </button>
      <dialog ref={dialog} className="home-screen-dialog" aria-labelledby="home-screen-title" onCancel={close} onClose={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="nd">
          <div className="home-screen-heading">
            <img src="/apple-touch-icon.png" className="home-screen-icon" alt="Honoteca" />
            <div className="home-screen-copy">
              <h2 id="home-screen-title" className="nd-title">{t('Añadir Honoteca', 'Add Honoteca')}</h2>
              <p className="home-screen-intro">{t('Tu librería, a un toque.', 'Your library, one tap away.')}</p>
            </div>
            <button type="button" className="home-screen-close" aria-label={t('Cerrar guía', 'Close guide')} onClick={close}><Icon name="close" /></button>
          </div>
          <ol className="home-screen-steps">
            <li>
              <span className="home-screen-step-icon" aria-hidden="true">
                <Icon name={ios ? 'share' : 'more'} />
              </span>
              <span>{ios ? t('Toca Compartir', 'Tap Share') : t('Toca el menú ⋮', 'Tap the ⋮ menu')}
                <small>{ios ? t('En la barra de Safari.', 'In the Safari toolbar.') : t('En la barra de Chrome.', 'In the Chrome toolbar.')}</small>
              </span>
            </li>
            <li>
              <span className="home-screen-step-icon" aria-hidden="true">
                <Icon name="homeAdd" />
              </span>
              <span>{t('Añadir a pantalla de inicio', 'Add to Home Screen')}
                <small>{ios ? t('Confirma con Añadir.', 'Confirm with Add.') : t('Elige Instalar o Crear acceso directo.', 'Choose Install or Create shortcut.')}</small>
              </span>
            </li>
          </ol>
          <details className="home-screen-help">
            <summary>{t('¿No encuentras la opción?', 'Can’t find the option?')}</summary>
            <p>{ios
              ? t('Compartir puede estar dentro de Más (…). Si falta Añadir a pantalla de inicio, busca en Editar acciones. Si aparece Abrir como app web, actívalo.', 'Share may be inside More (…). If Add to Home Screen is missing, check Edit Actions. If Open as Web App appears, turn it on.')
              : t('En algunas versiones de Chrome, la opción está dentro de Instalar y crear acceso directo.', 'In some Chrome versions, look under Install and create shortcut.')}</p>
            <p>{t('Desde LinkedIn u otra app, abre primero esta página en Safari o Chrome. Honoteca necesita internet.', 'From LinkedIn or another app, open this page in Safari or Chrome first. Honoteca needs internet.')}</p>
          </details>
        </div>
      </dialog>
    </div>
  );
}
