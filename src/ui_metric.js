// ===== METRIC PAGES (#m-<key>): every overview card opens its own trend page with 7 days / 4 weeks / Year =====
const M_RANGES = [[7, '7 days'], [28, '4 weeks'], [365, 'Year']];
function mPeriod() {
  const t1 = dayStart(st.asOf), n = st.mRange || 7, t0 = dayStart(t1 - (n - 1) * DAY + DAY / 2);
  const idx = st.runs.map((r, i) => i).filter(i => st.runs[i].start >= t0 && st.runs[i].start < t1 + DAY);
  return { t0, t1, n, xMin: t0 - DAY / 2, xMax: t1 + DAY / 2, idx, days: st.days.filter(d => d.t >= t0 && d.t <= t1) };
}
const mStat = (l, v, u = '', k) => `<div class="stat"><span>${k ? al(k, l) : l}</span><b>${v}${u ? `<small>${u}</small>` : ''}</b></div>`;
const mCard = (title, id, cap = '', key) => `<div class="card chart-card"><h3>${key ? al(key, title) : title}</h3>${cap ? `<p class="cap">${cap}</p>` : ''}<div class="plot" id="${id}"></div></div>`;
const mChange = (a, b, dig, unit = '') => a == null || b == null ? '–' : `<span class="${b - a >= 0 ? 'delta-up' : 'delta-down'}">${b - a >= 0 ? '+' : '−'}${Math.abs(b - a).toFixed(dig)}</span>${unit}`;
function mRuns(P, cols) { // cols: [[header, fn(r, e) -> html]]
  if (!P.idx.length) return '<p class="empty">No workouts in this period.</p>';
  return `<div class="scroll-x"><table class="tb"><thead><tr><th>Date</th><th>Workout</th>${cols.map(c => `<th class="n">${c[0]}</th>`).join('')}</tr></thead><tbody>${P.idx.slice().reverse().map(i => { const r = st.runs[i], e = st.res[i];
    return `<tr><td><a href="#w-${esc(r.id)}">${fmtDate(r.start, { weekday: 'short', day: 'numeric', month: 'short' })}</a></td><td>${esc(r.name)}</td>${cols.map(c => `<td class="n">${c[1](r, e)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
}
function dailyDist(P) { const m = new Map(); P.idx.forEach(i => { const k = dayStart(st.runs[i].start); m.set(k, (m.get(k) || 0) + (st.res[i].dist || 0)); }); const out = []; for (let t = P.t0; t <= P.t1; t = dayStart(t + DAY * 1.5)) out.push([t, (m.get(t) || 0) / U()]); return out; }
const first = (days, f) => { const d = days.find(x => x[f] != null); return d ? d[f] : null; };
const lastOf = (days, f) => { const d = [...days].reverse().find(x => x[f] != null); return d ? d[f] : null; };

const METRICS = {
  vo2: { title: 'VO₂max', key: 'vo2', render(P) {
    const a = first(P.days, 'vo2'), b = lastOf(P.days, 'vo2'), ests = P.idx.map(i => st.res[i].est).filter(Boolean), rt = b && RATE.rate(b, st.S.age, st.S.sex);
    return { html: `<div class="stats">${mStat('Now', b ? f1(b) : '–', 'ml/kg/min', 'vo2')}${mStat('Change', mChange(a, b, 1))}${mStat('Rating', rt ? badge(STATUS.rating(rt.k), rt.name) : '–', '', 'rating')}${mStat('Best run', ests.length ? f1(Math.max(...ests)) : '–')}${mStat('Runs with estimate', ests.length)}</div>
      <div class="wd-grid">${mCard('VO₂max', 'mc1', 'Line: daily value. Dots: single-run estimates (bigger = more confident).', 'vo2')}<div class="card"><h3 style="margin-bottom:8px">Workouts</h3>${mRuns(P, [['VO₂ est.', (r, e) => e.est ? f1(e.est) : '–'], ['Conf.', (r, e) => e.est ? Math.round(e.conf * 100) + '%' : '–']])}</div></div>`,
      draw() { plot($('#mc1'), { label: 'VO2max', xMin: P.xMin, xMax: P.xMax, minSpan: 4, under: vo2Bands, series: [
        { name: 'Run estimate', kind: 'dots', color: css('--vo2'), op: 0.4, r: p => 3 + 3 * p[2], pts: P.idx.map(i => [st.runs[i].start, st.res[i].est, st.res[i].conf, st.runs[i].name]).filter(p => p[1]), fmt: (v, p) => `${v.toFixed(1)} · ${p[3]}` },
        { name: 'VO₂max', kind: 'line', color: css('--vo2'), w: 2.5, pts: P.days.map(d => [d.t, d.vo2]), fmt: v => v.toFixed(1) }] }); } };
  } },
  end: { title: 'Endurance score', key: 'end', render(P) {
    const a = first(P.days, 'end'), b = lastOf(P.days, 'end'), D = P.days[P.days.length - 1];
    return { html: `<div class="stats">${mStat('Now', b ? f0(b) : '–', '', 'end')}${mStat('Level', b ? badge(STATUS.tier(TIERS.findIndex(t => t[1] === tierOf(b))), tierOf(b)) : '–')}${mStat('Change', mChange(a, b, 0))}${mStat('Weekly time', D ? fmtDur(D.H * 3600) : '–', '', 'ff')}${mStat('Longest run', D ? Math.round(D.L) : '–', 'min')}</div>
      <div class="wd-grid">${mCard('Endurance score', 'mc1', '', 'end')}<div class="card"><h3 style="margin-bottom:10px">${al('end', 'What drives it now')}</h3><div class="bars" id="mBars"></div></div></div>`,
      draw() { plot($('#mc1'), { label: 'Endurance score', xMin: P.xMin, xMax: P.xMax, minSpan: 400, series: [{ name: 'Endurance score', kind: 'area', color: css('--end'), pts: P.days.map(d => [d.t, d.end]), fmt: v => `${f0(v)} · ${tierOf(v)}` }] }); renderBreakdown(D, $('#mBars')); } };
  } },
  ff: { title: 'Fitness, fatigue & form', key: 'ff', render(P) {
    const D = P.days[P.days.length - 1], s = D ? FF.status(D.tsb) : null;
    return { html: `<div class="stats">${mStat('Fitness', D ? f0(D.ctl) : '–', '', 'ff')}${mStat('Fatigue', D ? f0(D.atl) : '–', '', 'ff')}${mStat('Form', D ? (D.tsb >= 0 ? '+' : '') + Math.round(D.tsb) : '–', '', 'ff')}${(() => { const T = TS.of(st.days, st.runs, st.res, st.asOf); return mStat('Training status', badge(TS.styles[T.name], T.name), '', 'ts'); })()}${mStat('Fitness change', mChange(first(P.days, 'ctl'), D && D.ctl, 0))}</div>
      <div class="card" style="margin-top:12px"><h3 style="margin-bottom:10px">${al('ts', 'Training status history')}</h3>${tsStrip(P)}</div><div class="wd-grid">${mCard('Fitness & fatigue', 'mc1', '42-day and 7-day load averages.', 'ff')}${mCard('Form', 'mc2', 'Fitness minus fatigue. Above 0 you are fresher than usual.', 'ff')}</div>`,
      draw() {
        plot($('#mc1'), { label: 'Fitness and fatigue', xMin: P.xMin, xMax: P.xMax, zero: true, series: [{ name: 'Fitness', kind: 'line', color: css('--fit'), w: 2.5, pts: P.days.map(d => [d.t, d.ctl]), fmt: v => f0(v) }, { name: 'Fatigue', kind: 'line', color: css('--fat'), pts: P.days.map(d => [d.t, d.atl]), fmt: v => f0(v) }] });
        plot($('#mc2'), { label: 'Form', xMin: P.xMin, xMax: P.xMax, minSpan: 20, series: [{ name: 'Form', kind: 'line', color: css('--form'), pts: P.days.map(d => [d.t, d.tsb]), fmt: v => (v >= 0 ? '+' : '') + Math.round(v) + ' · ' + FF.status(v)[0] }],
          extra: (sx, sy, b) => 0 > b.y0 && 0 < b.y1 ? `<line x1="${b.m.l}" x2="${b.W - b.m.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="var(--muted)" stroke-width="1"/>` : '' });
      } };
  } },
  race: { title: 'Race predictions', key: 'race', render(P) {
    const D = P.days[P.days.length - 1], pr = D && D.vo2 ? RACE.predict(D) : null;
    return { html: `<div class="stats">${pr ? pr.map(([n, t, d]) => mStat(n, fmtDur(t), fmtPace(t / (d / 1000)) + '/' + uName(), 'race')).join('') : mStat('Predictions', '–')}</div>
      <div class="wd-grid">${RACES.map((x, k) => mCard(x[1], 'mr' + k, 'Faster is higher.', 'race')).join('')}</div>`,
      draw() { RACES.forEach((x, k) => plot($('#mr' + k), { label: x[1] + ' prediction', xMin: P.xMin, xMax: P.xMax, invert: true, minSpan: x[0] / 100, height: 180, yFmt: v => fmtDur(v),
        series: [{ name: x[1], kind: 'line', color: css('--race'), pts: P.days.map(d => [d.t, d.vo2 ? RACE.predict(d)[k][1] : null]), fmt: v => fmtDur(v) }] })); } };
  } },
  dist: { title: 'Distance', render(P) {
    const tot = P.idx.reduce((s, i) => s + (st.res[i].dist || 0), 0), tm = P.idx.reduce((s, i) => s + (st.res[i].mov || 0), 0);
    return { html: `<div class="stats">${mStat('Distance', fmtDist(tot), uName())}${mStat('Time', fmtDur(tm))}${mStat('Runs', P.idx.length)}${mStat('Avg pace', tot ? fmtPace(tm / (tot / 1000)) : '–', '/' + uName(), 'gap')}${mStat('Per week', fmtDist(tot / Math.max(1, P.n / 7)), uName())}</div>
      <div class="wd-grid">${mCard(P.n > 60 ? 'Weekly distance' : 'Daily distance', 'mc1')}<div class="card"><h3 style="margin-bottom:8px">Workouts</h3>${mRuns(P, [['Dist ' + uName(), (r, e) => fmtDist(e.dist)], ['Time', (r, e) => fmtDur(e.mov)], ['Pace', (r, e) => fmtPace(e.pace)]])}</div></div>`,
      draw() {
        if (P.n > 60) { const w = weekly().filter(p => p[0] >= P.t0); plot($('#mc1'), { label: 'Weekly distance', xMin: P.xMin, xMax: P.xMax + 3 * DAY, zero: true, series: [{ name: 'Distance', kind: 'bars', bw: 7 * DAY, color: css('--dist'), pts: w, fmt: (v, p) => `${v.toFixed(1)} ${uName()} · ${p[2]} runs` }], tipX: t => 'Week of ' + fmtDate(t - 3.5 * DAY) }); }
        else plot($('#mc1'), { label: 'Daily distance', xMin: P.xMin, xMax: P.xMax, zero: true, series: [{ name: 'Distance', kind: 'bars', bw: DAY, color: css('--dist'), pts: dailyDist(P), fmt: v => v ? `${v.toFixed(2)} ${uName()}` : 'rest' }] });
      } };
  } },
  load: { title: 'Training load', key: 'acwr', render(P) {
    const s = ACWR.series(st.runs, st.res, st.asOf).filter(x => x[0] >= P.t0), last = s[s.length - 1], status = last ? ACWR.status(last[3]) : null;
    const byDay = new Map(); P.idx.forEach(i => { const k = dayStart(st.runs[i].start); byDay.set(k, (byDay.get(k) || 0) + (st.res[i].load || 0)); });
    const daily = []; for (let t = P.t0; t <= P.t1; t = dayStart(t + DAY * 1.5)) daily.push([t, byDay.get(t) || 0]);
    return { html: `<div class="stats">${mStat('7-day load', last ? f0(last[1]) : '–', '', 'acwr')}${mStat('Optimal range', last && last[2] ? `${f0(0.8 * last[2])}–${f0(1.3 * last[2])}` : '–', '', 'acwr')}${mStat('Ratio', last && last[3] ? last[3].toFixed(2) + '×' : '–', '', 'acwr')}${mStat('Status', status ? badge(STATUS.load(last[3]), status[0]) : '–')}${mStat('Load in period', f0(P.idx.reduce((t, i) => t + (st.res[i].load || 0), 0)), '', 'load')}</div>
      <div class="wd-grid">${mCard('Daily load', 'mc1', 'TRIMP of each day.', 'load')}${mCard('7-day load and optimal range', 'mc2', 'Shaded band: 0.8–1.3 × your usual load.', 'acwr')}</div>`,
      draw() {
        plot($('#mc1'), { label: 'Daily load', xMin: P.xMin, xMax: P.xMax, zero: true, series: [{ name: 'Load', kind: 'bars', bw: DAY, color: css('--load'), pts: daily, fmt: v => f0(v) }] });
        plot($('#mc2'), { label: '7-day load', xMin: P.xMin, xMax: P.xMax, zero: true, yMax: Math.max(...s.map(x => x[2] * 1.3)), series: [{ name: '7-day load', kind: 'line', color: css('--load'), w: 2.5, pts: s.map(x => [x[0], x[1]]), fmt: (v, p) => f0(v) }],
          extra: (sx, sy) => { const top = s.map(x => `${sx(x[0]).toFixed(1)},${sy(x[2] * 1.3).toFixed(1)}`), bot = s.map(x => `${sx(x[0]).toFixed(1)},${sy(x[2] * 0.8).toFixed(1)}`).reverse(); return s.length > 1 ? `<polygon points="${top.concat(bot).join(' ')}" fill="var(--good)" fill-opacity=".12"/>` : ''; } });
      } };
  } },
  zones: { title: 'Intensity mix', key: 'zones', render(P) {
    const z = [0, 0, 0, 0, 0]; P.idx.forEach(i => { const e = st.res[i]; if (e.zones) e.zones.forEach((s, k) => z[k] += s); });
    const tot = z.reduce((a, b) => a + b, 0), pc = x => tot ? Math.round(x / tot * 100) : 0;
    return { html: `<div class="stats">${mStat('Easy Z1–2', pc(z[0] + z[1]), '%', 'zones')}${tot ? mStat('Balance', badge(...STATUS.easy(pc(z[0] + z[1])))) : ''}${mStat('Moderate Z3', pc(z[2]), '%', 'zones')}${mStat('Hard Z4–5', pc(z[3] + z[4]), '%', 'zones')}${mStat('Time with HR', fmtDur(tot))}</div>
      <div class="wd-grid">${lfCard(P)}<div class="card"><h3 style="margin-bottom:10px">${al('zones', 'Time in zones')}</h3><div class="bars">${tot ? z.map((s, k) => `<div class="bar-row"><span>${ZONE.labels[k]}</span><span class="v">${fmtDur(s)} · ${pc(s)}%</span><div class="track"><i style="width:${Math.max(1, s / tot * 100)}%;background:var(--hz${k + 1})"></i></div></div>`).join('') : '<p class="empty">No heart-rate data in this period.</p>'}</div></div>
      <div class="card"><h3 style="margin-bottom:8px">Workouts</h3>${mRuns(P, [['Easy', (r, e) => e.zones ? pcOf(e.zones, 0, 2) : '–'], ['Hard', (r, e) => e.zones ? pcOf(e.zones, 3, 5) : '–'], ['Avg HR', (r, e) => e.avgHR ? Math.round(e.avgHR) : '–']])}</div></div>` };
  } },
  ef: { title: 'Aerobic efficiency', key: 'ef', render(P) {
    const pts = P.idx.filter(i => st.res[i].ef && !st.runs[i].summary).map(i => [st.runs[i].start, st.res[i].ef, 0, st.runs[i].name]), avg = pts.length ? pts.reduce((s, p) => s + p[1], 0) / pts.length : null;
    return { html: `<div class="stats">${mStat('Average', avg ? avg.toFixed(2) : '–', 'm/beat', 'ef')}${mStat('Best', pts.length ? Math.max(...pts.map(p => p[1])).toFixed(2) : '–', 'm/beat')}${mStat('Runs', pts.length)}</div>
      <div class="wd-grid">${mCard('Aerobic efficiency', 'mc1', 'Metres per heartbeat at grade-adjusted pace. Higher is better.', 'ef')}<div class="card"><h3 style="margin-bottom:8px">Workouts</h3>${mRuns(P, [['m/beat', (r, e) => e.ef ? e.ef.toFixed(2) : '–'], ['Avg HR', (r, e) => e.avgHR ? Math.round(e.avgHR) : '–']])}</div></div>`,
      draw() { plot($('#mc1'), { label: 'Aerobic efficiency', xMin: P.xMin, xMax: P.xMax, minSpan: 0.1, empty: 'Needs runs with heart rate.', series: [{ name: 'Run', kind: 'dots', color: css('--ef'), pts, fmt: (v, p) => `${v.toFixed(2)} m/beat · ${p[3]}` }] }); } };
  } },
  // ---- all-day data (users/{uid}/daily, written by the Garmin export job); values come straight from Garmin ----
  rhr: { title: 'Resting heart rate', daily: true, render(P) {
    const D = dailyIn(P), a = first(D, 'rhr'), b = lastOf(D, 'rhr'), v = D.map(d => d.rhr).filter(Boolean);
    return { html: `<div class="stats">${mStat('Now', b ? Math.round(b) : '–', 'bpm')}${mStat('Change', mChange(a, b, 0))}${mStat('Average', v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : '–', 'bpm')}${mStat('Lowest', v.length ? Math.min(...v) : '–', 'bpm')}${mStat('Highest', v.length ? Math.max(...v) : '–', 'bpm')}</div>
      <div class="wd-grid">${mCard('Resting heart rate', 'mc1', 'Lower and steady is better. A jump of 5+ bpm can mean fatigue or illness.')}</div>`,
      draw() { plot($('#mc1'), { label: 'Resting heart rate', xMin: P.xMin, xMax: P.xMax, minSpan: 6, empty: 'No all-day data in this period.', series: [{ name: 'Resting HR', kind: 'line', color: css('--rhr'), w: 2.5, pts: D.map(d => [d.t, d.rhr]), fmt: v => Math.round(v) + ' bpm' }] }); } };
  } },
  stress: { title: 'Stress', daily: true, render(P) {
    const D = dailyIn(P), v = D.map(d => d.stress).filter(x => x != null), b = lastOf(D, 'stress'), lv = x => x < 26 ? 'Resting' : x < 51 ? 'Low' : x < 76 ? 'Medium' : 'High';
    return { html: `<div class="stats">${mStat('Latest day', b != null ? Math.round(b) : '–')}${mStat('Level', b != null ? lv(b) : '–')}${mStat('Average', v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : '–')}${mStat('Calmest day', v.length ? Math.round(Math.min(...v)) : '–')}${mStat('Most stressed', v.length ? Math.round(Math.max(...v)) : '–')}</div>
      <div class="wd-grid">${mCard('Average stress', 'mc1', 'Garmin stress score, 0–100, from heart-rate variability. Lower is calmer.')}</div>`,
      draw() { plot($('#mc1'), { label: 'Average stress', xMin: P.xMin, xMax: P.xMax, zero: true, yMax: 100, empty: 'No all-day data in this period.', series: [{ name: 'Stress', kind: P.n > 60 ? 'line' : 'bars', bw: DAY, color: css('--stress'), w: 2.5, pts: D.map(d => [d.t, d.stress]), fmt: v => Math.round(v) + ' · ' + lv(v) }] }); } };
  } },
  bb: { title: 'Body battery', daily: true, render(P) {
    const D = dailyIn(P), hi = D.map(d => d.bbHigh).filter(x => x != null), lo = D.map(d => d.bbLow).filter(x => x != null), b = D[D.length - 1];
    return { html: `<div class="stats">${mStat('Latest high', b && b.bbHigh != null ? Math.round(b.bbHigh) : '–')}${mStat('Latest low', b && b.bbLow != null ? Math.round(b.bbLow) : '–')}${mStat('Average high', hi.length ? Math.round(hi.reduce((x, y) => x + y, 0) / hi.length) : '–')}${mStat('Average low', lo.length ? Math.round(lo.reduce((x, y) => x + y, 0) / lo.length) : '–')}${mStat('Days', D.length)}</div>
      <div class="wd-grid">${mCard('Body battery', 'mc1', 'Each day’s highest and lowest charge, 0–100. Good recovery shows as a high peak after sleep.')}</div>`,
      draw() { plot($('#mc1'), { label: 'Body battery', xMin: P.xMin, xMax: P.xMax, zero: true, yMax: 100, empty: 'No all-day data in this period.', series: [
        { name: 'Daily high', kind: 'line', color: css('--bb'), w: 2.5, pts: D.map(d => [d.t, d.bbHigh]), fmt: v => Math.round(v) },
        { name: 'Daily low', kind: 'line', color: css('--bb'), op: 0.5, pts: D.map(d => [d.t, d.bbLow]), fmt: v => Math.round(v) }] }); } };
  } },
};
const dailyIn = P => st.daily.filter(d => d.t >= P.t0 && d.t <= P.t1);
const pcOf = (z, a, b) => { const t = z.reduce((x, y) => x + y, 0); return t ? Math.round(z.slice(a, b).reduce((x, y) => x + y, 0) / t * 100) + '%' : '–'; };

// Garmin-style strip: one coloured cell per day with that day's training status
function tsStrip(P) {
  const cells = []; for (let i = 0; i < st.days.length; i++) { const d = st.days[i]; if (d.t < P.t0 || d.t > P.t1) continue;
    const T = TS.of(st.days.slice(0, i + 1), st.runs.filter(r => r.start < d.t + DAY), st.res.filter((e, k) => st.runs[k].start < d.t + DAY), d.t); cells.push([d.t, T.name]); }
  const used = [...new Set(cells.map(c => c[1]))];
  return `<div class="ts-strip">${cells.map(([t, n]) => `<i class="b-${TS.styles[n]}" title="${fmtDate(t, { weekday: 'short', day: 'numeric', month: 'short' })}: ${n}"></i>`).join('')}</div>
    <div class="btns" style="margin-top:10px">${used.map(n => badge(TS.styles[n], n)).join('')}</div>`;
}
// load focus for the selected period (same categories as LFalg1)
function lfCard(P) {
  const F = LF.of(st.runs, st.res, P.t1); if (!F) return '';
  return `<div class="card"><h3 style="margin-bottom:10px">${al('lf', 'Load focus · last 4 weeks')}</h3>${badge(F.status[1], F.status[0])}<div class="lf" style="margin-top:10px">${F.rows.map(r => `<div class="lf-row"><span class="lf-n">${r.name}</span><span class="v">${Math.round(r.share * 100)}%</span><div class="lf-track"><span class="lf-tgt" style="left:${r.lo * 100}%;width:${(r.hi - r.lo) * 100}%"></span><i style="width:${Math.min(100, r.share * 100)}%;background:${r.col}"></i></div></div>`).join('')}</div></div>`;
}
function renderMetric(key) {
  const box = $('#v-metric'), m = METRICS[key];
  if (!m) { location.hash = '#overview'; return; }
  const head = `<a class="btn back ghost" href="#overview">← Overview</a><div class="vh"><h2>${m.key ? al(m.key, m.title) : m.title}</h2>
    <div class="seg" role="group" aria-label="Period">${M_RANGES.map(([n, l]) => `<button type="button" data-r="${n}" aria-pressed="${(st.mRange || 7) === n}">${l}</button>`).join('')}</div></div>`;
  if (!st.runs.length && !(m.daily && st.daily.length)) { box.innerHTML = head + `<p class="empty">${m.daily ? 'No all-day data yet. It appears once the Garmin export job has written your days.' : 'Import workouts to see this.'}</p>`; return; }
  const P = mPeriod(), out = m.render(P);
  box.innerHTML = head + `<p class="muted sm" style="margin:-6px 0 12px">${fmtDate(P.t0, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(P.t1, { day: 'numeric', month: 'short', year: 'numeric' })}</p>` + out.html;
  box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { st.mRange = +b.dataset.r; renderMetric(key); addChartShare(); addHelp(); });
  if (out.draw) requestAnimationFrame(() => { out.draw(); });
}
// ===== END METRIC PAGES =====
