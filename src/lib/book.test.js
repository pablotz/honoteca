import { test } from 'node:test';
import assert from 'node:assert/strict';
import { language } from './i18n.js';
import { fmtIsbn, normalizeAuthor, displayTitle, displayAuthor, blurbText, validIsbn, locText } from './book.js';

test('fmtIsbn: deja los dígitos tal cual (o —)', () => {
  assert.equal(fmtIsbn('9786073198288'), '9786073198288');
  assert.equal(fmtIsbn('978-607-319-828-8'), '9786073198288');
  assert.equal(fmtIsbn('12345'), '12345');
  assert.equal(fmtIsbn(''), '—');
});

test('validIsbn: acepta dígitos de control válidos y rechaza el resto', () => {
  assert.equal(validIsbn('9786073198288'), true);
  assert.equal(validIsbn('9786073198280'), false); // último dígito mal
  assert.equal(validIsbn('0306406152'), true);     // ISBN-10
  assert.equal(validIsbn('0306406153'), false);
  assert.equal(validIsbn('123'), false);
});

test('normalizeAuthor: openbd estilo JP y "Apellido,Nombre,año"', () => {
  assert.equal(normalizeAuthor('夏目,漱石,1867-1916'), '夏目漱石');
  assert.equal(normalizeAuthor('Boswell,Dustin,1976-'), 'Dustin Boswell');
  assert.equal(normalizeAuthor('Dustin Boswell'), 'Dustin Boswell');
});

test('displayTitle/displayAuthor: preferencia native → romaji → ISBN', () => {
  assert.equal(displayTitle({ title_native: '雪国', title_romaji: 'Yukiguni' }), '雪国');
  assert.equal(displayTitle({ title_romaji: 'Yukiguni' }), 'Yukiguni');
  assert.equal(displayTitle({ isbn: '9786073198288' }), 'ISBN 9786073198288');
  assert.equal(displayAuthor({ authors: ['Boswell,Dustin,1976-'] }), 'Dustin Boswell');
  assert.equal(displayAuthor({ authors: [] }), '');
});

test('blurbText: quita HTML, colapsa saltos y devuelve null si queda vacío', () => {
  assert.equal(blurbText('<p>Hola<br>mundo</p>'), 'Hola\nmundo');
  assert.equal(blurbText('<p></p>'), null);
  assert.equal(blurbText(null), null);
});

test('blurbText: solo muestra sinopsis en inglés si la editorial es inglesa', () => {
  const en = 'At school Connell and Marianne pretend not to know each other while the world around them changes.';
  const es = 'Una novela extraordinaria sobre la vida y la historia de dos jóvenes en el mundo actual.';
  assert.equal(blurbText(en, { isbn: '9780061120084', publisher: 'HarperCollins' }), en);
  assert.equal(blurbText(en, { isbn: '9786073198288', publisher: 'Literatura Random House' }), null);
  assert.equal(blurbText(en, { isbn: '9788425451096', publisher: null }), null);
  assert.equal(blurbText(en, { isbn: '9780241997062', publisher: 'Penguin Books' }), en);
  assert.equal(blurbText(es, { isbn: '9786073198288', publisher: 'Planeta' }), es);
});

test('locText: etiqueta de ubicación', () => {
  assert.equal(locText({ shelf: 'A', row: 2, pos: 3 }), language === 'es' ? 'A · fila 2 · 3.º' : 'A · row 2 · 3');
});
