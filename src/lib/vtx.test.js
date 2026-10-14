import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vtx } from './vtx.js';

test('vtx skips snapshots for reduced motion and retains normal transitions', (t) => {
  const originalDocument = globalThis.document;
  const originalMatchMedia = globalThis.matchMedia;
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = originalMatchMedia;
  });
  let reduced = true;
  let snapshots = 0;
  let updates = 0;
  const transition = { finished: Promise.resolve() };
  globalThis.matchMedia = () => ({ matches: reduced });
  globalThis.document = { visibilityState: 'visible', startViewTransition(fn) { snapshots++; fn(); return transition; } };
  assert.equal(vtx(() => updates++), undefined);
  assert.equal(snapshots, 0);
  assert.equal(updates, 1);
  reduced = false;
  assert.equal(vtx(() => updates++), transition);
  assert.equal(snapshots, 1);
  assert.equal(updates, 2);
  globalThis.document.visibilityState = 'hidden';
  vtx(() => updates++);
  assert.equal(snapshots, 1);
  assert.equal(updates, 3);
});
