// ===== BESTalg2 — best efforts and race-like efforts =====
const EFFORTS = [[1000, '1 km'], [5000, '5 km'], [10000, '10 km'], [21097.5, 'Half marathon'], [42195, 'Marathon']];
// Average %HRmax a runner typically holds in an all-out effort of this length (5K ~0.94, 10K ~0.92, HM ~0.88, M ~0.84).
const raceHR = min => 0.81 + 0.16 * Math.exp(-min / 120);
const BEST = algo({
  key: 'best', id: 'BESTalg2', name: 'Best efforts', since: 4,
  summary: 'Your fastest 1 km, 5 km, 10 km, half and full marathon inside any run, and which of them count as race-like for VO₂max.',
  steps: [
    'A sliding window over the run finds the shortest elapsed time covering each distance; the time is scaled to the exact distance.',
    'An effort of 3 km or more counts as race-like when its average heart rate is within 3 points of what an all-out effort of that length needs; it then feeds VO₂max (VO2alg3). Its Daniels VDOT is also shown for runners who use Daniels’ tables.',
  ],
  formula: 'time = Δt · D / Δd   (window just covering D)\nrace-like if avgHR/HRmax ≥ 0.81 + 0.16·e^(−min/120) − 0.03\nVDOT (Daniels & Gilbert) = VO₂(v) / (0.8 + 0.1894·e^(−0.0128 t) + 0.2990·e^(−0.1933 t))',
  inputs: 'Distance, time, heart rate.',
  limits: 'GPS glitches can shorten a distance; device (foot pod or watch) distance is used when present.',
  history: [
    ['BESTalg1', 1, 'Whole-sample window; race-like at ≥88% HRmax under 30 min, else ≥85%.'],
    ['BESTalg2', 4, 'Time scaled to the exact distance; race-like threshold depends on effort length, so tempo runs no longer count as races.'],
  ],
  efforts(d, hr, n, dist, hrMax) {
    const out = [], pre = new Float64Array(n + 1), prc = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { pre[i + 1] = pre[i] + (hr[i] > 0 ? hr[i] : 0); prc[i + 1] = prc[i] + (hr[i] > 0 ? 1 : 0); }
    for (const [D, label] of EFFORTS) {
      if (dist < D) continue;
      let best = Infinity, bi = 0, bj = 0, i = 0;
      for (let j = 0; j < n; j++) { while (i < j && d[j] - d[i + 1] >= D) i++; if (d[j] - d[i] >= D) { const t = (j - i) * DT * D / (d[j] - d[i]); if (t < best) { best = t; bi = i; bj = j; } } }
      if (!isFinite(best)) continue;
      const c = prc[bj + 1] - prc[bi], ehr = c > (bj - bi) * 0.8 ? (pre[bj + 1] - pre[bi]) / c : null;
      const e = { D, label, sec: best, hr: ehr };
      if (D >= 3000 && ehr && ehr / hrMax >= raceHR(best / 60) - 0.03) e.vdot = vdotOf(D, best);
      out.push(e);
    }
    return out;
  },
  summaryEffort(r, hrMax) { return r.dist >= 3000 && r.avgHR / hrMax >= raceHR(r.dur / 60) - 0.03 ? { D: r.dist, label: 'Run', sec: r.dur, hr: r.avgHR, vdot: vdotOf(r.dist, r.dur) } : null; },
});
