// ===== EFalg1 — aerobic efficiency =====
const EF = algo({
  key: 'ef', id: 'EFalg1', name: 'Aerobic efficiency', since: 1,
  summary: 'Metres you cover per heartbeat at grade-adjusted pace. Rising means more speed for the same effort.',
  steps: [
    'Grade-adjusted speed (GAPalg1) of the moving time, in metres per minute, divided by average heart rate.',
    'The Trends chart shows each run and a 28-day rolling median.',
  ],
  formula: 'EF = v_flat (m/min) / avg HR',
  inputs: 'Speed, gradient, heart rate.',
  limits: 'Easy and hard runs differ naturally; compare runs of similar type.',
  history: [['EFalg1', 1, 'Grade-adjusted metres per beat.']],
  of(v, avgHR) { return avgHR ? v * 60 / avgHR : null; },
});
