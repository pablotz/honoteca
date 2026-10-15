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
const { auth, sessionUser, authConfigError } = await import('./auth.js');
after(() => rmSync(dir, { recursive: true, force: true }));

test('login emails and invalid-link messages use client language without exposing allowlist membership', async (t) => {
  const request = auth.stack.find((s) => s.route?.path === '/auth/request').route.stack[0].handle;
  const verify = auth.stack.find((s) => s.route?.path === '/auth/verify').route.stack[0].handle;
  const emails = [];
  let time = Date.now();
  t.mock.method(Date, 'now', () => time);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    emails.push(JSON.parse(options.body));
    return new Response('{}');
  });
  for (const language of ['en', 'es']) {
    time += 60_001;
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
    verify({ ...req, query: {} }, { setHeader() {}, status: () => ({ send: (value) => { error = value; } }) });
    assert.ok(error.includes(language === 'en' ? 'Request a new one.' : 'Pide uno nuevo.'));
    await request({ ...req, body: { email: 'unknown@example.com' } }, { json: (value) => { response = value; } });
    assert.deepEqual(response, { ok: true });
  }
  assert.equal(emails.length, 2);
  let fallback;
  verify({ query: {}, headers: { 'accept-language': 'ja-JP' }, acceptsLanguages: expressRequest.acceptsLanguages }, { setHeader() {}, status: () => ({ send: (value) => { fallback = value; } }) });
  assert.ok(fallback.includes('Request a new one.'));
});

test('public signup requires a verified bot token and keeps the new email as session owner', async (t) => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    PUBLIC_SIGNUP: '1', APP_URL: 'https://honoteca.app', AUTH_SECRET: 's'.repeat(32),
    TURNSTILE_SITE_KEY: 'public-site-key', TURNSTILE_SECRET_KEY: 'private-key', RESEND_FROM: 'Honoteca <login@honoteca.app>',
  });
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  assert.equal(authConfigError(), null);
  delete process.env.TURNSTILE_SECRET_KEY;
  assert.match(authConfigError(), /TURNSTILE_SECRET_KEY/);
  process.env.TURNSTILE_SECRET_KEY = 'private-key';
  assert.equal(sessionUser({ headers: {} }), null, 'public signup never means anonymous API access');
  const request = auth.stack.find((s) => s.route?.path === '/auth/request').route.stack[0].handle;
  const verify = auth.stack.find((s) => s.route?.path === '/auth/verify').route.stack[0].handle;
  let validation = { success: false, hostname: 'honoteca.app' };
  const emails = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('siteverify')) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.secret, 'private-key');
      return Response.json(validation);
    }
    emails.push(JSON.parse(options.body));
    return Response.json({});
  });
  const req = { body: { email: 'new-visitor@example.com' }, ip: 'public-visitor', headers: {}, protocol: 'https', acceptsLanguages: () => 'en' };
  const res = { json: (body) => assert.deepEqual(body, { ok: true }) };
  await request(req, res);
  req.body.turnstileToken = 'bot-token';
  await request(req, res);
  validation = { success: true, hostname: 'attacker.example' };
  await request(req, res);
  assert.equal(emails.length, 0);
  validation = { success: true, hostname: 'honoteca.app' };
  await request(req, res);
  assert.equal(emails.length, 1);
  const token = emails[0].html.match(/token=([^"<]+)/)[1];
  const headers = {};
  verify({ ...req, query: { token } }, { setHeader: (key, value) => { headers[key] = value; }, redirect: (path) => assert.equal(path, '/') });
  assert.equal(sessionUser({ headers: { cookie: headers['Set-Cookie'] } }), 'new-visitor@example.com');
  assert.ok(headers['Set-Cookie'].includes('Secure'));
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  let code;
  verify({ ...req, query: { token } }, { setHeader() {}, status: (value) => { code = value; return { send() {} }; } });
  assert.equal(code, 400, 'the login token cannot be reused');
});

test('magic links count unknown addresses and limit recipients across changing IPs', async (t) => {
  process.env.ALLOWED_EMAILS = 'limited@example.com';
  const request = auth.stack.find((s) => s.route?.path === '/auth/request').route.stack[0].handle;
  let time = Date.now() + 2 * 60 * 60_000;
  t.mock.method(Date, 'now', () => time);
  const deliveries = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return new Response('{}');
  });
  const send = async (email, ip) => {
    let result;
    await request({ body: { email }, ip, headers: { host: 'attacker.example' }, protocol: 'https', acceptsLanguages: () => 'en' }, {
      json: (value) => { result = value; },
    });
    assert.deepEqual(result, { ok: true });
  };
  process.env.APP_URL = 'https://honoteca.app';
  t.after(() => { delete process.env.APP_URL; process.env.ALLOWED_EMAILS = 'reader@example.com'; });
  for (let i = 0; i < 5; i++) await send('unknown@example.com', 'same-ip');
  await send('limited@example.com', 'same-ip');
  assert.equal(deliveries.length, 0);
  await send('limited@example.com', 'new-ip');
  await send('LIMITED@example.com', 'another-ip');
  assert.equal(deliveries.length, 1, 'recipient cooldown also applies with a different IP');
  assert.ok(deliveries[0].html.includes('https://honoteca.app/api/auth/verify?token='));
  assert.ok(!deliveries[0].html.includes('attacker.example'));
  for (let i = 0; i < 4; i++) {
    time += 60_001;
    await send('limited@example.com', `rotating-${i}`);
  }
  assert.equal(deliveries.length, 3, 'no more than three emails per recipient per hour');
});
