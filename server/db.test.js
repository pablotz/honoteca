// Pruebas de la DB contra un archivo temporal (BIBLIOTECA_DB se fija ANTES de importar db.js).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'honoteca-test-'));
process.env.BIBLIOTECA_DB = join(dir, 'test.db');
const db = await import('./db.js');

after(() => rmSync(dir, { recursive: true, force: true }));

test('magic link: un token sirve UNA vez y caduca', () => {
  const once = 'hash-once';
  db.createLoginToken(once, Date.now() + 60_000);
  assert.equal(db.consumeLoginToken(once), true);   // la primera vez entra
  assert.equal(db.consumeLoginToken(once), false);  // reusarlo no

  const old = 'hash-old';
  db.createLoginToken(old, Date.now() - 1);         // ya caducado
  assert.equal(db.consumeLoginToken(old), false);

  assert.equal(db.consumeLoginToken('no-existe'), false);
});

test('purgeLoginTokens limpia los caducados', () => {
  db.createLoginToken('hash-dead', Date.now() - 1);
  db.purgeLoginTokens();
  assert.equal(db.consumeLoginToken('hash-dead'), false);
});

test('tx: si algo falla, no se escribe nada', () => {
  const before = db.list_books().length;
  assert.throws(() => db.tx(() => {
    db.add_book({ title_native: 'a medias' });
    throw new Error('boom');
  }));
  assert.equal(db.list_books().length, before);
});
