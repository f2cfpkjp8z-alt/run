// ===== ZONEalg2 — heart-rate zones (Garmin defaults) and intensity mix =====
const ZONE = algo({
  key: 'zones', id: 'ZONEalg2', name: 'Heart-rate zones', since: 9,
  summary: 'Five intensity zones as % of max heart rate — Garmin’s default zones — and the easy/moderate/hard mix built from them.',
  steps: [
    'Each moving second is placed in a zone by % of max heart rate (HRMAXalg3), the same boundaries Garmin uses by default.',
    'Intensity mix adds up the last 4 weeks: easy = Z1–Z2, moderate = Z3, hard = Z4–Z5. Most endurance coaches aim for about 80% easy (Seiler’s polarized model).',
  ],
  formula: 'Z1 < 60% ≤ Z2 < 70% ≤ Z3 < 80% ≤ Z4 < 90% ≤ Z5   (% of HRmax)',
  inputs: 'Heart rate and max heart rate.',
  limits: 'Default zones are general guides; lab-tested thresholds are more precise.',
  history: [['ZONEalg1', 1, '% of heart-rate reserve, bounds 60/70/80/90.'], ['ZONEalg2', 9, '% of max heart rate like Garmin’s defaults, so time in zones matches Garmin Connect.']],
  bounds: [0.6, 0.7, 0.8, 0.9],
  labels: ['Z1 Warm-up', 'Z2 Easy', 'Z3 Aerobic', 'Z4 Threshold', 'Z5 Maximum'],
  of(f) { let z = 0; while (z < 4 && f >= ZONE.bounds[z]) z++; return z; },
});
