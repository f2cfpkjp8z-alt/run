// ===== RACEalg2 — race time predictions =====
const RACES = [[5000, '5K', 0], [10000, '10K', 0.01], [21097.5, 'Half marathon', 0.04], [42195, 'Marathon', 0.10]];
// time at which a race of distM needs exactly vo2max (same scale as VO2alg3)
function predictTime(distM, vo2max) {
  let lo = distM / 10, hi = distM / 0.8; // seconds: 10 m/s .. 0.8 m/s
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (VO2.fromRace(distM, mid) > vo2max) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const RACE = algo({
  key: 'race', id: 'RACEalg2', name: 'Race predictions', since: 8,
  summary: 'Finish times your current VO₂max supports, slowed for long races when volume or long runs are short.',
  steps: [
    'Find the time at which the oxygen cost of race pace (ACSM) divided by the share of VO₂max that race length allows (Daniels–Gilbert) equals your VO₂max (VO2alg3).',
    'Longer races get a penalty when training volume and long-run reach (from ENDalg2) are short: up to +1% (10K), +4% (half), +10% (marathon).',
    'Other distances (goals) interpolate that penalty on log distance between those races; beyond the marathon it stays +10%.',
  ],
  formula: 'solve (3.5 + 0.2·d/t) / pct(t) = VO₂max for t\nt = that time · (1 + p·(1 − √(f(H)·g(L))))\np = 0 / 0.01 / 0.04 / 0.10 for 5K / 10K / half / marathon',
  inputs: 'VO₂max, weekly hours, longest run.',
  limits: 'Assumes even pacing, good conditions and race-specific preparation.',
  history: [['RACEalg1', 1, 'Daniels VDOT inversion with volume/long-run penalty.'], ['RACEalg2', 8, 'Same scale as VO2alg3: ACSM cost of race pace ÷ Daniels’ sustainable share of VO₂max, so predictions stay realistic with Garmin-level VO₂max values.']],
  at(D, distM) { // any distance; identical to predict() at the four race distances
    const k = Math.sqrt(fVol(D.H) * gLong(D.L)), last = RACES[RACES.length - 1]; let pen = distM >= last[0] ? last[2] : 0;
    for (let i = 0; i < RACES.length - 1; i++) { const [a, , pa] = RACES[i], [b, , pb] = RACES[i + 1]; if (distM >= a && distM <= b) pen = pa + (pb - pa) * Math.log(distM / a) / Math.log(b / a); }
    return predictTime(distM, D.vo2) * (1 + pen * (1 - k));
  },
  predict(D) { const k = Math.sqrt(fVol(D.H) * gLong(D.L)); return RACES.map(([dist, name, pen]) => [name, predictTime(dist, D.vo2) * (1 + pen * (1 - k)), dist]); },
});
