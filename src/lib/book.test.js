import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtIsbn, normalizeAuthor, displayTitle, displayAuthor, blurbText, validIsbn, locText } from './book.js';

test('fmtIsbn: agrupa EAN-13, deja el resto tal cual (o —)', () => {
  assert.equal(fmtIsbn('9786073198288'), '978-6-073-1982-88');
  assert.equal(fmtIsbn('978-607-319-828-8'), '978-6-073-1982-88');
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
  assert.equal(displayTitle({ isbn: '9786073198288' }), 'ISBN 978-6-073-1982-88');
  assert.equal(displayAuthor({ authors: ['Boswell,Dustin,1976-'] }), 'Dustin Boswell');
  assert.equal(displayAuthor({ authors: [] }), '');
});

test('blurbText: quita HTML, colapsa saltos y devuelve null si queda vacío', () => {
  assert.equal(blurbText('<p>Hola<br>mundo</p>'), 'Hola\nmundo');
  assert.equal(blurbText('<p></p>'), null);
  assert.equal(blurbText(null), null);
});

test('locText: etiqueta de ubicación', () => {
  assert.equal(locText({ shelf: 'A', row: 2, pos: 3 }), 'A · fila 2 · 3.º');
});
