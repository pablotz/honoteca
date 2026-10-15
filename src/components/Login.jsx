import { t } from '../lib/i18n.js';
import { useEffect, useRef, useState } from 'react';
import { requestLink } from '../lib/auth.js';

// Puerta de entrada: pides un enlace a tu correo y lo abres. No hay contraseñas ni cuentas.
export default function Login({ mail, turnstileSiteKey }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const challenge = useRef(null);
  const widget = useRef(null);
  useEffect(() => {
    if (!turnstileSiteKey || sent) return;
    let disposed = false;
    const render = () => {
      if (disposed || !challenge.current) return;
      widget.current = window.turnstile.render(challenge.current, {
        sitekey: turnstileSiteKey,
        size: 'flexible',
        callback: (value) => { setToken(value); setError(''); },
        'expired-callback': () => setToken(''),
        'error-callback': () => { setToken(''); setError(t('No se pudo verificar. Recarga e inténtalo de nuevo.', 'Verification failed. Reload and try again.')); },
      });
    };
    const loadError = () => setError(t('No se pudo cargar la verificación. Recarga e inténtalo de nuevo.', 'Verification could not load. Reload and try again.'));
    let script = document.getElementById('turnstile-script');
    if (window.turnstile) render();
    else {
      if (!script) {
        script = document.createElement('script'); script.id = 'turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true; document.head.append(script);
      }
      script.addEventListener('load', render);
      script.addEventListener('error', loadError);
    }
    return () => {
      disposed = true; script?.removeEventListener('load', render);
      script?.removeEventListener('error', loadError);
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null; setToken('');
    };
  }, [turnstileSiteKey, sent]);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || busy || (turnstileSiteKey && !token)) return;
    setBusy(true);
    setError('');
    try { await requestLink(email.trim(), token); setSent(true); }
    catch { setError(t('No se pudo enviar. Espera un momento e inténtalo de nuevo.', 'Could not send. Wait a moment and try again.')); }
    finally {
      setBusy(false); setToken('');
      if (widget.current !== null) window.turnstile?.reset(widget.current);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-brand">Honoteca</h1>
        {sent ? (
          <>
            <p className="login-msg">{t('Si este correo puede acceder, recibirás un enlace en', 'If this address can sign in, a link will arrive at')} <b>{email}</b>. {t('Ábrelo en este dispositivo. Si no llega, revisa spam o inténtalo más tarde.', 'Open it on this device. If it does not arrive, check spam or try again later.')}</p>
            <button type="button" className="btn ghost" onClick={() => setSent(false)}>{t("Usar otro correo", "Use another email")}</button>
          </>
        ) : (
          <>
            <p className="login-msg">{t("Entra con tu correo: te mando un enlace de un solo uso.", "Enter your email to receive a one-time login link.")}</p>
            <input
              className="input" type="email" inputMode="email" autoComplete="email" placeholder={t("tu@correo.com", "you@example.com")}
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
            />
            {turnstileSiteKey && <div ref={challenge} className="login-challenge" />}
            <button type="submit" className="btn" disabled={busy || Boolean(turnstileSiteKey && !token)}>{busy ? t("enviando…", "sending…") : t("Enviar enlace", "Send link")}</button>
          </>
        )}
        {error && <p className="login-msg" role="alert">{error}</p>}
        {!mail && <p className="login-dev">{import.meta.env.DEV ? t("Sin proveedor de correo: el enlace sale en la consola del servidor.", "Email delivery is not configured: the link appears in the server logs.") : t('El acceso por correo no está disponible por ahora.', 'Email sign-in is currently unavailable.')}</p>}
      </form>
    </div>
  );
}
