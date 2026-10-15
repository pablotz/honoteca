import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, limitApi } from './rateLimit.js';

test('limits have bounded storage, fail closed when full, and recover after expiry', () => {
  let time = 0;
  const limited = rateLimit({ max: 2, windowMs: 1000, maxKeys: 2, now: () => time });
  assert.equal(limited('a'), false);
  assert.equal(limited('a'), false);
  for (let i = 0; i < 100; i++) assert.equal(limited('a'), true);
  assert.equal(limited('b'), false);
  assert.equal(limited('c'), true);
  assert.equal(limited('a'), true, 'filling the map must not reset existing limits');
  time = 1000;
  assert.equal(limited('c'), false);
  assert.equal(limited('a'), false);
});

test('API rejects excess requests with 429 and a retry interval', () => {
  let accepted = 0;
  const res = {
    setHeader: (name, value) => { assert.equal(name, 'Retry-After'); assert.equal(value, '60'); },
    status: (status) => { assert.equal(status, 429); return res; },
    json: (body) => { assert.match(body.error, /Too many requests/); },
  };
  for (let i = 0; i < 125; i++) limitApi({ ip: 'test' }, res, () => accepted++);
  assert.equal(accepted, 120);
});
