import { t } from '../src/lib/i18n.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loginEmail(url, language) {
  const subject = t('Tu acceso a Honoteca', 'Your Honoteca login', language);
  const heading = t('Tu librería te espera', 'Your library is waiting', language);
  const intro = t('Abre tu biblioteca con este enlace de un solo uso. No necesitas contraseña.', 'Open your library with this one-time link. No password needed.', language);
  const button = t('Abrir mi biblioteca', 'Open my library', language);
  const expiry = t('El enlace caduca en 15 minutos y solo sirve una vez.', 'This link expires in 15 minutes and can only be used once.', language);
  const fallback = t('¿El botón no funciona? Copia este enlace en tu navegador:', 'Button not working? Copy this link into your browser: ', language);
  const ignore = t('Si no pediste este correo, puedes ignorarlo. Tu biblioteca sigue protegida.', 'If you did not request this email, you can ignore it. Your library is still protected.', language);
  const href = escapeHtml(url);
  const icon = escapeHtml(new URL('/apple-touch-icon.png', url).href);
  return {
    subject,
    text: `${heading}\n\n${intro}\n\n${button}: ${url}\n\n${expiry}\n\n${ignore}`,
    html: `<!doctype html>
<html lang="${language === 'es' ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4ecdf;color:#30271e;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${expiry}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4ecdf;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#fffbf4;border-radius:20px;">
      <tr><td style="height:6px;background-color:#d99a2b;border-radius:20px 20px 0 0;"></td></tr>
      <tr><td align="center" style="padding:32px 24px 16px;">
        <img src="${icon}" alt="Honoteca" width="56" height="56" style="display:block;border:0;border-radius:12px;margin-bottom:12px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:bold;color:#30271e;">Honoteca</div>
      </td></tr>
      <tr><td align="center" style="padding:8px 24px 28px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;font-weight:normal;color:#30271e;">${heading}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#594b3c;">${intro}</p>
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#d99a2b" style="border-radius:12px;">
          <a href="${href}" style="display:inline-block;padding:16px 28px;font-size:16px;font-weight:bold;text-decoration:none;color:#24180a;border:1px solid #d99a2b;border-radius:12px;">${button}</a>
        </td></tr></table>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#594b3c;">${expiry}</p>
      </td></tr>
      <tr><td style="padding:24px;border-top:1px solid #e8dccb;">
        <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#655747;">${fallback}</p>
        <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere;"><a href="${href}" style="color:#775014;">${href}</a></p>
        <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#655747;">${ignore}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  };
}
