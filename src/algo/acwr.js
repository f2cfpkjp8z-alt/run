// ===== ACWRalg1 — 7-day load against your optimal range =====
const ACWR = algo({
  key: 'acwr', id: 'ACWRalg1', name: 'Training load range', since: 4,
  summary: 'Your last 7 days of load compared with your usual week, like Garmin’s acute load.',
  steps: [
    'Acute load = TRIMP of the last 7 days. Chronic load = TRIMP of the last 28 days ÷ 4.',
    'Ratio 0.8–1.3 is the productive range; under 0.8 fitness may slip; 1.3–1.5 high; above 1.5 injury risk rises sharply (Gabbett 2016).',
  ],
  formula: 'ratio = load(7 d) / (load(28 d) / 4)',
  inputs: 'Training load of each workout.',
  limits: 'Needs about 4 weeks of history; the risk bands come from team-sport studies.',
  history: [['ACWRalg1', 4, 'Rolling 7 vs 28-day sums.']],
  compute(runs, res, asOf) {
    const T = dayStart(asOf) + DAY; let a = 0, c = 0;
    runs.forEach((r, i) => { const L = res[i].load || 0; if (r.start >= T - 7 * DAY && r.start < T) a += L; if (r.start >= T - 28 * DAY && r.start < T) c += L; });
    c /= 4; const ratio = c ? a / c : null;
    const s = ratio == null ? null : ratio < 0.8 ? ['Low', 'warn', 'Below your usual — fitness can slip if this lasts.'] : ratio <= 1.3 ? ['Optimal', 'good', 'In your productive range.'] : ratio <= 1.5 ? ['High', 'warn', 'Above usual. Keep easy days easy.'] : ['Very high', 'crit', 'Sharp jump — injury risk rises. Ease off.'];
    return { acute: a, chronic: c, ratio, status: s };
  },
});
