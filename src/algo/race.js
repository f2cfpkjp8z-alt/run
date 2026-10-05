// ===== RACEalg1 — race time predictions =====
const RACES = [[5000, '5K', 0], [10000, '10K', 0.01], [21097.5, 'Half marathon', 0.04], [42195, 'Marathon', 0.10]];
function predictTime(distM, vdot) {
  let lo = distM / 10, hi = distM / 0.8; // seconds: 10 m/s .. 0.8 m/s
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (vdotOf(distM, mid) > vdot) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const RACE = algo({
  key: 'race', id: 'RACEalg1', name: 'Race predictions', since: 1,
  summary: 'Finish times your current VO₂max supports, slowed for long races when volume or long runs are short.',
  steps: [
    'The Daniels–Gilbert VDOT formula is inverted: find the time at which a race of that distance gives your VO₂max (VO2alg2).',
    'Longer races get a penalty when training volume and long-run reach (from ENDalg1) are short: up to +1% (10K), +4% (half), +10% (marathon).',
  ],
  formula: 't = VDOT⁻¹(distance, VO₂max) · (1 + p·(1 − √(f(H)·g(L))))\np = 0 / 0.01 / 0.04 / 0.10 for 5K / 10K / half / marathon',
  inputs: 'VO₂max, weekly hours, longest run.',
  limits: 'Assumes even pacing, good conditions and race-specific preparation.',
  history: [['RACEalg1', 1, 'Daniels VDOT inversion with volume/long-run penalty.']],
  predict(D) { const k = Math.sqrt(fVol(D.H) * gLong(D.L)); return RACES.map(([dist, name, pen]) => [name, predictTime(dist, D.vo2) * (1 + pen * (1 - k)), dist]); },
});
