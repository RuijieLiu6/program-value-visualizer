// Program Value Visualizer — the "money stack": the same steps the Tower Money Book teaches,
// read from a calculator result. Coins in (what the floors are worth), then each pile that comes out
// (public upkeep, building, design, interest, City charges, the builder's profit, the City's share of the
// land lift), and what is left to pay for the land, compared with the land price.
// Pure functions (no DOM): the HTML is returned as a string.

/** Steps from an evaluate() result. The amounts add up exactly to the residual land value after CAC. */
export function moneySteps(result) {
  const t = result.totals;
  const steps = [
    { key: 'value', sym: 'coin', label: 'What the finished floors are worth', amount: t.gdv },
    t.publicDeduction ? { key: 'public', sym: 'public', label: 'Running the free public floors', amount: -t.publicDeduction } : null,
    { key: 'hard', sym: 'brick', label: 'Building it', amount: -t.hard },
    { key: 'soft', sym: 'plans', label: 'Design, permits, insurance', amount: -t.soft },
    { key: 'finance', sym: 'clock', label: 'Interest while it is built', amount: -t.finance },
    { key: 'charges', sym: 'city', label: 'City charges', amount: -t.charges },
    { key: 'profit', sym: 'piggy', label: 'Builder’s profit', amount: -t.profit },
    t.cac ? { key: 'cac', sym: 'city', label: 'City’s share of the land lift (CAC)', amount: -t.cac } : null,
  ].filter(Boolean);
  return { steps, left: t.rlvAfterCac, land: t.landPrice ?? null, landEstimated: !!t.landEstimated, verdict: result.verdict };
}

/** Kid-sized steps from pretend coins (the book's own example), using the tool's ratios. */
export function toySteps({ worth = 100, build = 50, softShare = 0.25, financeShare = 0.195, city = 5, profitShare = 0.15, land = 10 } = {}) {
  const soft = build * softShare, finance = (build + soft) * financeShare, cost = build + soft + finance + city, profit = cost * profitShare;
  const steps = [
    { key: 'value', sym: 'coin', label: 'What the floors are worth', amount: worth },
    { key: 'hard', sym: 'brick', label: 'Building it', amount: -build },
    { key: 'soft', sym: 'plans', label: 'Design and permits', amount: -soft },
    { key: 'finance', sym: 'clock', label: 'Interest while building', amount: -finance },
    { key: 'charges', sym: 'city', label: 'City charges', amount: -city },
    { key: 'profit', sym: 'piggy', label: 'Builder’s thank-you', amount: -profit },
  ];
  const left = steps.reduce((a, s) => a + s.amount, 0);
  const verdict = left >= land ? 'works' : land > 0 && (land - left) / land <= 0.1 ? 'marginal' : 'doesnt_work';
  return { steps, left, land, landEstimated: false, verdict, cost, profit };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The money stack as HTML rows: symbol, label, a floating bar on one shared scale, amount.
 * opts: fmt (number -> text), sym (name -> svg string), landLabel.
 */
export function moneyStackHTML(ms, { fmt = x => `${Math.round(x)}`, sym = () => '', landLabel = 'Price of the land', leftLabel = 'Left to pay for the land' } = {}) {
  let run = 0;
  const bars = ms.steps.map(s => { const from = run; run += s.amount; return { ...s, from, to: run }; });
  const pts = [0, ...bars.flatMap(b => [b.from, b.to]), ms.left, ms.land ?? 0];
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const pos = (a, b) => { const x0 = Math.min(a, b), x1 = Math.max(a, b); return `left:${((x0 - lo) / span * 100).toFixed(2)}%;width:${Math.max(0.6, (x1 - x0) / span * 100).toFixed(2)}%`; };
  const zero = `<span class="ms-zero" style="left:${((0 - lo) / span * 100).toFixed(2)}%"></span>`;
  const row = (cls, symName, label, style, amount, extra = '') => `<div class="ms-row ${cls}"><span class="ms-sym">${sym(symName)}</span><span class="ms-label">${esc(label)}</span><span class="ms-track">${zero}<span class="ms-bar" style="${style}"></span>${extra}</span><span class="ms-amt">${esc(amount)}</span></div>`;
  const out = bars.map(b => row(b.amount >= 0 ? `ms-in ms-${b.key}` : `ms-out ms-${b.key}`, b.sym, b.label, pos(b.from, b.to), `${b.amount >= 0 ? '+' : '−'}${fmt(Math.abs(b.amount))}`));
  const enough = ms.land == null ? ms.left >= 0 : ms.left >= ms.land;
  out.push(row(`ms-left ${enough ? 'ms-ok' : 'ms-short'}`, 'land', leftLabel, pos(0, ms.left), `${ms.left < 0 ? '−' : ''}${fmt(Math.abs(ms.left))}`,
    ms.land != null ? `<span class="ms-landmark" style="left:${((ms.land - lo) / span * 100).toFixed(2)}%" title="${esc(landLabel)}"></span>` : ''));
  if (ms.land != null) out.push(row('ms-land', 'land', `${landLabel}${ms.landEstimated ? ' (estimated)' : ''}`, pos(0, ms.land), fmt(ms.land)));
  return `<div class="mstack" role="table" aria-label="Money stack: coins in, coins out, and what is left for the land">${out.join('')}</div>`;
}

/** Shared styles for the money stack (both pages inject this once). Uses the host page's tokens. */
export const MONEY_STACK_CSS = `
.mstack{display:flex;flex-direction:column;gap:4px;font-size:13px;container-type:inline-size}
.ms-row{display:grid;grid-template-columns:26px minmax(0,1.3fr) minmax(0,2fr) auto;gap:8px;align-items:center;min-height:30px}
.ms-sym{line-height:0}
.ms-label{color:var(--ink,#1d2730);min-width:0}
.ms-track{position:relative;height:16px;border-radius:3px;background:color-mix(in srgb,var(--line,#d5dad7) 45%,transparent)}
.ms-zero{position:absolute;top:-3px;bottom:-3px;width:1px;background:var(--muted,#5d6973)}
.ms-bar{position:absolute;top:2px;bottom:2px;border-radius:2px}
.ms-amt{font:500 12.5px/1 var(--mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;text-align:right;min-width:64px}
.ms-in .ms-bar{background:var(--sym-coin,#f0c13b)}
.ms-hard .ms-bar{background:var(--sym-brick,#c8643b)}
.ms-soft .ms-bar{background:var(--sym-plans,#4f7cac)}
.ms-finance .ms-bar{background:var(--sym-clock,#9b87c9)}
.ms-charges .ms-bar,.ms-cac .ms-bar{background:var(--sym-city,#5b7b95)}
.ms-profit .ms-bar{background:var(--sym-piggy,#e88fa8)}
.ms-public .ms-bar{background:var(--sym-public,#e07b32)}
.ms-left{border-top:1px solid var(--line,#d5dad7);padding-top:4px;font-weight:600}
.ms-left.ms-ok .ms-bar{background:var(--sym-good,#2f9a5e)}
.ms-left.ms-short .ms-bar{background:var(--sym-bad,#d0473f)}
.ms-land .ms-bar{background:repeating-linear-gradient(135deg,var(--sym-land,#4f9b5a) 0 6px,color-mix(in srgb,var(--sym-land,#4f9b5a) 55%,transparent) 6px 12px)}
.ms-landmark{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1px;background:var(--sym-land,#4f9b5a);border-radius:2px}
@container (max-width:480px){.ms-row{grid-template-columns:22px minmax(0,1fr) auto;row-gap:3px}.ms-sym{grid-row:1;grid-column:1}.ms-label{grid-row:1;grid-column:2}.ms-amt{grid-row:1;grid-column:3}.ms-track{grid-row:2;grid-column:2/4}}
`;
