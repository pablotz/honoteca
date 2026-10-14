import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession, newLoginToken, hashToken } from './session.js';

test('sesión: firma válida devuelve el email; caducada o manipulada devuelve null', () => {
  process.env.AUTH_SECRET = 'test-secret';
  const ok = signSession('ana.perez@example.com', 60_000);
  assert.equal(verifySession(ok), 'ana.perez@example.com');
  assert.equal(verifySession(signSession('ana.perez@example.com', -1)), null); // ya caducada
  assert.equal(verifySession(ok.replace(/\.[^.]+$/, '.deadbeef')), null);      // firma cambiada
  assert.equal(verifySession(''), null);
  assert.equal(verifySession(null), null);
  assert.equal(verifySession('123.abc'), null);
});

test('token de enlace: aleatorio y con hash estable', () => {
  const a = newLoginToken(), b = newLoginToken();
  assert.notEqual(a, b);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
  assert.equal(hashToken(a).length, 64); // sha256 hex
});
