import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession, newLoginToken, hashToken } from './session.js';

test('sesión: firma válida pasa, caducada y manipulada no', () => {
  process.env.AUTH_SECRET = 'test-secret';
  const ok = signSession(60_000);
  assert.equal(verifySession(ok), true);
  assert.equal(verifySession(signSession(-1)), false);          // ya caducada
  assert.equal(verifySession(ok.replace(/\..*/, '.deadbeef')), false); // firma cambiada
  assert.equal(verifySession(''), false);
  assert.equal(verifySession(null), false);
  assert.equal(verifySession('123.abc'), false);
});

test('token de enlace: aleatorio y con hash estable', () => {
  const a = newLoginToken(), b = newLoginToken();
  assert.notEqual(a, b);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
  assert.equal(hashToken(a).length, 64); // sha256 hex
});
