import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'honoteca-cover-test-'));
process.env.BIBLIOTECA_DB = join(dir, 'test.db');
const { add_book } = await import('./db.js');
const { canAccessCover, uploadPrefix } = await import('./coverAccess.js');
after(() => rmSync(dir, { recursive: true, force: true }));

test('photos and pending scan tickets are private while catalog covers can be shared', () => {
  add_book({ title_native: 'Private', cover_front: 'covers/front/private.jpg', scan_back: 'covers/back/private.jpg' }, 'owner@example.com');
  for (const path of ['covers/front/private.jpg', 'covers/back/private.jpg', `covers/tmp/${uploadPrefix('owner@example.com')}-pending.jpg`]) {
    assert.equal(canAccessCover(path, 'owner@example.com'), true);
    assert.equal(canAccessCover(path, 'visitor@example.com'), false);
  }
  assert.equal(canAccessCover('covers/front/9786073198288.jpg', 'visitor@example.com'), true);
  assert.equal(canAccessCover('covers/front/../private.jpg', 'owner@example.com'), false);
  assert.equal(canAccessCover('covers/tmp/.', 'visitor@example.com'), false);
});
