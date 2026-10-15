import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, t } from './i18n.js';

test('language follows supported browser preferences, including regional phone locales', () => {
  assert.equal(detectLanguage(['es-MX', 'en-US']), 'es');
  assert.equal(detectLanguage(['en-GB', 'es']), 'en');
  assert.equal(detectLanguage(['ES_es']), 'es');
  assert.equal(detectLanguage(['fr-FR', 'es-ES', 'en']), 'es');
  assert.equal(detectLanguage(['ja-JP']), 'en');
  assert.equal(detectLanguage([]), 'en');
});

test('translation selects interface copy without altering interpolated book text', () => {
  const title = 'El mundo de Sofía';
  assert.equal(`${t('Sinopsis', 'Synopsis', 'en')} · ${title}`, 'Synopsis · El mundo de Sofía');
  assert.equal(`${t('Sinopsis', 'Synopsis', 'es')} · ${title}`, 'Sinopsis · El mundo de Sofía');
});
