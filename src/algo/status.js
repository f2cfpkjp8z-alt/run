// ===== TSalg1 — Garmin-style training status from VO₂max trend and load =====
const TS = algo({
  key: 'ts', id: 'TSalg1', name: 'Training status', since: 20,
  summary: 'What your recent training is doing to your fitness — Productive, Maintaining, Recovery, Peaking, Unproductive, Detraining or Overreaching — the way Garmin reports it.',
  steps: [
    'Two signals, as in Garmin’s (Firstbeat) model: your VO₂max trend over the last 3 weeks (VO2alg3) and your load ratio — 7-day load against your usual load (ACWRalg2).',
    'Overreaching: load ratio above 1.5 — far more than you are used to.',
    'Productive: load in or above your optimal range and VO₂max rising. Maintaining: optimal load, VO₂max steady. Unproductive: load fine but VO₂max falling (often fatigue, heat, sleep or illness).',
    'Peaking: load reduced (ratio under 0.85) while VO₂max is at its 6-week best — a taper before a race. Recovery: lighter load with VO₂max holding. Detraining: load well below usual (under 0.6) and VO₂max falling.',
    'VO₂max counts as rising or falling when it changes by more than 0.5 ml/kg/min in 3 weeks. Needs 3 weeks of history and a VO₂max estimate; otherwise “No status”.',
  ],
  formula: 'ratio = acute / chronic load (ACWRalg2)      ΔVO₂ = VO₂max today − 21 days ago\n> 1.5 → Overreaching\n0.8–1.5: ΔVO₂ > +0.5 Productive · |ΔVO₂| ≤ 0.5 Maintaining · < −0.5 Unproductive\n< 0.85 and VO₂max at 6-week best → Peaking\n< 0.8: ΔVO₂ ≥ −0.5 Recovery · < 0.6 and ΔVO₂ < −0.5 Detraining',
  inputs: 'VO₂max history and daily training load.',
  limits: 'Garmin also uses heart-rate variability and sleep (“Strained”), which the files don’t contain.',
  history: [['TSalg1', 20, 'Garmin-style status names from VO₂max trend and load ratio; replaces the form-only label (Fresh / Balanced / Building / Overreaching).']],
  styles: { 'Peaking': 'top', 'Productive': 'good', 'Maintaining': 'ok', 'Recovery': 'exc', 'Unproductive': 'warn', 'Detraining': 'warn', 'Overreaching': 'bad', 'No status': 'ok' },
  why: { 'Peaking': 'Load is down and VO₂max is at its best — ready to race.', 'Productive': 'Your training is raising your fitness.', 'Maintaining': 'Load is enough to keep your fitness; vary it to improve.',
    'Recovery': 'Lighter load lets your body recover; fitness is holding.', 'Unproductive': 'Load is fine but fitness is slipping — check rest, sleep, heat or illness.',
    'Detraining': 'Much less training than usual and fitness is dropping.', 'Overreaching': 'Load is far above usual — back off to recover.', 'No status': 'Needs 3 weeks of runs with heart rate.' },
  of(days, runs, res, asOf) {
    const D = days[days.length - 1], L = ACWR.compute(runs, res, asOf), ago = days.length > 21 ? dayAt(D.t - 21 * DAY) : null;
    if (!D || !D.vo2 || !ago || !ago.vo2 || L.ratio == null) return { name: 'No status', ratio: L.ratio, load: L };
    const r = L.ratio, dv = D.vo2 - ago.vo2, best6 = Math.max(...days.filter(d => d.t > D.t - 42 * DAY && d.vo2).map(d => d.vo2));
    const name = r > 1.5 ? 'Overreaching' : r < 0.85 && D.vo2 >= best6 - 0.3 && dv >= 0 ? 'Peaking' : r >= 0.8 ? (dv > 0.5 ? 'Productive' : dv < -0.5 ? 'Unproductive' : 'Maintaining') : r < 0.6 && dv < -0.5 ? 'Detraining' : dv < -0.5 ? 'Unproductive' : 'Recovery';
    return { name, ratio: r, dv, load: L };
  },
});
