// ===== ENDalg2 — endurance score =====
const TIERS = [[0, 'Recreational'], [4000, 'Intermediate'], [5500, 'Trained'], [7000, 'Well-trained'], [8500, 'Expert'], [10000, 'Superior'], [11500, 'Elite']];
const tierOf = e => { let t = TIERS[0]; for (const x of TIERS) if (e >= x[0]) t = x; return t[1]; };
const fVol = H => 1 - Math.exp(-H / 4), gLong = L => 1 - Math.exp(-L / 75), hDur = D => clamp(1.04 - 0.012 * D, 0.8, 1.04);
const END = algo({
  key: 'end', id: 'ENDalg2', name: 'Endurance score', since: 9,
  summary: 'How much of your aerobic ceiling you can hold for long efforts. The app’s own scale, set in a range similar to Garmin’s; not Garmin’s proprietary number.',
  steps: [
    'VO₂max (VO2alg3) sets the base: 100 points per ml/kg/min.',
    'A training multiplier from 0.85 to 1.6 is added on top: it grows with weekly running hours (42-day average), the longest run of the last 6 weeks, and durability — average heart-rate drift (DRIFTalg2) on runs of 60+ minutes (7% assumed when none). Each factor saturates, as in Banister-style dose–response models.',
    'Calibrated so VO₂max 35 with little training ≈ 3,500 (Recreational), 48 with a few runs a week ≈ 5,000–6,000, and 75 with 10 h/week and 2.5 h long runs ≈ 11,500 (Elite). Garmin doesn’t publish its formula; this is the app’s own, on a similar range.',
  ],
  formula: 'E = 100 · VO₂max · (0.85 + 0.75 · √(f(H)·g(L)) · h(D)/1.04)\nf(H) = 1 − e^(−H/4)    H = weekly hours\ng(L) = 1 − e^(−L/75)   L = longest run, min\nh(D) = 1.04 − 0.012·D  D = HR drift %, limited to 0.8–1.04',
  inputs: 'VO₂max, moving time, long runs, heart-rate drift.',
  limits: 'Tiers: Recreational <4000 · Intermediate 4000 · Trained 5500 · Well-trained 7000 · Expert 8500 · Superior 10000 · Elite 11500.',
  history: [['ENDalg1', 1, '170 · VO₂max · √(f·g) · h: the training factors multiplied the whole score, so a few weeks of history or short runs collapsed it (≈2,900 for VO₂max 48).'], ['ENDalg2', 9, 'VO₂max sets the base and training adds 0.85–1.6× on top, so a fit runner with modest volume isn’t rated as untrained.']],
  score(vo2, H, L, D) { return vo2 ? 100 * vo2 * (0.85 + 0.75 * Math.sqrt(fVol(H) * gLong(L)) * hDur(D) / 1.04) : null; },
});
