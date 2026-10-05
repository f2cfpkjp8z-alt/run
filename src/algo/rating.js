// ===== RATEalg2 — VO₂max rating for your age & sex, and fitness age =====
// Cooper Institute norms (as used by Garmin): per age row, the VO2max where Fair, Good, Excellent, Superior begin.
const NORMS = { m: [[20, 41.7, 45.4, 51.1, 55.4], [30, 40.5, 44.0, 48.3, 54.0], [40, 38.5, 42.4, 46.4, 52.5], [50, 35.6, 39.2, 43.4, 48.9], [60, 32.3, 35.5, 39.5, 45.7], [70, 29.4, 32.3, 36.7, 42.1]],
  f: [[20, 36.1, 39.5, 43.9, 49.6], [30, 34.4, 37.8, 42.4, 47.4], [40, 33.0, 36.3, 39.7, 45.3], [50, 30.1, 33.0, 36.7, 41.1], [60, 27.5, 30.0, 33.0, 37.8], [70, 25.9, 28.1, 30.9, 36.7]] };
const RATE = algo({
  key: 'rating', id: 'RATEalg2', name: 'VO₂max rating & fitness age', since: 7,
  summary: 'Where your VO₂max sits among people of your age and sex — Poor, Fair, Good, Excellent or Superior — and the age whose average VO₂max matches yours.',
  steps: [
    'Uses the Cooper Institute norms Garmin uses: per sex and age decade, the VO₂max where Fair (40th percentile), Good (60th), Excellent (80th) and Superior (95th) begin.',
    'Between decades the boundaries are interpolated, so a birthday doesn’t make you jump a category.',
    'Fitness age is the age at which the average (50th-percentile) VO₂max equals yours: the midpoint of the Fair and Good boundaries, followed across ages and extended past the table’s ends with its slope.',
  ],
  formula: 'boundary(age) = linear between the two nearest decade rows\nrating = highest boundary your VO₂max reaches\nfitness age: median(a) = (Fair(a) + Good(a)) / 2 = VO₂max, solved for a (20–90)',
  inputs: 'VO₂max (VO2alg3), age and sex from your profile.',
  limits: 'Norms come from US treadmill tests; they rank you against the general population, not other runners.',
  history: [
    ['RATEalg1', 1, 'Step lookup by age decade.'],
    ['RATEalg2', 7, 'Interpolated between decades; adds fitness age and the gauge.'],
  ],
  live() { const S = st.S; return S.age ? `Rated as ${S.sex === 'f' ? 'female' : 'male'}, age ${S.age}.` : 'Add your age in Profile to get a rating.'; },
  names: ['Poor', 'Fair', 'Good', 'Excellent', 'Superior'],
  bounds(age, sex) {
    const rows = NORMS[sex] || NORMS.m, a = clamp(age, 20, 70); let k = 0;
    while (k < rows.length - 2 && a > rows[k + 1][0]) k++;
    const r0 = rows[k], r1 = rows[k + 1], f = (a - r0[0]) / (r1[0] - r0[0]);
    return [1, 2, 3, 4].map(i => r0[i] + (r1[i] - r0[i]) * f);
  },
  rate(v, age, sex) {
    if (!v || !age) return null;
    const b = RATE.bounds(age, sex); let k = 0; for (let i = 0; i < 4; i++) if (v >= b[i]) k = i + 1;
    return { k, name: RATE.names[k], bounds: b };
  },
  fitnessAge(v, sex) {
    if (!v) return null;
    const med = a => { const b = RATE.bounds(a, sex); return (b[0] + b[1]) / 2; };
    if (v >= med(20)) return Math.max(20, Math.round(20 - (v - med(20)) / ((med(20) - med(30)) / 10)));
    if (v <= med(70)) return Math.min(90, Math.round(70 + (med(70) - v) / ((med(60) - med(70)) / 10)));
    let lo = 20, hi = 70; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (med(m) > v) lo = m; else hi = m; }
    return Math.round((lo + hi) / 2);
  },
});
