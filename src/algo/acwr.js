// ===== ACWRalg2 — 7-day load against your optimal range =====
const ACWR = algo({
  key: 'acwr', id: 'ACWRalg2', name: 'Training load range', since: 9,
  summary: 'Your recent load compared with your usual load, like Garmin’s acute load with its optimal range.',
  steps: [
    'Daily TRIMP (LOADalg2) feeds two exponentially weighted averages: 7 days (acute) and 28 days (chronic). Weighted averages react smoothly and predict injury risk better than plain 7- and 28-day sums (Williams et al. 2017).',
    'Ratio 0.8–1.3 is the productive range; under 0.8 fitness may slip; 1.3–1.5 high; above 1.5 injury risk rises sharply (Gabbett 2016).',
    'Shown as a 7-day load: the acute average × 7, with the optimal range 0.8–1.3 × the chronic average × 7.',
  ],
  formula: 'acute += (load − acute)·2/(7+1)\nchronic += (load − chronic)·2/(28+1)\nratio = acute / chronic',
  inputs: 'Training load of each day.',
  limits: 'Needs about 4 weeks of history; the risk bands come from team-sport studies.',
  history: [['ACWRalg1', 4, 'Rolling 7 vs 28-day sums.'], ['ACWRalg2', 9, 'Exponentially weighted averages (Williams 2017), no sudden drop when a hard day leaves the window.']],
  series(runs, res, asOf) { // per day: [t, acute7, chronic7, ratio]
    if (!runs.length) return [];
    const byDay = new Map(); runs.forEach((r, i) => { const k = dayStart(r.start); byDay.set(k, (byDay.get(k) || 0) + (res[i].load || 0)); });
    const la = 2 / 8, lc = 2 / 29, out = []; let a = 0, c = 0;
    for (let t = dayStart(runs[0].start); t <= dayStart(asOf); t = dayStart(t + DAY * 1.5)) { const L = byDay.get(t) || 0; a += (L - a) * la; c += (L - c) * lc; out.push([t, a * 7, c * 7, c > 0 ? a / c : null]); }
    return out;
  },
  status: ratio => ratio == null ? null : ratio < 0.8 ? ['Low', 'warn', 'Below your usual — fitness can slip if this lasts.'] : ratio <= 1.3 ? ['Optimal', 'good', 'In your productive range.'] : ratio <= 1.5 ? ['High', 'warn', 'Above usual. Keep easy days easy.'] : ['Very high', 'crit', 'Sharp jump — injury risk rises. Ease off.'],
  compute(runs, res, asOf) {
    const s = ACWR.series(runs, res, asOf), last = s[s.length - 1];
    if (!last || s.length < 14) return { acute: last ? last[1] : 0, chronic: 0, ratio: null, status: null };
    return { acute: last[1], chronic: last[2], ratio: last[3], status: ACWR.status(last[3]) };
  },
});
