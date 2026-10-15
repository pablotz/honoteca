// Cliente de autenticación (magic link). Sin estado: la verdad vive en la cookie de sesión.
export const authMe = () =>
  fetch('/api/auth/me').then((r) => { if (!r.ok) throw new Error(); return r.json(); }).catch(() => ({ authed: false, required: true, mail: false }));

export const requestLink = (email, turnstileToken) =>
  fetch('/api/auth/request', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, turnstileToken }),
  }).then((r) => { if (!r.ok) throw new Error(); return r.json(); });

export const logout = () =>
  fetch('/api/auth/logout', { method: 'POST' }).then((r) => r.json()).catch(() => ({}));
