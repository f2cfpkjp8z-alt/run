// ===== HRMAXalg2 — max heart rate used when you haven't entered one =====
// highest 6-second average heart rate of a run (cached; summary rows use their max HR)
const peakCache = new WeakMap();
function hrPeak6(r) {
  if (r.summary) return r.maxHR || 0;
  if (peakCache.has(r)) return peakCache.get(r);
  let m = 0; const h = r.hr; for (let i = 2; i < r.n; i++) if (h[i] > 0 && h[i - 1] > 0 && h[i - 2] > 0) m = Math.max(m, (h[i] + h[i - 1] + h[i - 2]) / 3);
  peakCache.set(r, m); return m;
}
const HRMAX = algo({
  key: 'hrmax', id: 'HRMAXalg3', name: 'Max heart rate', since: 9,
  summary: 'The max heart rate that VO₂max, zones and load are scaled to. It matters most for VO₂max: every 3 bpm moves it by about 1.',
  steps: [
    'A value you enter in Profile always wins — use the one Garmin shows (Garmin Connect → Heart rate zones) to get Garmin’s numbers.',
    'Otherwise each run’s peak is its highest 6-second average heart rate (filters single-beat glitches but keeps real peaks).',
    'If the top peak is more than 12 bpm above the next one (with 3+ runs), it is treated as an optical-sensor glitch and the second-highest is used.',
    'Like Garmin, the age default 220 − age is used until a workout goes higher, because most training never reaches true max.',
  ],
  formula: 'HRmax = entered ?? max(robust peak of 6-s averages, 220 − age) ?? 190',
  inputs: 'Heart rate of every run; your age.',
  limits: 'Age formulas are ±10 bpm for individuals. A measured max from a hard race finish or test is far better.',
  history: [
    ['HRMAXalg1', 1, 'Highest 30-s peak of any run, else 208 − 0.7 × age.'],
    ['HRMAXalg2', 4, 'Ignores a lone spike far above the next peak; Tanaka age estimate (208 − 0.7 × age) as a floor.'],
    ['HRMAXalg3', 9, '6-second peaks instead of 30-second ones (30-s averages sat 2–4 bpm under the real peak) and Garmin’s 220 − age default, so VO₂max lines up with Garmin’s.'],
  ],
  live() { return st.user || st.sample ? `Now: <b>${Math.round(st.S.hrMaxEff)}</b> bpm — ${st.S.hrMax ? 'entered by you' : `runs peak at ${st.detectedMax || '–'}${st.ageMax ? `, age default ${st.ageMax}` : ', add your age for Garmin’s default'}`}.` : ''; },
  detect(runs, age, entered) {
    const p = runs.map(hrPeak6).filter(x => x > 0).sort((a, b) => b - a);
    const detected = p.length ? Math.round(p.length >= 3 && p[0] - p[1] > 12 ? p[1] : p[0]) : null;
    const ageMax = age ? Math.round(220 - age) : null; // Garmin's default (Fox)
    return { detected, ageMax, eff: entered || Math.max(detected || 0, ageMax || 0) || 190 };
  },
});
