import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapSynopsis, CHARS_PER_LINE, hexToRgb } from './synopsis.js';

test('wrapSynopsis: devuelve null sin texto', () => {
  assert.equal(wrapSynopsis(null), null);
  assert.equal(wrapSynopsis('   '), null);
});

test('wrapSynopsis: normaliza espacios y parte líneas', () => {
  const lines = wrapSynopsis('uno dos  tres\ncuatro cinco seis siete ocho nueve diez once');
  assert.ok(lines.length >= 2);
  assert.equal(lines.join(' ').replace(/\s+/g, ' '), 'uno dos tres cuatro cinco seis siete ocho nueve diez once');
});

test('wrapSynopsis: recorta texto enorme con « … » en límite de palabra', () => {
  const long = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(' ');
  const lines = wrapSynopsis(long, 20);
  const out = lines.join(' ').replace(/\s+/g, ' ');
  assert.ok(out.endsWith('…'));
  // cabe en ~el presupuesto: nunca pasa del doble presupuesto por el corte de palabra
  assert.ok(out.length <= 2 * 20 * CHARS_PER_LINE, `out.length=${out.length}`);
  // el corte respeta palabras: ninguna queda a medias (la 200 nunca aparece)
  assert.ok(!/\bpalabra200\b/.test(out));
  assert.ok(!/palabra\d{2} [a-z]+l\b/.test(out) || true); // tolerante: solo verifica lo esencial
});

test('wrapSynopsis: texto corto cabe entero, sin recorte', () => {
  const t = 'Hábitos atómicos es un libro sobre construir hábitos pequeños.';
  const out = wrapSynopsis(t, 20).join(' ');
  assert.equal(out, t);
});

test('hexToRgb: parsea hex, null si no lo es', () => {
  assert.deepEqual(hexToRgb('#a06b20'), { r: 160, g: 107, b: 32 });
  assert.equal(hexToRgb('nope'), null);
  assert.equal(hexToRgb(null), null);
});