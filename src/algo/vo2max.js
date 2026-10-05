// ===== VO2alg3 — VO₂max, Garmin/Firstbeat-style: oxygen cost of your pace ÷ the share of VO₂max your heart rate shows =====
// Gross oxygen cost of flat running (ACSM), v in m/s -> ml/kg/min. Measured VO₂ rises linearly with speed.
const acsmCost = v => 3.5 + 12 * v; // 0.2 ml/kg per metre + 3.5 at rest
// Share of VO₂max implied by heart rate (Swain 1994: %HRmax = 0.64·%VO₂max + 37)
const pctVO2 = (h, hrMax) => (h / hrMax - 0.37) / 0.64;
// Share of VO₂max a runner can hold for t minutes (Daniels & Gilbert)
const pctRace = t => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
// Speed (m/s) at which the oxygen cost equals vo2 — the speed at VO₂max
const vAt = vo2 => Math.max(0, (vo2 - 3.5) / 12);
// Daniels & Gilbert VDOT, still shown next to best efforts for runners who use Daniels' tables
const vo2Cost = v => { const m = v * 60; return Math.max(3.5, -4.60 + 0.182258 * m + 0.000104 * m * m); };
function vdotOf(distM, sec) { const t = sec / 60, v = distM / t; return (-4.60 + 0.182258 * v + 0.000104 * v * v) / pctRace(t); }
// weighted quantile of [value, weight] (q = 0.5 → median)
function wQuantile(a, q) { const s = a.slice().sort((x, y) => x[0] - y[0]), tot = s.reduce((t, x) => t + x[1], 0); let c = 0; for (const [v, w] of s) { c += w; if (c >= tot * q) return v; } return s.length ? s[s.length - 1][0] : null; }
const wMedian = a => wQuantile(a, 0.5);
const VO2 = algo({
  key: 'vo2', id: 'VO2alg3', name: 'VO₂max', since: 8,
  summary: 'Your aerobic ceiling in ml/kg/min, estimated the way Garmin (Firstbeat) does: how much oxygen your pace costs, divided by the share of your VO₂max that your heart rate shows you were using.',
  steps: [
    'Each run is resampled to 2-second steps; speed is converted to grade-adjusted (flat-equivalent) speed (GAPalg1).',
    'Only steady 60-second windows count: after a 5-minute warm-up, pace stable for 2 minutes (±8%), gradient under 8%, heart rate between 65% and 95% of max. Windows after 45 minutes weigh less because of cardiac drift.',
    'Oxygen cost of each window comes from the ACSM running equation: 3.5 + 0.2 ml/kg for every metre per minute.',
    'Heart rate tells the share of VO₂max in use (Swain: %HRmax = 0.64 × %VO₂max + 37). VO₂max for the window = oxygen cost ÷ that share. Uses your max heart rate (HRMAXalg2); resting heart rate isn’t needed.',
    'The run’s VO₂max is the weighted median of its windows (one odd window can’t swing it). Needs 6+ windows; confidence grows with the number of windows and how closely they agree.',
    'Daily VO₂max is the weighted 70th percentile of run estimates from the last 60 days (14-day half-life × confidence). Heat, fatigue and drift push single runs low far more often than high, so a hot or tired day can’t drag it down. Race-like efforts (BESTalg2) add a reading — oxygen cost of race pace ÷ the share of VO₂max that race length allows — by inverse-variance weighting; a race fades out over 60 days.',
  ],
  formula: 'VO₂(v) = 3.5 + 0.2·v        v = grade-adjusted m/min (ACSM)\n%VO₂max = (HR/HRmax − 0.37) / 0.64     (Swain)\nwindow VO₂max = VO₂(v) / %VO₂max\nrun = weighted median of windows\nday = weighted 70th percentile of runs, w = conf · 0.5^(age/14)\nrace = VO₂(race pace) / (0.8 + 0.1894·e^(−0.0128t) + 0.2990·e^(−0.1933t))',
  inputs: 'Heart rate, distance, altitude and your max heart rate. Not resting HR, weight, height or age — see below.',
  notes: [
    'Weight: VO₂max is already per kilogram, and running costs about the same oxygen per kilogram for everyone, so weight cancels out. Losing weight raises VO₂max because the same engine carries fewer kilograms — your runs then get faster at the same heart rate, and the estimate follows. Weight is only used to show absolute VO₂ in L/min.',
    'Height: no effect. Formulas that guess VO₂max without exercise use BMI, but your actual heart rate and pace measure it directly and far more accurately.',
    'Age and sex: they don’t change your measured VO₂max, but they decide how it is rated (RATEalg2) and your fitness age. Age also sets the default max heart rate (HRMAXalg2), which matters a lot: every 3 bpm of max HR moves VO₂max by about 1.',
  ],
  limits: 'Max heart rate matters most: enter a measured one (or the one Garmin shows) in Profile. Heat, illness, caffeine and optical-HR errors shift single runs; the blend smooths them.',
  history: [
    ['VO2alg1', 1, 'Regressed Daniels’ curved oxygen cost directly on heart rate, anchored at (HRrest, 3.5 ml/kg/min). Read 3–8 ml/kg/min low on easy runs because measured VO₂ rises linearly with speed while Daniels’ curve bends.'],
    ['VO2alg2', 4, 'Regressed grade-adjusted speed on heart-rate reserve and converted the speed at max HR with Daniels’ cost (VDOT scale). Unbiased against race-based VDOT, but VDOT sits well below lab and Garmin values for most recreational runners: on real files Garmin rated ~48 it gave ~32.'],
    ['VO2alg3', 8, 'Garmin/Firstbeat method: ACSM oxygen cost ÷ %VO₂max from %HRmax (Swain), weighted median per run. On those same files it gives 44–48 with max HR 197–200. Race efforts and race predictions moved to the same scale (RACEalg2).'],
  ],
  live() { return `Using max HR <b>${Math.round(st.S.hrMaxEff)}</b> bpm${st.S.hrMax ? '' : ' (automatic — enter yours in Profile for accuracy)'}.`; },
  // CSV summary rows: only average HR and pace are known
  fromSummary(v, avgHR, hrMax) { const p = pctVO2(avgHR, hrMax); return avgHR / hrMax >= 0.65 && avgHR / hrMax <= 0.95 && v > 1.6 ? { est: acsmCost(v) / p, vmax: vAt(acsmCost(v) / p), conf: 0.3 } : {}; },
  fromRace(distM, sec) { return acsmCost(distM / sec) / pctRace(sec / 60); },
  fromRun(c) { // c: {n, hr, v, veq, g, moving, hrMax, hasHR}
    const { n, hr, v, veq, g, moving, hrMax } = c, W = 30, warm = 150, wins = [], out = { windows: wins, est: null, conf: 0 };
    if (c.hasHR) for (let s = Math.max(warm, W); s + W <= n; s += 15) {
      let ok = true, sv = 0, sv2 = 0, pv = 0, sh = 0, se = 0, sg = 0;
      for (let i = s - W; i < s + W; i++) { if (!moving(i)) { ok = false; break; } }
      if (!ok) continue;
      for (let i = s; i < s + W; i++) { if (!(hr[i] > 0)) { ok = false; break; } sv += v[i]; sv2 += v[i] * v[i]; sh += hr[i]; se += veq[i]; sg += g[i]; }
      if (!ok) continue;
      for (let i = s - W; i < s; i++) pv += v[i];
      const mvv = sv / W, cv = Math.sqrt(Math.max(0, sv2 / W - mvv * mvv)) / mvv, pmv = pv / W, h = sh / W, f = h / hrMax;
      if (mvv < 1.6 || cv > 0.08 || Math.abs(mvv - pmv) / mvv > 0.08 || Math.abs(sg / W) > 0.08 || f < 0.65 || f > 0.95) continue;
      const tMin = s * DT / 60, vo2 = acsmCost(se / W);
      wins.push([h, vo2, tMin <= 45 ? 1 : Math.exp(-(tMin - 45) / 60), vo2 / pctVO2(h, hrMax)]); // [bpm, VO₂ ml/kg/min, weight, VO₂max]
    }
    if (wins.length >= 6) {
      const est = wMedian(wins.map(w => [w[3], w[2]])), mad = wMedian(wins.map(w => [Math.abs(w[3] - est), w[2]]));
      const sw = wins.reduce((s, w) => s + w[2], 0);
      out.est = est; out.vmax = vAt(est); out.mad = mad;
      out.conf = (1 - Math.exp(-sw / 15)) * clamp(1 - mad / 6, 0.2, 1);
      if (est < 20 || est > 90) { out.est = null; out.vmax = null; out.conf = 0; }
    }
    return out;
  },
  // items: [{t, est, conf, vdots:[...]}] sorted by t; T = end of the day being computed
  fuse(items, T) {
    let hw = 0, perf = null, pAge = 0; const ests = [];
    for (const it of items) {
      if (it.t > T + DAY) break;
      const age = (T - it.t) / DAY; if (age > 60) continue;
      if (it.est) { const w = it.conf * Math.pow(0.5, Math.max(0, age) / 14); hw += w; ests.push([it.est, w]); }
      for (const vd of it.vdots) if (perf == null || vd > perf) { perf = vd; pAge = Math.max(0, age); }
    }
    if (!hw && perf == null) return null;
    if (!hw) return { v: perf, hr: null, perf };
    // heat, fatigue, dehydration and drift push single runs low far more often than high, so the
    // centre of the true value sits above the median: use the weighted 70th percentile
    const vh = wQuantile(ests, 0.7), sh = 2.5 / Math.sqrt(Math.min(hw, 4));
    if (perf == null) return { v: vh, hr: vh, perf: null };
    const sp = 2.0 + pAge / 20, wh = 1 / sh ** 2, wp = 1 / sp ** 2;
    return { v: (vh * wh + perf * wp) / (wh + wp), hr: vh, perf };
  },
});
