// ===== RATEalg3 — VO₂max rating for your age & sex, and fitness age =====
// Fitness age reference: mean VO₂max of healthy adults by age, HUNT Fitness Study (Loe et al. 2013, n = 3,816),
// fitted per sex as a − b·age; body adjustments from NTNU's fitness model (Nes et al. 2011/2014).
const HUNT = { m: { a: 63.45, b: 0.376, rhr: 68 }, f: { a: 51.15, b: 0.308, rhr: 72 } };
// Cooper Institute norms (as used by Garmin): per age row, the VO2max where Fair, Good, Excellent, Superior begin.
const NORMS = { m: [[20, 41.7, 45.4, 51.1, 55.4], [30, 40.5, 44.0, 48.3, 54.0], [40, 38.5, 42.4, 46.4, 52.5], [50, 35.6, 39.2, 43.4, 48.9], [60, 32.3, 35.5, 39.5, 45.7], [70, 29.4, 32.3, 36.7, 42.1]],
  f: [[20, 36.1, 39.5, 43.9, 49.6], [30, 34.4, 37.8, 42.4, 47.4], [40, 33.0, 36.3, 39.7, 45.3], [50, 30.1, 33.0, 36.7, 41.1], [60, 27.5, 30.0, 33.0, 37.8], [70, 25.9, 28.1, 30.9, 36.7]] };
const RATE = algo({
  key: 'rating', id: 'RATEalg3', name: 'VO₂max rating & fitness age', since: 16,
  summary: 'Where your VO₂max sits among people of your age and sex — Poor, Fair, Good, Excellent or Superior (Garmin’s table) — and your fitness age: the age of an average healthy person as fit as you, counting VO₂max, resting heart rate and BMI like Garmin.',
  steps: [
    'Uses the Cooper Institute norms Garmin uses: per sex and age decade, the VO₂max where Fair (40th percentile), Good (60th), Excellent (80th) and Superior (95th) begin.',
    'Between decades the boundaries are interpolated, so a birthday doesn’t make you jump a category.',
    'Fitness age starts from VO₂max and adds what Garmin also counts: a low resting heart rate (+0.155 ml/kg/min per bpm below average, from NTNU’s fitness model) and a lean BMI (+0.75 per point under 25; Jackson’s model), each capped at ±5.',
    'That fitness-adjusted VO₂max is compared with the average of healthy people of each age (HUNT Fitness Study, 3,816 adults with measured VO₂max), which falls about 0.38 (men) / 0.31 (women) per year. Fitness age is where the two meet, 20–90.',
    'Check: a 37-year-old man with VO₂max 48, resting HR 46 and BMI 24.2 gets 30 (34 with VO₂max 46.8); Garmin showed 32.',
    'Garmin also counts weekly vigorous minutes, which the app doesn’t see, so it can differ by a year or two.',
  ],
  formula: 'rating: Cooper boundaries, linear between decade rows\nfit = VO₂max + 0.155·(RHRavg − RHR) + 0.754·(25 − BMI)     RHRavg = 68 men / 72 women\nfitness age = (a − fit) / b     men a = 63.45, b = 0.376 · women a = 51.15, b = 0.308',
  inputs: 'VO₂max (VO2alg3); age, sex, resting heart rate, height and weight from your profile.',
  limits: 'Norms come from US treadmill tests; they rank you against the general population, not other runners.',
  history: [
    ['RATEalg1', 1, 'Step lookup by age decade.'],
    ['RATEalg2', 7, 'Interpolated between decades; adds fitness age (from Cooper medians) and the gauge.'],
    ['RATEalg3', 16, 'Fitness age like Garmin’s: VO₂max plus resting-HR and BMI terms (NTNU / Jackson), against the HUNT healthy-adult reference. Cooper medians barely change from 20 to 39, so 46.8 at 37 showed 20; now 30–34, Garmin 32.'],
  ],
  live() { const S = st.S; return S.age ? `Rated as ${S.sex === 'f' ? 'female' : 'male'}, age ${S.age}; resting HR ${S.hrRest}${S.weight && S.height ? `, BMI ${(S.weight / (S.height / 100) ** 2).toFixed(1)}` : ' (add height and weight for BMI)'}.` : 'Add your age in Profile to get a rating.'; },
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
  fitnessAge(v, sex, rhr, weight, height) {
    if (!v) return null; const h = HUNT[sex] || HUNT.m;
    const fit = v + (rhr ? clamp(0.155 * (h.rhr - rhr), -5, 5) : 0) + (weight && height ? clamp(0.754 * (25 - weight / (height / 100) ** 2), -5, 5) : 0);
    return clamp(Math.round((h.a - fit) / h.b), 20, 90);
  },
});
