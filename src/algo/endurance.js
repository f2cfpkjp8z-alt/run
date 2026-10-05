// ===== ENDalg1 — endurance score =====
const TIERS = [[0, 'Recreational'], [4000, 'Intermediate'], [5500, 'Trained'], [7000, 'Well-trained'], [8500, 'Expert'], [10000, 'Superior'], [11500, 'Elite']];
const tierOf = e => { let t = TIERS[0]; for (const x of TIERS) if (e >= x[0]) t = x; return t[1]; };
const fVol = H => 1 - Math.exp(-H / 4), gLong = L => 1 - Math.exp(-L / 75), hDur = D => clamp(1.04 - 0.012 * D, 0.8, 1.04);
const END = algo({
  key: 'end', id: 'ENDalg1', name: 'Endurance score', since: 1,
  summary: 'How much of your aerobic ceiling you can hold for long efforts. The app’s own scale, set in a range similar to Garmin’s; not Garmin’s proprietary number.',
  steps: [
    'VO₂max (VO2alg2) sets the ceiling.',
    'It is scaled by three saturating factors: weekly running hours (42-day average), the longest run of the last 6 weeks, and durability — average heart-rate drift (DRIFTalg2) on runs of 60+ minutes (7% assumed when none).',
  ],
  formula: 'E = 170 · VO₂max · √(f(H)·g(L)) · h(D)\nf(H) = 1 − e^(−H/4)    H = weekly hours\ng(L) = 1 − e^(−L/75)   L = longest run, min\nh(D) = 1.04 − 0.012·D  D = HR drift %, limited to 0.8–1.04',
  inputs: 'VO₂max, moving time, long runs, heart-rate drift.',
  limits: 'Tiers: Recreational <4000 · Intermediate 4000 · Trained 5500 · Well-trained 7000 · Expert 8500 · Superior 10000 · Elite 11500.',
  history: [['ENDalg1', 1, 'Ceiling × volume × long-run reach × durability.']],
  score(vo2, H, L, D) { return vo2 ? 170 * vo2 * Math.sqrt(fVol(H) * gLong(L)) * hDur(D) : null; },
});
