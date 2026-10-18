// Help guide: a header button, a dialog, the five steps, the verdict states, grades, limits and a tour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8');

test('the header has a Help button that opens a dialog', () => {
  assert.match(html, /<button id="helpBtn"[^>]*>Help<\/button>/);
  assert.match(html, /<dialog id="help"/);
  assert.match(app, /\$\('#helpBtn'\)\.addEventListener\('click', openHelp\)/);
});

test('the guide covers the question, five steps, verdicts, grades, typical estimates and limits', () => {
  const body = app.slice(app.indexOf('function openHelp'), app.indexOf('const TOUR'));
  assert.match(body, /enough money left to pay for the land/);
  assert.equal((body.match(/step\(\d, /g) || []).length, 5);
  for (const v of ['Works', 'Marginal', "Doesn't work", 'Land price needed', 'Incomplete']) assert.ok(body.includes(v), v);
  for (const g of ["gradeTag('A')", "gradeTag('B')", "gradeTag('C')", 'typical estimate', 'indicative early-design estimate']) assert.ok(body.includes(g), g);
});

test('the tour points at parts of the page that exist', () => {
  const sels = [...app.slice(app.indexOf('const TOUR')).matchAll(/sel: '([^']+)'/g)].map(m => m[1]);
  assert.ok(sels.length >= 6);
  for (const s of sels) {
    const id = s.match(/#([\w-]+)/)?.[1], tab = s.match(/data-tab="(\w+)"/)?.[1];
    if (id) assert.ok(html.includes(`id="${id}"`) || app.includes(`#${id}`), s);
    if (tab) assert.ok(html.includes(`data-tab="${tab}"`), s);
  }
});
