// Cliente de autenticación (magic link). Sin estado: la verdad vive en la cookie de sesión.
export const authMe = () =>
  fetch('/api/auth/me').then((r) => r.json()).catch(() => ({ authed: true, required: false, mail: false }));

export const requestLink = (email) =>
  fetch('/api/auth/request', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then((r) => r.json());

export const logout = () =>
  fetch('/api/auth/logout', { method: 'POST' }).then((r) => r.json()).catch(() => ({}));
