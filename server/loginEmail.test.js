import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginEmail } from './loginEmail.js';

test('branded emails include the one-time link, fallback text, expiry and localized copy', () => {
  const url = 'https://honoteca.app/api/auth/verify?token=example&next="<test>"';
  for (const language of ['en', 'es']) {
    const email = loginEmail(url, language);
    assert.match(email.html, /https:\/\/honoteca.app\/apple-touch-icon.png/);
    assert.match(email.html, /token=example&amp;next=&quot;&lt;test&gt;&quot;/);
    assert.ok(!email.html.includes('<test>'));
    assert.ok(email.text.includes(url));
    assert.ok(email.html.includes(language === 'es' ? 'Tu librería te espera' : 'Your library is waiting'));
    assert.ok(email.text.includes(language === 'es' ? '15 minutos' : '15 minutes'));
    assert.ok(email.html.includes(language === 'es' ? 'Abrir mi biblioteca' : 'Open my library'));
  }
});
