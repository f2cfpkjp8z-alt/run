// ===== ZONEalg1 — heart-rate zones and intensity mix =====
const ZONE = algo({
  key: 'zones', id: 'ZONEalg1', name: 'Heart-rate zones', since: 1,
  summary: 'Five intensity zones from your heart-rate reserve, and the easy/moderate/hard mix built from them.',
  steps: [
    'Each moving second is placed in a zone by % of heart-rate reserve (Karvonen).',
    'Intensity mix adds up the last 4 weeks: easy = Z1–Z2, moderate = Z3, hard = Z4–Z5. Most endurance coaches aim for about 80% easy.',
  ],
  formula: 'q = (HR − HRrest)/(HRmax − HRrest)\nZ1 < 60% ≤ Z2 < 70% ≤ Z3 < 80% ≤ Z4 < 90% ≤ Z5',
  inputs: 'Heart rate, max and resting heart rate.',
  limits: 'Zones from reserve are general guides; lab-tested thresholds are more precise.',
  history: [['ZONEalg1', 1, '%HRR bounds 60/70/80/90.']],
  bounds: [0.6, 0.7, 0.8, 0.9],
  labels: ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO₂max'],
  of(q) { let z = 0; while (z < 4 && q >= ZONE.bounds[z]) z++; return z; },
});
