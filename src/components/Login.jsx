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
        <div className="login-brand">Honoteca</div>
        {sent ? (
          <>
            <p className="login-msg">Te mandé un enlace a <b>{email}</b>. Ábrelo en este dispositivo.</p>
            <button type="button" className="btn ghost" onClick={() => setSent(false)}>Usar otro correo</button>
          </>
        ) : (
          <>
            <p className="login-msg">Entra con tu correo: te mando un enlace de un solo uso.</p>
            <input
              className="input" type="email" inputMode="email" autoComplete="email" placeholder="tu@correo.com"
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
            />
            <button type="submit" className="btn" disabled={busy}>{busy ? 'enviando…' : 'Enviar enlace'}</button>
          </>
        )}
        {!mail && <p className="login-dev">Sin proveedor de correo: el enlace sale en la consola del servidor.</p>}
      </form>
    </div>
  );
}
