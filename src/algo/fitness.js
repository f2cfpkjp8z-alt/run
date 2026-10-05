// ===== FFalg1 — fitness, fatigue, form and weekly running time =====
const FF = algo({
  key: 'ff', id: 'FFalg1', name: 'Fitness, fatigue & form', since: 1,
  summary: 'Fitness is your long-term load, fatigue your recent load, form the difference (Banister’s impulse–response model).',
  steps: [
    'Daily TRIMP (LOADalg2) feeds two exponential averages: 42 days for fitness, 7 days for fatigue.',
    'Form = fitness − fatigue. Above +5 you are fresh; −10 to +5 balanced; −25 to −10 building; below −25 overreaching.',
    'Weekly running time uses the same 42-day average of daily moving time × 7.',
    'History starts from the average daily load of your first 28 days, so the curves don’t ramp up from zero.',
  ],
  formula: 'CTL += (load − CTL)·(1 − e^(−1/42))\nATL += (load − ATL)·(1 − e^(−1/7))\nform = CTL − ATL',
  inputs: 'Training load of each day.',
  limits: 'Says nothing about sleep, stress or illness.',
  history: [['FFalg1', 1, 'Daily EWMA 42/7 days, warm start from the first 28 days.']],
  kC: 1 - Math.exp(-1 / 42), kA: 1 - Math.exp(-1 / 7),
  status(tsb) { return tsb > 5 ? ['Fresh', 'good'] : tsb > -10 ? ['Balanced', 'acc'] : tsb > -25 ? ['Building', 'warn'] : ['Overreaching', 'crit']; },
});
