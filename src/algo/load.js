// ===== LOADalg2 — training load (Banister TRIMP) =====
const LOAD = algo({
  key: 'load', id: 'LOADalg2', name: 'Training load (TRIMP)', since: 8,
  summary: 'How much training stress a workout carried: time weighted by how hard your heart worked.',
  steps: [
    'Every 2-second moving sample adds its minutes × intensity × an exponential weight, so hard minutes count far more than easy ones.',
    'Intensity is heart-rate reserve: (HR − resting) / (max − resting).',
    'Runs without heart rate get an estimate from grade-adjusted speed as a share of your speed at VO₂max (VO2alg3 scale).',
  ],
  formula: 'TRIMP = Σ minutes · q · k₁ · e^(k₂·q)     q = (HR − HRrest)/(HRmax − HRrest)\nmen k₁ = 0.64, k₂ = 1.92 · women k₁ = 0.86, k₂ = 1.67\nno HR: q ≈ grade-adjusted speed / vVO₂max',
  inputs: 'Heart rate, max and resting heart rate, sex.',
  limits: 'Banister’s weights come from lactate curves of average athletes; strength or cross-training isn’t counted.',
  history: [['LOADalg1', 1, 'Banister (1991) TRIMP per sample; no-HR estimate from pace.'], ['LOADalg2', 8, 'No-HR estimate uses the speed at VO₂max on the VO2alg3 scale; TRIMP with heart rate unchanged.']],
  k: sex => sex === 'f' ? [0.86, 1.67] : [0.64, 1.92],
  trimp(sec, q, sex) { const [ka, kb] = LOAD.k(sex); q = clamp(q, 0, 1); return sec / 60 * q * ka * Math.exp(kb * q); },
  noHR(sec, v, vo2ref, sex) { return LOAD.trimp(sec, v / vAt(vo2ref || 45), sex); },
});
