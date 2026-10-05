// ===== HRMAXalg2 — max heart rate used when you haven't entered one =====
// highest 6-second average heart rate of a run (cached; summary rows use their max HR)
const peakCache = new WeakMap();
function hrPeak6(r) {
  if (r.summary) return r.maxHR || 0;
  if (peakCache.has(r)) return peakCache.get(r);
  let m = 0; const h = r.hr; for (let i = 2; i < r.n; i++) if (h[i] > 0 && h[i - 1] > 0 && h[i - 2] > 0) m = Math.max(m, (h[i] + h[i - 1] + h[i - 2]) / 3);
  // a real effort holds near its peak; a 6-s peak more than 10 bpm above the run's 30-s peak is a sensor spike
  if (r.hrPeak && m - r.hrPeak > 10) m = r.hrPeak;
  peakCache.set(r, m); return m;
}
const HRMAX = algo({
  key: 'hrmax', id: 'HRMAXalg4', name: 'Max heart rate', since: 10,
  summary: 'The max heart rate that VO₂max, zones and load are scaled to. It matters most for VO₂max: every 3 bpm moves it by about 1.',
  steps: [
    'A value you enter in Profile always wins — use the one Garmin shows (Garmin Connect → Heart rate zones) to get Garmin’s numbers. Leave it empty for auto.',
    'Auto starts from age: 220 − age, Garmin’s default. Height and weight are not used — studies find they don’t predict max heart rate; age explains most of the difference between people.',
    'Otherwise each run’s peak is its highest 6-second average heart rate (filters single-beat glitches but keeps real peaks).',
    'A peak is trusted only if the run holds near it: when the 6-second peak is more than 10 bpm above that run’s 30-second peak, it is an optical-sensor spike and the 30-second peak is used.',
    'Auto then rises whenever an imported run goes higher (never lower, because most training doesn’t reach true max). The app tells you when an import raises it and which run did.',
  ],
  formula: 'HRmax = entered ?? max(robust peak of 6-s averages, 220 − age) ?? 190',
  inputs: 'Heart rate of every run; your age.',
  limits: 'Age formulas are ±10 bpm for individuals. A measured max from a hard race finish or test is far better.',
  history: [
    ['HRMAXalg1', 1, 'Highest 30-s peak of any run, else 208 − 0.7 × age.'],
    ['HRMAXalg2', 4, 'Ignores a lone spike far above the next peak; Tanaka age estimate (208 − 0.7 × age) as a floor.'],
    ['HRMAXalg3', 9, '6-second peaks instead of 30-second ones (30-s averages sat 2–4 bpm under the real peak) and Garmin’s 220 − age default, so VO₂max lines up with Garmin’s.'],
    ['HRMAXalg4', 10, 'Spike check moved inside each run (6-s vs 30-s peak). Comparing against other runs wrongly discarded a real hard effort when you had only a few runs.'],
  ],
  live() { return st.hm ? `Now: <b>${HRMAX.describe(st.hm)}</b>.` : ''; },
  // returns the max HR in use and where it came from: 'entered' | 'detected' (with the run) | 'age' | 'default'
  detect(runs, age, entered) {
    const p = runs.map(r => [hrPeak6(r), r]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]);
    const top = p.length ? p[0] : null;
    const detected = top ? Math.round(top[0]) : null, ageMax = age ? Math.round(220 - age) : null; // Garmin's default (Fox)
    const source = entered ? 'entered' : detected && detected >= (ageMax || 0) ? 'detected' : ageMax ? 'age' : 'default';
    return { detected, run: top ? top[1] : null, ageMax, source, eff: entered || Math.max(detected || 0, ageMax || 0) || 190 };
  },
  // one line saying which max HR is used and why
  describe(hm) {
    const r = hm.run, when = r ? `${esc(r.name)}, ${fmtDate(r.start, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
    return hm.source === 'entered' ? `${hm.eff} bpm, entered by you` : hm.source === 'detected' ? `${hm.eff} bpm, auto — detected in ${when}` : hm.source === 'age' ? `${hm.eff} bpm, auto — 220 − age (your runs peak at ${hm.detected || '–'}; a higher run will raise it)` : '190 bpm, default — add your age or import runs with heart rate';
  },
});
