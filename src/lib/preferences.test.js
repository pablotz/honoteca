import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences, savePreferences } from './preferences.js';

const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('preferences survive reloads, remain separate by account, and preserve desktop shelf size', () => {
  const store = storage();
  const alice = { theme: 'sepia', view: 'grid', section: 'buy', perRow: 5 };
  const bob = { theme: 'light', view: 'shelf', section: 'owned', perRow: 6 };
  savePreferences('alice@example.com', alice, store);
  savePreferences('bob@example.com', bob, store);
  assert.deepEqual(readPreferences('alice@example.com', store), alice);
  assert.deepEqual(readPreferences('bob@example.com', store), bob);
  assert.equal(readPreferences('alice@example.com', store).perRow, 5);
  assert.equal(readPreferences('', store).theme, 'dark');
  for (const perRow of [1, 2]) {
    savePreferences('bob@example.com', { ...bob, perRow }, store);
    assert.equal(readPreferences('bob@example.com', store).perRow, 3);
  }
});

test('legacy browser settings migrate, invalid values fall back safely, and blocked storage is harmless', () => {
  const store = storage();
  store.setItem('biblioteca-theme', 'light');
  store.setItem('biblioteca-view', 'grid');
  store.setItem('biblioteca-perrow', '4');
  const legacy = readPreferences('reader@example.com', store);
  assert.deepEqual(legacy, { theme: 'light', view: 'grid', section: 'owned', perRow: 4 });
  savePreferences('reader@example.com', legacy, store);
  store.setItem('biblioteca-theme', 'dark');
  assert.equal(readPreferences('reader@example.com', store).theme, 'light');
  store.setItem('biblioteca-preferences:broken', '{');
  assert.equal(readPreferences('broken', store).theme, 'dark');
  store.setItem('biblioteca-preferences:invalid', JSON.stringify({ theme: 'neon', view: 'table', section: 'bad', perRow: 500 }));
  assert.deepEqual(readPreferences('invalid', store), { theme: 'dark', view: 'shelf', section: 'owned', perRow: 6 });
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readPreferences('reader', blocked).view, 'shelf');
  assert.doesNotThrow(() => savePreferences('reader', legacy, blocked));
});
