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

test('email budget persists cooldowns and caps hourly and daily sends', () => {
  const time = 10_000_000;
  assert.equal(db.reserveLoginEmail('budget@example.com', time), true);
  assert.equal(db.reserveLoginEmail('budget@example.com', time + 59_999), false);
  assert.equal(db.reserveLoginEmail('budget@example.com', time + 60_000), true);
  assert.equal(db.reserveLoginEmail('budget@example.com', time + 120_000), true);
  assert.equal(db.reserveLoginEmail('budget@example.com', time + 180_000), false);
  for (let i = 0; i < 17; i++) assert.equal(db.reserveLoginEmail(`${i}@example.com`, time + 180_000), true);
  assert.equal(db.reserveLoginEmail('hour-full@example.com', time + 180_000), false);
  for (let i = 0; i < 20; i++) assert.equal(db.reserveLoginEmail(`${i}@example.com`, time + 4_000_000), true);
  for (let i = 0; i < 10; i++) assert.equal(db.reserveLoginEmail(`${i}@example.com`, time + 8_000_000), true);
  assert.equal(db.reserveLoginEmail('day-full@example.com', time + 8_000_000), false);
  assert.equal(db.reserveLoginEmail('next-day@example.com', time + 24 * 60 * 60_000), true);
});

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

test('aislamiento por usuario: cada correo ve y modifica solo su biblioteca', () => {
  const a = db.add_book({ isbn: '9788437604947', title_native: 'Cien años', location: { shelf: 'A', row: 1 } }, 'ana@test.com');
  const b = db.add_book({ isbn: '9788437604947', title_native: 'Cien años (Luis)', location: { shelf: 'A', row: 1 } }, 'luis@test.com');

  assert.equal(a.location.pos, 1);
  assert.equal(b.location.pos, 1); // el estante de Luis empieza en 1, independiente del de Ana
  assert.equal(a.copies, 1);       // copies cuenta solo los ejemplares de Ana, no los de Luis
  assert.equal(db.list_books({}, 'ana@test.com').length, 1);
  assert.equal(db.list_books({}, 'luis@test.com').length, 1);
  assert.equal(db.get_book(a.id, 'luis@test.com'), null);       // Luis no puede leer el libro de Ana
  assert.equal(db.update_book(a.id, { pages: 99 }, 'luis@test.com'), null); // ni editarlo
  assert.equal(db.remove_book(a.id, 'luis@test.com'), false);   // ni borrarlo

  db.update_title('9788437604947', { title_native: 'Editado por Ana' }, 'ana@test.com');
  assert.equal(db.get_book(b.id, 'luis@test.com').title_native, 'Cien años (Luis)'); // intacto
});
