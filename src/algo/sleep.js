// ===== SLEEPalg1 — sleep score (0–100) from duration, deep and REM share, continuity, bedtime and overnight-to-morning HRV =====
const SLEEP = algo({
  key: 'sleep', id: 'SLEEPalg1', name: 'Sleep score', since: 33,
  summary: 'A 0–100 score for one night from how long you slept, how much deep and REM sleep you got, how unbroken it was, how early you went to bed and, when you have a reading, how your HRV compares with your own norm.',
  steps: [
    'Duration (35 pts): full marks for 7–9 hours; falls linearly to 0 at 4 hours; slightly lower above 9 hours (down to 50%).',
    'Deep sleep (10 pts): full marks for 13–23% of the night, scaled down outside that range.',
    'REM sleep (10 pts): full marks for 20–28% of the night, scaled down outside that range.',
    'Continuity (15 pts): time awake as a share of the night (full at 5% or less, zero at 20%) and the number of awake periods of 5+ minutes (full at 2 or fewer, zero at 8 or more); the two are weighted 60/40.',
    'Bedtime (10 pts): full marks when you fall asleep by 23:00, falling to zero at 02:00.',
    'HRV (20 pts): your morning RMSSD against your average of the previous 28 readings (needs 5). At or above your norm is full marks; 30% below it is zero.',
    'When there is no HRV reading, the other five parts are scaled to 100 so a night is never penalised for missing data.',
  ],
  formula: 'score = 100 × Σ(part × weight) / Σ(weights available);  weights 35 · 10 · 10 · 15 · 10 · 20',
  inputs: 'Sleep and stage seconds, the stage timeline, bedtime (your phone’s time zone) and, optionally, RMSSD from an HRV reading.',
  limits: 'This is not Garmin’s sleep score. Stage lengths come from the wrist sensor and are estimates. The ideal ranges are population guides, not a diagnosis.',
  history: [['SLEEPalg1', 33, 'First version: duration, deep, REM, continuity, bedtime and HRV against your own baseline. Added because the watch export carries no sleep score.']],
  weights: { dur: 35, deep: 10, rem: 10, cont: 15, bed: 10, hrv: 20 },
  bands: [[90, 'Excellent', 'top'], [80, 'Good', 'good'], [60, 'Fair', 'warn'], [0, 'Poor', 'bad']],
  band(score) { return SLEEP.bands.find(b => score >= b[0]); },
  // sl: the day's `sleep` object; o: { hrv: RMSSD of the morning reading or null, base: mean RMSSD of previous readings or null }
  of(sl, o = {}) {
    if (!sl || !(sl.sleepTimeSeconds > 0)) return null;
    const W = SLEEP.weights, clampf = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const asleep = sl.sleepTimeSeconds, awake = sl.awakeSleepSeconds || 0, night = asleep + awake, h = asleep / 3600;
    const range = (p, lo, hi, fall) => p >= lo && p <= hi ? 1 : p < lo ? clampf(p / lo) : clampf(1 - (p - hi) / fall);
    const parts = [];
    const add = (k, name, f, text) => parts.push({ k, name, f, max: W[k], pts: f * W[k], text });
    add('dur', 'Duration', h >= 7 && h <= 9 ? 1 : h < 7 ? clampf((h - 4) / 3) : clampf(1 - (h - 9) * 0.25, 0.5, 1), `${Math.floor(h)}h ${String(Math.round(h % 1 * 60)).padStart(2, '0')}m asleep · aim for 7–9 h`);
    const dp = (sl.deepSleepSeconds || 0) / asleep * 100, rp = (sl.remSleepSeconds || 0) / asleep * 100;
    add('deep', 'Deep sleep', range(dp, 13, 23, 20), `${Math.round(dp)}% of the night · aim for 13–23%`);
    add('rem', 'REM sleep', range(rp, 20, 28, 20), `${Math.round(rp)}% of the night · aim for 20–28%`);
    const ap = awake / night * 100, fa = clampf(1 - (ap - 5) / 15), lv = (sl.levels || []).filter(x => x.l === 3 && x.e - x.s >= 300000).length;
    add('cont', 'Continuity', sl.levels && sl.levels.length ? 0.6 * fa + 0.4 * clampf(1 - (lv - 2) / 6) : fa, `${Math.round(ap)}% awake${sl.levels && sl.levels.length ? ` · ${lv} awake period${lv === 1 ? '' : 's'} of 5+ min` : ''}`);
    if (sl.sleepStartTimestampGMT) { const d = new Date(sl.sleepStartTimestampGMT); let b = d.getHours() + d.getMinutes() / 60; if (b < 12) b += 24;
      add('bed', 'Bedtime', b <= 23 ? 1 : clampf(1 - (b - 23) / 3), `Asleep at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · aim for 23:00 or earlier`); }
    if (o.hrv > 0 && o.base > 0) { const r = o.hrv / o.base;
      add('hrv', 'HRV', clampf((r - 0.7) / 0.3), `${Math.round(o.hrv)} ms vs your norm ${Math.round(o.base)} ms (${r >= 1 ? '+' : '−'}${Math.abs(Math.round((r - 1) * 100))}%)`); }
    const tot = parts.reduce((s, p) => s + p.max, 0), score = Math.round(parts.reduce((s, p) => s + p.pts, 0) / tot * 100);
    return { score, parts, band: SLEEP.band(score), hasHrv: parts.some(p => p.k === 'hrv') };
  },
});
