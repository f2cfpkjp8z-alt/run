// ===== LFalg1 — training load focus (Garmin-style low aerobic / high aerobic / anaerobic) =====
const LF = algo({
  key: 'lf', id: 'LFalg1', name: 'Load focus', since: 21,
  summary: 'How your last 4 weeks of training load split between low aerobic, high aerobic and anaerobic work, against the balance that builds fitness best — like Garmin’s Training Load Focus.',
  steps: [
    'Every second of every run adds its training load (LOADalg2) to its heart-rate zone (ZONEalg2), grouped like Seiler’s 3-zone model around the two thresholds: low aerobic = Z1–Z3 (under 80% of max HR, easy and steady), high aerobic = Z4 (80–90%, tempo and threshold), anaerobic = Z5 (90%+, intervals).',
    'The last 4 weeks are added up and shown as shares of the total, each against a target range: low aerobic 50–75%, high aerobic 20–40%, anaerobic 5–15%.',
    'Status: “Balanced” when all three are in range; otherwise the category furthest below its range is a “shortage” (e.g. Low aerobic shortage), or the one most above its range a “focus”.',
  ],
  formula: 'share = load in category (28 days) / total load\ntargets: low aerobic 50–75% · high aerobic 20–40% · anaerobic 5–15%',
  inputs: 'Heart rate of each run; max and resting heart rate.',
  limits: 'Garmin uses EPOC from Firstbeat; this uses heart-rate load, which ranks efforts similarly. Target ranges are the app’s, set from polarized-training guidance.',
  history: [['LFalg1', 21, 'Load per HR zone grouped into Garmin’s three focus categories (Seiler 3-zone split at 80% and 90% of max HR), 28-day window.']],
  cats: [['Low aerobic', [0, 1, 2], 0.50, 0.75, 'var(--rt6)'], ['High aerobic', [3], 0.20, 0.40, 'var(--rt2)'], ['Anaerobic', [4], 0.05, 0.15, 'var(--rt7)']],
  of(runs, res, asOf) {
    const T = dayStart(asOf) + DAY, z = [0, 0, 0, 0, 0];
    runs.forEach((r, i) => { const zl = res[i].zoneLoad; if (r.start >= T - 28 * DAY && r.start < T && zl) zl.forEach((v, k) => z[k] += v); });
    const tot = z.reduce((a, b) => a + b, 0); if (!tot) return null;
    const rows = LF.cats.map(([name, ks, lo, hi, col]) => { const share = ks.reduce((s, k) => s + z[k], 0) / tot; return { name, share, load: share * tot, lo, hi, col }; });
    const below = rows.filter(r => r.share < r.lo).sort((a, b) => (a.share - a.lo) - (b.share - b.lo)), above = rows.filter(r => r.share > r.hi).sort((a, b) => (b.share - b.hi) - (a.share - a.hi));
    const status = below.length ? [below[0].name + ' shortage', 'warn'] : above.length ? [above[0].name + ' focus', 'ok'] : ['Balanced', 'good'];
    return { rows, total: tot, status };
  },
});
