// Program Value Visualizer — precedent presets and market scenarios.
// Pure functions: map a precedent's stack (bands as fractions of the above-grade floors) onto any form,
// and apply a scenario (a precedent's market context or a named market) as an overlay on the settings.
// A preset is a starting point drawn from a built or approved tower, never a recommendation.

const PARKING = [{ programme_id: 'AM7', share: 0.7 }, { programme_id: 'AM8', share: 0.3 }];
const GROUND = [{ programme_id: 'SE1', share: 0.6 }, { programme_id: 'AM4', share: 0.4 }];
const PLANT = [{ programme_id: 'SB2', share: 1 }];
const copy = mix => mix.map(m => ({ programme_id: m.programme_id, share: m.share }));
const isGroundMix = (mix, data) => mix.some(m => (data.programmes.get(m.programme_id)?.fits || []).includes('G') && ['SE', 'AM'].includes(data.programmes.get(m.programme_id)?.family_id));

/**
 * Map a preset onto the floors (geometry unchanged). Above-grade floor i of N takes the band that holds (i + 0.5) / N.
 * Level 1 keeps a retail-and-lobby mix unless the preset's base is already a street use; below grade is parking;
 * locked floors stay; plant floors go about every 20 floors when the preset lists none.
 */
export function applyPreset(floorsIn, preset, data, { podiumTopFloor = 4 } = {}) {
  const floors = [...floorsIn].sort((a, b) => a.level - b.level).map(f => ({ ...f, mix: copy(f.mix) }));
  const above = floors.filter(f => f.level >= 1), N = above.length;
  const presetHasPlant = preset.bands.some(b => b.mix.some(m => m.programme_id === 'SB2'));
  const maxLevel = N ? above[N - 1].level : 0;
  const plantAt = new Set();
  if (!presetHasPlant && N > 25) {
    const existing = above.filter(f => f.mix.length === 1 && f.mix[0].programme_id === 'SB2').map(f => f.level);
    if (existing.length) existing.forEach(l => plantAt.add(l));
    else for (let lv = podiumTopFloor + 20; lv < maxLevel - 2; lv += 20) plantAt.add(lv);
  }
  const notes = [];
  const bandAt = x => preset.bands.find(b => x >= b.from - 1e-9 && x < b.to - 1e-9) || preset.bands[preset.bands.length - 1];
  let i = 0;
  for (const f of floors) {
    if (f.locked) { if (f.level >= 1) i++; continue; }
    if (f.level < 1) { f.mix = copy(PARKING); continue; }
    const b = bandAt((i + 0.5) / N); i++;
    if (plantAt.has(f.level)) { f.mix = copy(PLANT); continue; }
    if (f.level === 1 && !isGroundMix(b.mix, data)) { f.mix = copy(GROUND); continue; }
    f.mix = copy(b.mix);
  }
  if (plantAt.size) notes.push(`Plant floors added at ${[...plantAt].map(l => `L${l}`).join(', ')} (the precedent lists none).`);
  if (floors.some(f => f.locked)) notes.push('Locked floors were kept.');
  return { floors, notes };
}

/** Apply scenario items ({setting, to}) on top of settings. valueScale items multiply; others replace. Returns new settings. */
export function applyScenario(settings, items = []) {
  const s = { ...settings, valueScale: { ...(settings.valueScale || {}) } };
  for (const it of items) {
    if (it.setting.startsWith('valueScale.')) { const id = it.setting.split('.')[1]; s.valueScale[id] = (s.valueScale[id] ?? 1) * it.to; }
    else s[it.setting] = it.to;
  }
  return s;
}

/** The items of the active scenario: a named market scenario from the pack or a precedent's context. */
export function scenarioItems(scenario, data, precedents) {
  if (!scenario) return [];
  if (scenario.kind === 'market') return data.assumptions.scenarios?.[scenario.id]?.items || [];
  if (scenario.kind === 'precedent') return (precedents?.presets || []).find(p => p.id === scenario.id)?.context?.items || [];
  return [];
}
export function scenarioLabel(scenario, data, precedents) {
  if (!scenario) return null;
  if (scenario.kind === 'market') return data.assumptions.scenarios?.[scenario.id]?.label || null;
  const p = (precedents?.presets || []).find(x => x.id === scenario.id);
  return p?.context?.label || (p ? `${p.name} market` : null);
}

/** A compact description of a preset's stack for small drawings: [{from, to, family}] by main programme. */
export function presetStrip(preset, data) {
  return preset.bands.map(b => {
    const main = [...b.mix].sort((x, y) => y.share - x.share)[0].programme_id;
    return { from: b.from, to: b.to, family: data.programmes.get(main)?.family_id, main };
  });
}
