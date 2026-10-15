import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseAst } from 'rolldown/parseAst';

test('interface text and accessible labels have both language variants', () => {
  const components = new URL('../components/', import.meta.url);
  const files = [new URL('../App.jsx', import.meta.url), ...readdirSync(components).filter((f) => f.endsWith('.jsx')).map((f) => new URL(f, components))];
  const sharedWords = new Set(['Honoteca', 'ISBN', 'Zoom']);
  const walk = (node, file) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXText' && /\p{L}/u.test(node.value)) {
      assert.ok(sharedWords.has(node.value.trim()), `Untranslated interface text in ${file}: ${node.value.trim()}`);
    }
    if (node.type === 'JSXAttribute' && ['title', 'alt', 'aria-label', 'placeholder'].includes(node.name?.name) && node.value?.type === 'Literal' && /\p{L}/u.test(node.value.value)) {
      assert.ok(sharedWords.has(node.value.value), `Untranslated accessible label in ${file}: ${node.value.value}`);
    }
    if (node.type === 'CallExpression' && node.callee?.name === 't') {
      assert.ok(node.arguments.length >= 2 && node.arguments.slice(0, 2).every((a) => a.type === 'Literal' && typeof a.value === 'string' && a.value.length), `Missing translation variant in ${file}`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => walk(child, file));
      else if (value && typeof value === 'object') walk(value, file);
    }
  };
  for (const file of files) walk(parseAst(readFileSync(file, 'utf8'), { lang: 'jsx' }, file.pathname), file.pathname);
});
