import { t } from '../lib/i18n.js';
import { useState } from 'react';
import { requestLink } from '../lib/auth.js';

// Puerta de entrada: pides un enlace a tu correo y lo abres. No hay contraseñas ni cuentas.
export default function Login({ mail }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try { await requestLink(email.trim()); setSent(true); } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-brand">Honoteca</h1>
        {sent ? (
          <>
            <p className="login-msg">{t('Te mandé un enlace a', 'A link was sent to')} <b>{email}</b>. {t('Ábrelo en este dispositivo.', 'Open it on this device.')}</p>
            <button type="button" className="btn ghost" onClick={() => setSent(false)}>{t("Usar otro correo", "Use another email")}</button>
          </>
        ) : (
          <>
            <p className="login-msg">{t("Entra con tu correo: te mando un enlace de un solo uso.", "Enter your email to receive a one-time login link.")}</p>
            <input
              className="input" type="email" inputMode="email" autoComplete="email" placeholder={t("tu@correo.com", "you@example.com")}
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
            />
            <button type="submit" className="btn" disabled={busy}>{busy ? t("enviando…", "sending…") : t("Enviar enlace", "Send link")}</button>
          </>
        )}
        {!mail && <p className="login-dev">{t("Sin proveedor de correo: el enlace sale en la consola del servidor.", "Email delivery is not configured: the link appears in the server logs.")}</p>}
      </form>
    </div>
  );
}
