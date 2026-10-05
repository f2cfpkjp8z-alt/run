// ===== DRIFTalg2 — heart-rate drift (aerobic decoupling, Pa:HR) =====
const DRIFT = algo({
  key: 'drift', id: 'DRIFTalg2', name: 'Heart-rate drift', since: 4,
  summary: 'How much more heartbeat each metre costs in the second half of a steady run. Under 5% shows a solid aerobic base.',
  steps: [
    'Uses runs with heart rate and at least 40 moving minutes, skipping the first 10 minutes.',
    'Interval sessions and runs with walk breaks are skipped: the grade-adjusted speed must vary less than 20%.',
    'Efficiency (grade-adjusted metres per beat) of the first half is compared with the second half.',
  ],
  formula: 'EF = Σ v_flat / Σ HR    per half\ndrift % = (EF₁ − EF₂) / EF₁ · 100',
  inputs: 'Heart rate, speed, gradient.',
  limits: 'Heat, dehydration and fuelling raise drift as much as fitness lowers it.',
  history: [
    ['DRIFTalg1', 1, 'First vs second half on any run of 40+ minutes.'],
    ['DRIFTalg2', 4, 'Skips unsteady runs (speed variation ≥ 20%), where halves aren’t comparable.'],
  ],
  of(c) { // c: {n, hr, veq, moving, mov, hasHR}
    if (!c.hasHR || c.mov < 2400) return null;
    const idx = []; for (let i = 300; i < c.n; i++) if (c.moving(i) && c.hr[i] > 0) idx.push(i);
    let m1 = 0, m2 = 0; for (const i of idx) { m1 += c.veq[i]; m2 += c.veq[i] * c.veq[i]; } m1 /= idx.length;
    const cvRun = Math.sqrt(Math.max(0, m2 / idx.length - m1 * m1)) / m1;
    if (!(idx.length > 200 && cvRun < 0.2)) return null;
    const half = idx.length >> 1, ef = (a, b) => { let sv = 0, sh = 0; for (let k = a; k < b; k++) { const i = idx[k]; sv += c.veq[i]; sh += c.hr[i]; } return sv / sh; };
    const e1 = ef(0, half), e2 = ef(half, idx.length); return (e1 - e2) / e1 * 100;
  },
});
