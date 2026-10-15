import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'honoteca-api-test-'));
process.env.DATA_DIR = dir;
process.env.BIBLIOTECA_DB = join(dir, 'test.db');
const { api } = await import('./api.js');
const db = await import('./db.js');
const handler = api.stack.find((s) => s.route?.path === '/books/:id/select-cover').route.stack[0].handle;
after(() => rmSync(dir, { recursive: true, force: true }));

test('clients cannot attach another account photo or scan ticket or change a book ID', () => {
  const guard = api.stack[0].handle;
  db.add_book({ title_native: 'Private', cover_front: 'covers/front/alice.jpg' }, 'alice@example.com');
  for (const body of [
    { cover_front: 'covers/front/alice.jpg' },
    { book: { cover_front: 'covers/front/alice.jpg' } },
    { ticket: 'someone-elses-photo.jpg' },
    { id: '9786073198288' },
  ]) {
    let status;
    guard({ method: 'PATCH', user: 'bob@example.com', body }, { status(code) { status = code; return { json() {} }; } }, () => assert.fail('unauthorized reference accepted'));
    assert.equal(status, 400);
  }
  let allowed = false;
  guard({ method: 'PATCH', user: 'alice@example.com', body: { cover_front: 'covers/front/alice.jpg' } }, {}, () => { allowed = true; });
  assert.equal(allowed, true);
});

test('select-cover validates URLs and images, bounds downloads, and preserves the old cover on failure', async (t) => {
  const book = db.add_book({ title_native: 'Test', cover_front: 'covers/front/old.jpg' });
  const url = 'https://covers.openlibrary.org/b/id/123-L.jpg';
  const dest = join(dir, 'covers', 'front', `${book.id}.jpg`);
  writeFileSync(dest, 'previous image');
  let response;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    if (response instanceof Error) throw response;
    return response;
  });
  const select = async (cover_url) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: book.id }, user: '', body: { cover_url } }, res);
    return res;
  };
  for (const invalid of ['http://127.0.0.1:8849', 'https://covers.openlibrary.org.evil.test/b/id/123-L.jpg', 'https://user@covers.openlibrary.org/b/id/123-L.jpg', `${url}?redirect=http://localhost`, 'https://covers.openlibrary.org/other']) {
    assert.equal((await select(invalid)).code, 400);
  }
  assert.equal(calls, 0);
  for (const failure of [new Error('redirect blocked'), new Response('unavailable', { status: 503 }), new Response('x'.repeat(3000)), new Response('x', { headers: { 'content-length': String(6 * 1024 * 1024) } }), new Response(Buffer.alloc(6 * 1024 * 1024))]) {
    response = failure;
    assert.equal((await select(url)).code, 400);
    assert.equal(db.get_book(book.id).cover_front, 'covers/front/old.jpg');
    assert.equal(db.get_book(book.id).cover_url, null);
    assert.equal(readFileSync(dest, 'utf8'), 'previous image');
  }
  const png = Buffer.alloc(32);
  png.set([0x89, 0x50, 0x4e, 0x47]);
  png.writeUInt32BE(300, 16);
  png.writeUInt32BE(450, 20);
  response = new Response(png);
  const result = await select(url);
  assert.equal(result.code, 200);
  assert.equal(result.body.book.cover_front, `covers/front/${book.id}.jpg`);
  assert.equal(result.body.book.cover_url, url);
  assert.deepEqual(readFileSync(dest), png);
});
