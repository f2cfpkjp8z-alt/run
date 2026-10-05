// ===== HRMAXalg2 — max heart rate used when you haven't entered one =====
const HRMAX = algo({
  key: 'hrmax', id: 'HRMAXalg2', name: 'Max heart rate', since: 4,
  summary: 'The max heart rate every zone, load and VO₂max number is scaled to.',
  steps: [
    'A value you enter in Profile always wins.',
    'Otherwise each run’s peak is its highest 30-second average heart rate (filters single-beat spikes).',
    'If the top peak is more than 12 bpm above the next one (with 3+ runs), it is treated as an optical-sensor glitch and the second-highest is used.',
    'Like Garmin, the age estimate (Tanaka: 208 − 0.7 × age) is used until a workout goes higher, because most training never reaches true max.',
  ],
  formula: 'HRmax = entered ?? max(robust peak of 30-s averages, 208 − 0.7·age) ?? 190',
  inputs: 'Heart rate of every run; your age.',
  limits: 'Age formulas are ±10 bpm for individuals. A measured max from a hard race finish or test is far better.',
  history: [
    ['HRMAXalg1', 1, 'Highest 30-s peak of any run, else 208 − 0.7 × age.'],
    ['HRMAXalg2', 4, 'Ignores a lone spike far above the next peak; the age estimate is a floor, like Garmin.'],
  ],
  live() { return st.user || st.sample ? `Now: <b>${Math.round(st.S.hrMaxEff)}</b> bpm — ${st.S.hrMax ? 'entered by you' : `runs peak at ${st.detectedMax || '–'}${st.ageMax ? `, age estimate ${st.ageMax}` : ''}`}.` : ''; },
  detect(peaks, age, entered) {
    const p = peaks.filter(x => x > 0).sort((a, b) => b - a);
    const detected = p.length ? Math.round(p.length >= 3 && p[0] - p[1] > 12 ? p[1] : p[0]) : null;
    const ageMax = age ? Math.round(208 - 0.7 * age) : null; // Tanaka 2001
    return { detected, ageMax, eff: entered || Math.max(detected || 0, ageMax || 0) || 190 };
  },
});
