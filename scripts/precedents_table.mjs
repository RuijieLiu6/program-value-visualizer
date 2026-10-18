// Writes the comparison table in docs/precedents.md: each precedent mapped onto the default sample form,
// under 2026 now, under its own market context, and under the "strong market (about 2021)" scenario.
// Usage: node scripts/precedents_table.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexData, evaluate, sampleTower, defaultSettings } from '../core/econ_core.js';
import { applyPreset, applyScenario } from '../core/precedents.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = r => JSON.parse(fs.readFileSync(path.join(ROOT, r), 'utf8'));
const P = 'packs/vancouver-2026/';
const mk = b => indexData({ families: J('catalogue/families.json'), programmes: J('catalogue/programmes.json'), values: J(P + 'values.json'), costs: J(P + 'costs.json'), charges: J(P + 'charges.json'), assumptions: J(P + 'assumptions.json'), codeRules: J(P + 'code_rules.json'), sources: J(P + 'sources.json'), brief: J(`briefs/${b}/brief.json`) });
const prec = J('catalogue/precedents.json');
const V = { works: 'Works', marginal: 'Marginal', doesnt_work: "Doesn't work", needs_land: 'Land needed', incomplete: 'Incomplete' };
const M = x => `${x < 0 ? '−' : '+'}${Math.abs(x / 1e6).toFixed(0)}`;
const cell = r => `${V[r.verdict]} (${M(r.totals.rlvAfterCac - (r.totals.landPrice ?? 0))})`;
const out = {};
for (const b of ['vtc-2026', 'none']) {
  const data = mk(b), strong = data.assumptions.scenarios.strong_2021.items;
  out[b] = prec.presets.map(p => {
    const fl = applyPreset(sampleTower(), p, data).floors;
    const now = evaluate(fl, data, {});
    const own = p.context ? evaluate(fl, data, applyScenario(defaultSettings(data), p.context.items)) : null;
    const st = evaluate(fl, data, applyScenario(defaultSettings(data), strong));
    const fsr = now.fsr.requiredNonres ? `${now.fsr.nonresFsrWithHotel.toFixed(1)} ${now.fsr.pass ? '✓' : '✗'}` : '—';
    return `| ${p.name} | ${cell(now)} | ${own ? cell(own) : '—'} | ${cell(st)} | ${fsr} |`;
  });
}
const head = '| Precedent | 2026 now | Its own context | Strong market (≈2021) | Non-res FSR (9.0 rule) |\n| --- | --- | --- | --- | --- |';
const table = `### Under the Vancouver Tall Challenge brief (site 11,468 m², 9.0 FSR non-residential, land estimated at C$407 M)\n\n${head}\n${out['vtc-2026'].join('\n')}\n\n### With no brief (same form; land estimated from the ground-floor plate, C$142 M)\n\n${head.replace(' | Non-res FSR (9.0 rule) |', ' | — |')}\n${out.none.join('\n')}\n`;
const f = path.join(ROOT, 'docs/precedents.md');
const doc = fs.readFileSync(f, 'utf8');
const start = doc.indexOf('<!-- table -->'), end = doc.indexOf('<!-- /table -->');
fs.writeFileSync(f, doc.slice(0, start + 14) + '\n' + table + doc.slice(end));
console.log(table);
