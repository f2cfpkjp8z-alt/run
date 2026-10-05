// ===== VO2alg2 — VO₂max (heart rate against speed, fused with race-like efforts) =====
// Oxygen cost of flat running (Daniels & Gilbert), v in m/s -> ml/kg/min. This defines the VDOT scale:
// VO2max = vo2Cost(vVO2max), the speed a runner can hold for ~11 min.
const vo2Cost = v => { const m = v * 60; return Math.max(3.5, -4.60 + 0.182258 * m + 0.000104 * m * m); };
// Speed (m/s) whose Daniels cost equals vo2
function vFor(vo2) { let lo = 0, hi = 10; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (vo2Cost(m) < vo2) lo = m; else hi = m; } return lo; }
// Daniels & Gilbert: VDOT from a race distance and time
function vdotOf(distM, sec) {
  const t = sec / 60, v = distM / t;
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pct;
}
const VO2 = algo({
  key: 'vo2', id: 'VO2alg2', name: 'VO₂max', since: 4,
  summary: 'Your aerobic ceiling in ml/kg/min, on the same VDOT scale as race results and Garmin-style race predictions.',
  steps: [
    'Each run is resampled to 2-second steps; speed is converted to grade-adjusted (flat-equivalent) speed (GAPalg1).',
    'Only steady 60-second windows count: after a 5-minute warm-up, pace stable for 2 minutes (±8%), gradient under 8%, heart rate at 35–95% of reserve. Windows after 45 minutes weigh less because of cardiac drift.',
    'Heart rate rises in step with oxygen use (%HRR ≈ %VO₂ reserve), and oxygen use rises in step with speed. So a weighted line of speed against heart rate is fitted through the windows plus one anchor: resting heart rate at zero speed. One Huber pass down-weights outliers.',
    'Extending the line to max heart rate (HRMAXalg2) gives your speed at VO₂max. VO₂max is the Daniels–Gilbert oxygen cost of that speed. Needs 6+ windows; confidence grows with the number of windows and how tightly they fit.',
    'Daily VO₂max blends run estimates from the last 60 days with a 14-day half-life, weighted by confidence. Race-like efforts (BESTalg2) add a VDOT reading by inverse-variance weighting; a race fades out over 60 days.',
  ],
  formula: 'speed(HR) = a + b·HR      weighted fit with anchor (HRrest, 0)\nvVO₂max = speed(HRmax)\nVO₂max = −4.60 + 0.182258·v + 0.000104·v²     v in m/min\nday = Σ wᵢ·estᵢ / Σ wᵢ,  wᵢ = confᵢ · 0.5^(ageᵢ/14)\nfused = (day/σ_hr² + race/σ_race²) / (1/σ_hr² + 1/σ_race²),  σ_race = 2 + age/20',
  inputs: 'Heart rate, distance, altitude; your max and resting heart rate. Not weight, height or age — see below.',
  notes: [
    'Weight: VO₂max is already per kilogram, and running costs about the same oxygen per kilogram for everyone, so weight cancels out. Losing weight raises VO₂max because the same engine carries fewer kilograms — your runs then get faster at the same heart rate, and the estimate follows. Weight is only used to show absolute VO₂ in L/min.',
    'Height: no effect. Formulas that guess VO₂max without exercise use BMI, but your actual heart rate and pace measure it directly and far more accurately.',
    'Age and sex: they don’t change your measured VO₂max, but they decide how it is rated (RATEalg2) and your fitness age. Age also sets the default max heart rate (HRMAXalg2), which does affect VO₂max.',
  ],
  limits: 'Accuracy depends most on max and resting heart rate. Heat, illness, caffeine and optical-HR errors shift single runs; the blend smooths them.',
  history: [
    ['VO2alg1', 1, 'Regressed Daniels’ curved oxygen cost directly on heart rate, anchored at (HRrest, 3.5 ml/kg/min). Read 3–8 ml/kg/min low on easy runs because measured VO₂ rises linearly with speed while Daniels’ curve bends.'],
    ['VO2alg2', 4, 'Regresses grade-adjusted speed on heart rate and converts vVO₂max with Daniels’ cost (unbiased in tests at VO₂max 35–55). Race efforts must match a duration-appropriate heart rate and fade out smoothly.'],
  ],
  live() { const S = st.S; return `Using max HR <b>${Math.round(S.hrMaxEff)}</b> and resting HR <b>${S.hrRest}</b> bpm.`; },
  // CSV summary rows: only average HR and pace are known
  fromSummary(v, q) { return q > 0.45 && q < 0.95 && v > 1.6 ? { vmax: v / q, est: vo2Cost(v / q), conf: 0.3 } : {}; },
  fromRun(c) { // c: {n, hr, v, veq, g, moving, hrrOf, hrRest, hrMax, hasHR}
    const { n, hr, v, veq, g, moving, hrrOf } = c, W = 30, warm = 150, wins = [], out = { windows: wins, est: null, conf: 0 };
    if (c.hasHR) for (let s = Math.max(warm, W); s + W <= n; s += 15) {
      let ok = true, sv = 0, sv2 = 0, pv = 0, sh = 0, se = 0, sg = 0;
      for (let i = s - W; i < s + W; i++) { if (!moving(i)) { ok = false; break; } }
      if (!ok) continue;
      for (let i = s; i < s + W; i++) { if (!(hr[i] > 0)) { ok = false; break; } sv += v[i]; sv2 += v[i] * v[i]; sh += hr[i]; se += veq[i]; sg += g[i]; }
      if (!ok) continue;
      for (let i = s - W; i < s; i++) pv += v[i];
      const mvv = sv / W, cv = Math.sqrt(Math.max(0, sv2 / W - mvv * mvv)) / mvv, pmv = pv / W;
      const h = sh / W, q = hrrOf(h);
      if (mvv < 1.6 || cv > 0.08 || Math.abs(mvv - pmv) / mvv > 0.08 || Math.abs(sg / W) > 0.08 || q < 0.35 || q > 0.95) continue;
      const tMin = s * DT / 60;
      wins.push([h, se / W * 60, tMin <= 45 ? 1 : Math.exp(-(tMin - 45) / 60)]); // [bpm, grade-adjusted m/min, weight]
    }
    if (wins.length >= 6) {
      const fit = VO2.fit(wins, c.hrRest);
      if (fit && fit.b > 0) {
        const vmax = (fit.a + fit.b * c.hrMax) / 60; // m/s
        out.est = vo2Cost(vmax); out.vmax = vmax; out.fit = fit;
        const sw = wins.reduce((s, w) => s + w[2], 0);
        out.conf = (1 - Math.exp(-sw / 15)) * clamp(1 - fit.sd / 30, 0.2, 1);
        if (out.est < 20 || out.est > 90) { out.est = null; out.vmax = null; out.conf = 0; }
      }
    }
    return out;
  },
  // Weighted least squares of speed (m/min) on HR with anchor (HRrest, 0); one Huber reweighting pass.
  fit(wins, hrRest) {
    const solve = ws => {
      const sw0 = ws.reduce((s, w) => s + w[2], 0);
      const pts = ws.concat([[hrRest, 0, Math.max(2, 0.15 * sw0)]]);
      let sw = 0, sx = 0, sy = 0; for (const [x, y, w] of pts) { sw += w; sx += w * x; sy += w * y; }
      const mx = sx / sw, my = sy / sw; let sxy = 0, sxx = 0;
      for (const [x, y, w] of pts) { sxy += w * (x - mx) * (y - my); sxx += w * (x - mx) ** 2; }
      const b = sxy / sxx, a = my - b * mx;
      let se = 0, sw1 = 0; for (const [x, y, w] of ws) { se += w * (y - a - b * x) ** 2; sw1 += w; }
      return { a, b, sd: Math.sqrt(se / sw1) };
    };
    let f = solve(wins);
    const c = Math.max(7, 1.345 * f.sd);
    f = solve(wins.map(([x, y, w]) => { const r = Math.abs(y - f.a - f.b * x); return [x, y, w * (r <= c ? 1 : c / r)]; }));
    return f;
  },
  // items: [{t, est, conf, vdots:[...]}] sorted by t; T = end of the day being computed
  fuse(items, T) {
    let hw = 0, hs = 0, perf = null, pAge = 0;
    for (const it of items) {
      if (it.t > T + DAY) break;
      const age = (T - it.t) / DAY; if (age > 60) continue;
      if (it.est) { const w = it.conf * Math.pow(0.5, Math.max(0, age) / 14); hw += w; hs += w * it.est; }
      for (const vd of it.vdots) if (perf == null || vd > perf) { perf = vd; pAge = Math.max(0, age); }
    }
    if (!hw && perf == null) return null;
    if (!hw) return { v: perf, hr: null, perf };
    const vh = hs / hw, sh = 2.5 / Math.sqrt(Math.min(hw, 4));
    if (perf == null) return { v: vh, hr: vh, perf: null };
    const sp = 2.0 + pAge / 20, wh = 1 / sh ** 2, wp = 1 / sp ** 2;
    return { v: (vh * wh + perf * wp) / (wh + wp), hr: vh, perf };
  },
});
