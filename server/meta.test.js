import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esWikiIntro, isEnglishPublisher, lookup_isbn, resolveDescription } from './meta.js';

test('English publisher names include HarperCollins, while Spanish editions stay Spanish', () => {
  assert.equal(isEnglishPublisher('HarperCollins', '9780061120084'), true);
  assert.equal(isEnglishPublisher('HarperCollins Publishers', '9780061120084'), true);
  assert.equal(isEnglishPublisher('HarperCollins', '9786073198288'), false);
  assert.equal(isEnglishPublisher('HarperCollins México'), false);
});

test('Wikipedia synopsis ignores unrelated results for full-width titles', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const params = new URL(url).searchParams;
    return Response.json(params.has('titles')
      ? { query: { pages: { 1: { title: 'Contenido libre', extract: 'El contenido libre es un concepto que abarca cualquier obra funcional, de arte u otro contenido creativo.' } } } }
      : { query: { search: [{ title: 'Contenido libre' }] } });
  };
  try {
    assert.equal(await esWikiIntro('Ｔｈｅ　ｃｒｅａｔｉｖｅ　ａｃｔ： ａ　ｗａｙ　ｏｆ　ｂｅｉｎｇ'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('English editions reject Spanish descriptions even when returned for the exact ISBN', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://books.google.com/books?')) return new Response('id=creativeact123');
    return Response.json({ volumeInfo: {
      title: 'The Creative Act',
      industryIdentifiers: [{ identifier: '9780593652886' }],
      description: 'El contenido libre es un concepto que abarca cualquier obra funcional, de arte u otro contenido creativo.',
    } });
  };
  try {
    assert.equal(await resolveDescription({
      isbn: '9780593652886',
      title_native: 'The Creative Act: A Way of Being',
      publisher: 'Penguin Press',
      description: 'El contenido libre es un concepto que abarca cualquier obra funcional, de arte u otro contenido creativo.',
    }, '9780593652886'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('non-Japanese ISBNs skip Japanese catalogs and use Open Library metadata', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return Response.json({
      title: 'The Creative Act: A Way of Being',
      authors: [{ name: 'Rick Rubin' }],
      publishers: ['Penguin Press'],
    });
  };
  try {
    const { hit, report } = await lookup_isbn('9780593652886');
    assert.equal(hit.title_native, 'The Creative Act: A Way of Being');
    assert.deepEqual(hit.authors, ['Rick Rubin']);
    assert.deepEqual(report.map((source) => source.name), ['Open Library']);
    assert.equal(urls.some((url) => /openbd|ndlsearch/i.test(url)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
