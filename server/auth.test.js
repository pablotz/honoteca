import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as expressRequest } from 'express';

const dir = mkdtempSync(join(tmpdir(), 'honoteca-auth-test-'));
process.env.BIBLIOTECA_DB = join(dir, 'test.db');
process.env.ALLOWED_EMAILS = 'reader@example.com';
process.env.RESEND_API_KEY = 'test-provider';
const { auth } = await import('./auth.js');
after(() => rmSync(dir, { recursive: true, force: true }));

test('login emails and invalid-link messages use client language without exposing allowlist membership', async (t) => {
  const request = auth.stack.find((s) => s.route?.path === '/auth/request').route.stack[0].handle;
  const verify = auth.stack.find((s) => s.route?.path === '/auth/verify').route.stack[0].handle;
  const emails = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    emails.push(JSON.parse(options.body));
    return new Response('{}');
  });
  for (const language of ['en', 'es']) {
    const req = {
      body: { email: 'reader@example.com' }, ip: language,
      headers: { host: 'localhost', 'accept-language': language === 'en' ? 'en-US,en;q=0.9,es;q=0.8' : 'es-MX,es;q=0.9,en;q=0.8' },
      protocol: 'http', acceptsLanguages: expressRequest.acceptsLanguages,
    };
    let response;
    await request(req, { json: (value) => { response = value; } });
    assert.deepEqual(response, { ok: true });
    const email = emails.at(-1);
    assert.equal(email.subject, language === 'en' ? 'Your Honoteca login' : 'Tu acceso a Honoteca');
    assert.ok(email.html.includes(language === 'en' ? 'expires in 15 minutes' : 'caduca en 15 minutos'));
    let error;
    verify({ ...req, query: {} }, { status: () => ({ send: (value) => { error = value; } }) });
    assert.ok(error.includes(language === 'en' ? 'Request a new one.' : 'Pide uno nuevo.'));
    await request({ ...req, body: { email: 'unknown@example.com' } }, { json: (value) => { response = value; } });
    assert.deepEqual(response, { ok: true });
  }
  assert.equal(emails.length, 2);
  let fallback;
  verify({ query: {}, headers: { 'accept-language': 'ja-JP' }, acceptsLanguages: expressRequest.acceptsLanguages }, { status: () => ({ send: (value) => { fallback = value; } }) });
  assert.ok(fallback.includes('Request a new one.'));
});
