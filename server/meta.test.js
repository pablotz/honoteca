import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEnglishPublisher } from './meta.js';

test('English publisher names include HarperCollins, while Spanish editions stay Spanish', () => {
  assert.equal(isEnglishPublisher('HarperCollins', '9780061120084'), true);
  assert.equal(isEnglishPublisher('HarperCollins Publishers', '9780061120084'), true);
  assert.equal(isEnglishPublisher('HarperCollins', '9786073198288'), false);
  assert.equal(isEnglishPublisher('HarperCollins México'), false);
});
