// ===== OVERVIEW DASHBOARD: Garmin-style cards the runner can add, remove, resize and reorder =====
// Layout is saved in the profile settings as ["id:size", …] (Firestore can't store nested arrays).

/* ---------- chart builders, shared by the dashboard and Trends ---------- */
const lastDay = () => st.days[st.days.length - 1];
const rangeOf = days => { const xMax = lastDay().t, xMin = days ? Math.max(st.days[0].t, xMax - days * DAY) : st.days[0].t; return { xMin, xMax, inR: t => t >= xMin - DAY && t <= xMax + DAY }; };
// faint Poor…Superior bands behind VO₂max charts, like Garmin (needs age)
function vo2Bands(sx, sy, b) {
  if (!st.S.age) return ''; const bd = RATE.bounds(st.S.age, st.S.sex), edges = [-1e9, ...bd, 1e9]; let g = '';
  for (let k = 0; k < 5; k++) { const lo = Math.max(edges[k], b.y0), hi = Math.min(edges[k + 1], b.y1); if (hi <= lo) continue;
    g += `<rect x="${b.m.l}" width="${b.W - b.m.l - b.m.r}" y="${sy(hi)}" height="${sy(lo) - sy(hi)}" fill="${ratingCol(k, 5)}" fill-opacity=".09"/><text class="ax" x="${b.W - b.m.r - 4}" y="${sy(hi) + 12}" text-anchor="end">${RATE.names[k]}</text>`; }
  return g;
}
function vo2Chart(el, days, withRuns, height) {
  const { xMin, xMax, inR } = rangeOf(days), series = [];
  if (withRuns) series.push({ name: 'Run estimate', kind: 'dots', color: css('--c1'), op: 0.35, r: p => 3 + 3 * p[2], fmt: (v, p) => `${v.toFixed(1)} · ${p[3]}`,
    pts: st.runs.map((r, i) => [r.start, st.res[i].est, st.res[i].conf, r.name]).filter(p => p[1] && inR(p[0])) });
  series.push({ name: withRuns ? 'Blended VO₂max' : 'VO₂max', kind: withRuns ? 'line' : 'area', color: css('--c1'), w: withRuns ? 2.5 : 2, pts: st.days.filter(d => inR(d.t)).map(d => [d.t, d.vo2]), fmt: v => v.toFixed(1) + ' ml/kg/min' });
  plot(el, { label: 'VO2max over time', xMin, xMax, height, minSpan: 4, series, under: vo2Bands });
}
function weekChart(el, weeks, height) {
  const xMax = lastDay().t, all = weekly(), wpts = weeks ? all.filter(p => p[0] >= xMax - weeks * 7 * DAY) : all;
  plot(el, { label: 'Weekly distance', xMin: wpts.length ? wpts[0][0] - 3.5 * DAY : xMax - 7 * DAY, xMax: xMax + 3.5 * DAY, zero: true, height,
    series: [{ name: 'Distance', kind: 'bars', bw: 7 * DAY, color: css('--c1'), pts: wpts, fmt: (v, p) => `${v.toFixed(1)} ${uName()} · ${p[2]} run${p[2] > 1 ? 's' : ''} · ${fmtDur(p[3])}` }],
    tipX: t => 'Week of ' + fmtDate(t - 3.5 * DAY) });
}
function loadChart(el, days, height) {
  const { xMin, xMax, inR } = rangeOf(days), dd = st.days.filter(d => inR(d.t));
  plot(el, { label: 'Fitness and fatigue', xMin, xMax, zero: true, height, series: [
    { name: 'Fitness (42-day)', kind: 'line', color: css('--c1'), w: 2.5, pts: dd.map(d => [d.t, d.ctl]), fmt: v => f0(v) },
    { name: 'Fatigue (7-day)', kind: 'line', color: css('--c2'), pts: dd.map(d => [d.t, d.atl]), fmt: v => f0(v) }] });
}
function endChart(el, days, height) {
  const { xMin, xMax, inR } = rangeOf(days), dd = st.days.filter(d => inR(d.t));
  plot(el, { label: 'Endurance score over time', xMin, xMax, height, minSpan: 400, series: [{ name: 'Endurance score', kind: 'area', color: css('--c1'), pts: dd.map(d => [d.t, d.end]), fmt: v => `${f0(v)} · ${tierOf(v)}` }],
    extra: (sx, sy, b) => TIERS.filter(t => t[0] > b.y0 && t[0] < b.y1).map(t => `<text class="ax" x="${b.W - b.m.r - 2}" y="${sy(t[0]) - 4}" text-anchor="end">${t[1]}</text>`).join('') });
}
function efChart(el, days, height) {
  const { xMin, xMax, inR } = rangeOf(days), pts = [];
  st.runs.forEach((r, i) => { const e = st.res[i]; if (e.ef && !r.summary && inR(r.start)) pts.push([r.start, e.ef, 0, r.name]); });
  const roll = pts.map(p => { const w = pts.filter(q => q[0] <= p[0] && q[0] > p[0] - 28 * DAY).map(q => q[1]).sort((a, b) => a - b); return [p[0], w[w.length >> 1]]; });
  plot(el, { label: 'Aerobic efficiency', xMin, xMax, height, minSpan: 0.1, empty: 'Needs runs with heart rate.', series: [
    { name: 'Run', kind: 'dots', color: css('--c1'), pts, op: 0.35, fmt: (v, p) => `${v.toFixed(2)} m/beat · ${p[3]}` },
    { name: '28-day median', kind: 'line', color: css('--c1'), w: 2.5, pts: roll, fmt: v => v.toFixed(2) + ' m/beat' }] });
}

/* ---------- widgets ---------- */
const head = (t, extra = '', key) => `<div class="ch"><h3>${key ? al(key, t) : t}</h3>${extra}</div>`;
const delta = (dv, digits, unit, eps) => dv == null ? '' : `<span class="${dv >= eps ? 'delta-up' : dv <= -eps ? 'delta-down' : ''}">${dv >= 0 ? '▲' : '▼'} <span class="num">${Math.abs(dv).toFixed(digits)}</span>${unit} in 4 weeks</span>`;
function agoDay() { const D = lastDay(), a = dayAt(D.t - 28 * DAY); return a && a !== D ? a : null; }
const WIDGETS = {
  vo2: { name: 'VO₂max', desc: 'Aerobic ceiling, rating for your age and fitness age', size: 'S', render(el) {
    const D = lastDay(), ago = agoDay(), S = st.S;
    if (!D.vo2) { el.innerHTML = `<span class="label">${al('vo2', 'VO₂max')}</span><p class="sub">Needs a run with heart rate and 10+ minutes of steady running in the 60 days before ${fmtDate(st.asOf)}.</p>`; return; }
    const rt = RATE.rate(D.vo2, S.age, S.sex), fa = S.age ? RATE.fitnessAge(D.vo2, S.sex, S.hrRest, S.weight, S.height) : null;
    let g = `<div class="big">${f1(D.vo2)}<small>ml/kg/min</small></div>`;
    if (rt) { const b = rt.bounds, lo = Math.floor(b[0] - (b[1] - b[0]) * 1.6), hi = Math.ceil(b[3] + (b[3] - b[2]) * 1.2);
      g = gauge({ label: 'VO2max rating', value: D.vo2, min: lo, max: hi, center: f1(D.vo2), fmt: v => Math.round(v),
        badge: badge(STATUS.rating(rt.k), al('rating', `${rt.name} · ${S.sex === 'f' ? 'women' : 'men'} ${S.age}`)),
        bands: [[lo, b[0]], [b[0], b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], hi]].map(([f, t], k) => [f, t, RATE.names[k], ratingCol(k, 5)]) }); }
    el.innerHTML = `<span class="label">${al('vo2', 'VO₂max')}</span>${g}
      ${rt ? '' : `<span class="chip help">Add age &amp; sex in Profile for a rating</span>`}
      <div class="sub">${fa ? `${al('rating', 'Fitness age')} <b>${fa}</b>${fa < S.age ? ` · ${S.age - fa} years younger` : ''}<br>` : ''}${ago && ago.vo2 ? delta(D.vo2 - ago.vo2, 1, '', 0.05) : ''}</div><div class="sub help">${al('hrmax', 'Max HR')} <span class="num">${Math.round(S.hrMaxEff)}</span> ${S.hrMax ? '(yours)' : st.hm && st.hm.source === 'detected' ? '(auto, from a run)' : st.hm && st.hm.source === 'age' ? '(auto, 220 − age)' : '(default)'}<br>Heart-rate model <span class="num">${f1(D.vo2hr)}</span>${D.vo2perf ? ` · race efforts <span class="num">${f1(D.vo2perf)}</span>` : ''}${S.weight ? ` · <span class="num">${(D.vo2 * S.weight / 1000).toFixed(2)}</span> L/min` : ''}</div>`;
  } },
  end: { name: 'Endurance score', desc: 'How long you can hold your aerobic ceiling', size: 'S', render(el) {
    const D = lastDay(), ago = agoDay();
    if (!D.end) { el.innerHTML = `<span class="label">${al('end', 'Endurance score')}</span><p class="sub">Appears once a VO₂max estimate exists.</p>`; return; }
    const lo = 2000, hi = 13000, bands = TIERS.map(([f, n], k) => [Math.max(lo, f), k < TIERS.length - 1 ? TIERS[k + 1][0] : hi, n, ratingCol(k, 7)]);
    el.innerHTML = `<span class="label">${al('end', 'Endurance score')}</span>${gauge({ label: 'Endurance score', value: D.end, min: lo, max: hi, center: f0(D.end), fmt: v => (v / 1000) + 'k', bands, badge: badge(STATUS.tier(TIERS.findIndex(t => t[1] === tierOf(D.end))), tierOf(D.end)) })}
      ${ago && ago.end ? `<div class="sub">${delta(D.end - ago.end, 0, '', 20)}</div>` : ''}`;
  } },
  status: { name: 'Training status', desc: 'Productive, maintaining, recovery… like Garmin', size: 'S', render(el) {
    const D = lastDay(), T = TS.of(st.days, st.runs, st.res, st.asOf), L = T.load, lv = TS.styles[T.name];
    const bar = L.chronic ? segbar({ label: 'Acute load', value: L.acute, min: 0, max: Math.max(L.chronic * 1.8, L.acute * 1.1),
      bands: [[0, 0.8 * L.chronic, 'Low', 'var(--rt6)'], [0.8 * L.chronic, 1.3 * L.chronic, 'Optimal', 'var(--rt4)'], [1.3 * L.chronic, 1.5 * L.chronic, 'High', 'var(--rt2)'], [1.5 * L.chronic, Math.max(L.chronic * 1.8, L.acute * 1.1), 'Very high', 'var(--rt1)']],
      left: `${al('acwr', 'Acute load')} <b>${f0(L.acute)}</b>`, right: `optimal ${f0(0.8 * L.chronic)}–${f0(1.3 * L.chronic)}` }) : '';
    el.innerHTML = `<span class="label">${al('ts', 'Training status')}</span><div class="ts-name b-${lv}"><i></i>${T.name}</div>
      ${T.dv != null ? `<div class="sub">${al('vo2', 'VO₂max')} <b>${f1(D.vo2)}</b> <span class="${T.dv > 0.5 ? 'delta-up' : T.dv < -0.5 ? 'delta-down' : ''}">${T.dv > 0.5 ? '▲' : T.dv < -0.5 ? '▼' : '▶'} ${Math.abs(T.dv).toFixed(1)}</span> in 3 weeks</div>` : ''}
      ${bar}<p class="sub help">${TS.why[T.name]}</p>
      <dl class="kv help"><dt>${al('ff', 'Fitness')}</dt><dd>${f0(D.ctl)}</dd><dt>Fatigue</dt><dd>${f0(D.atl)}</dd><dt>Form</dt><dd>${D.tsb >= 0 ? '+' : ''}${Math.round(D.tsb)}</dd><dt>Weekly running time</dt><dd>${fmtDur(D.H * 3600)}</dd></dl>`;
  } },
  race: { name: 'Race predictions', desc: '5K to marathon from VO₂max and endurance', size: 'S', render(el) {
    const D = lastDay();
    if (!D.vo2) { el.innerHTML = `<span class="label">${al('race', 'Race predictions')}</span><p class="sub">Appear once a VO₂max estimate exists.</p>`; return; }
    const A = agoDay(), prev = A && A.vo2 ? RACE.predict(A) : null;
    el.innerHTML = `<span class="label">${al('race', 'Race predictions')}</span><dl class="kv race-kv">${RACE.predict(D).map(([name, t, dist], k) => { const dt = prev ? t - prev[k][1] : 0;
      return `<dt>${name.replace('Half marathon', 'Half')}</dt><dd>${fmtDur(t)}${Math.abs(dt) >= 1 ? `<span class="${dt < 0 ? 'delta-up' : 'delta-down'}" title="vs 4 weeks ago">${dt < 0 ? '▲' : '▼'}${fmtDur(Math.abs(dt))}</span>` : ''}<small class="help">${fmtPace(t / (dist / 1000))}/${uName()}</small></dd>`; }).join('')}</dl><div class="sub help">From VO₂max, adjusted for volume and long runs.</div>`;
  } },
  week: { name: 'This week', desc: 'Distance, time and runs, Monday to Sunday', size: 'S', render(el) {
    const now = st.asOf, d0 = (() => { const d = new Date(dayStart(now)); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; })();
    const per = Array.from({ length: 7 }, () => 0); let dist = 0, time = 0, n = 0, prev = 0;
    st.runs.forEach((r, i) => { const e = st.res[i];
      if (r.start >= d0 && r.start < d0 + 7 * DAY) { const k = Math.round((dayStart(r.start) - d0) / DAY); per[clamp(k, 0, 6)] += e.dist || 0; dist += e.dist || 0; time += e.mov || 0; n++; }
      else if (r.start >= d0 - 7 * DAY && r.start < d0) prev += e.dist || 0; });
    const mx = Math.max(...per, 1), today = clamp(Math.round((dayStart(now) - d0) / DAY), 0, 6), dl = prev ? (dist - prev) / U() : null;
    el.innerHTML = `<span class="label">This week</span><div class="big">${fmtDist(dist)}<small>${uName()}</small></div>
      <div class="sub">${n} run${n === 1 ? '' : 's'} · ${fmtDur(time)}${dl != null ? ` · <span class="${dl >= 0 ? 'delta-up' : 'delta-down'}">${dl >= 0 ? '+' : '−'}${Math.abs(dl).toFixed(1)}</span> vs last week` : ''}</div>
      <div class="wkbars">${per.map((v, k) => `<div class="${k === today ? 'today' : ''}" title="${fmtDist(v)} ${uName()}"><i style="height:${v ? Math.max(4, v / mx * 46) : 2}px;${v ? '' : 'background:var(--line)'}"></i>${'MTWTFSS'[k]}</div>`).join('')}</div>`;
  } },
  acute: { name: 'Training load', desc: '7-day load against your optimal range', size: 'S', render(el) {
    const L = ACWR.compute(st.runs, st.res, st.asOf), lab = `<span class="label">${al('acwr', 'Training load')}</span>`;
    if (!L.chronic) { el.innerHTML = lab + '<p class="sub">Needs a few weeks of workouts.</p>'; return; }
    const bands = [[0, 0.8, 'Low', 'var(--rt6)'], [0.8, 1.3, 'Optimal', 'var(--rt4)'], [1.3, 1.5, 'High', 'var(--rt2)'], [1.5, 2, 'Very high', 'var(--rt1)']];
    el.innerHTML = lab + gauge({ label: 'Load ratio', value: L.ratio, min: 0, max: 2, center: L.ratio.toFixed(2) + '×', fmt: v => v.toFixed(1), bands, badge: badge(STATUS.load(L.ratio), L.status[0]) })
      + `<div class="sub"><b>${f0(L.acute)}</b> load in 7 days · optimal ${f0(0.8 * L.chronic)}–${f0(1.3 * L.chronic)}</div><div class="sub help">${L.status[2]}</div>`;
  } },
  ai: { name: 'AI coach', desc: 'A short Gemini read on what you do well and what you miss', size: 'L', always: true, render(el) { renderAICard(el); } },
  latest: { name: 'Latest workout', desc: 'Route, distance, pace and heart rate', size: 'M', render(el) {
    const li = st.runs.length - 1, r = st.runs[li], e = st.res[li], g = routeGlyph(r, 300, 18);
    el.innerHTML = head('Latest workout', `<a href="#w-${esc(r.id)}" class="sm">Open details →</a>`) + `<div class="latest">${g ? `<a class="mini-map" href="#w-${esc(r.id)}" aria-label="Open route"><svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet"><path d="${g}" fill="none" stroke="var(--surface)" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/><path d="${g}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg></a>` : ''}
      <div><p class="lt">${esc(r.name)}</p><p class="muted sm" style="margin-bottom:12px">${new Date(r.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <dl class="kv"><dt>Distance</dt><dd>${fmtDist(e.dist)} ${uName()}</dd><dt>Time</dt><dd>${fmtDur(e.mov)}</dd><dt>Pace</dt><dd>${fmtPace(e.pace)}/${uName()}</dd><dt>Avg HR</dt><dd>${e.avgHR ? Math.round(e.avgHR) + ' bpm' : '–'}</dd><dt>VO₂max est.</dt><dd>${e.est ? f1(e.est) : '–'}</dd><dt>Load</dt><dd>${f0(e.load)}</dd></dl></div></div>`;
  } },
  vo2chart: { name: 'VO₂max trend', desc: 'Last 6 months', size: 'M', chart: true, render(el) { el.innerHTML = head('VO₂max', '<span class="muted sm">Last 6 months</span>', 'vo2') + '<div class="plot"></div>'; vo2Chart(el.querySelector('.plot'), 182, false, 200); } },
  weekchart: { name: 'Weekly distance', desc: 'Last 16 weeks', size: 'M', chart: true, render(el) { el.innerHTML = head('Weekly distance', `<span class="muted sm">Last 16 weeks, ${uName()}</span>`) + '<div class="plot"></div>'; weekChart(el.querySelector('.plot'), 16, 200); } },
  loadchart: { name: 'Fitness & fatigue', desc: '42-day and 7-day load, last 12 weeks', size: 'M', chart: true, render(el) { el.innerHTML = head('Fitness &amp; fatigue', '<span class="muted sm">Last 12 weeks</span>', 'ff') + '<div class="plot"></div>'; loadChart(el.querySelector('.plot'), 84, 200); } },
  endchart: { name: 'Endurance trend', desc: 'Endurance score, last 6 months', size: 'M', chart: true, render(el) { el.innerHTML = head('Endurance score', '<span class="muted sm">Last 6 months</span>', 'end') + '<div class="plot"></div>'; endChart(el.querySelector('.plot'), 182, 200); } },
  efchart: { name: 'Aerobic efficiency', desc: 'Metres per heartbeat, last 6 months', size: 'M', chart: true, render(el) { el.innerHTML = head('Aerobic efficiency', '<span class="muted sm">m per beat</span>', 'ef') + '<div class="plot"></div>'; efChart(el.querySelector('.plot'), 182, 200); } },
  calendar: { name: 'Activity calendar', desc: 'Every run of the last 16 weeks', size: 'M', render(el) {
    const W = 16, end = dayStart(st.asOf), endMon = end - ((new Date(end).getDay() + 6) % 7) * DAY, start = endMon - (W - 1) * 7 * DAY, per = new Map();
    st.runs.forEach((r, i) => { const k = dayStart(r.start); if (k >= start) per.set(k, (per.get(k) || 0) + (st.res[i].dist || 0)); });
    const vals = [...per.values()].sort((a, b) => a - b), q = p => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] || 1;
    const cuts = [q(0.25), q(0.5), q(0.75), q(0.9)], lvl = v => 1 + cuts.filter(c => v > c).length;
    let cells = '';
    for (let dow = 0; dow < 7; dow++) {
      cells += `<span>${dow % 2 ? '' : 'MTWTFSS'[dow]}</span>`;
      for (let w = 0; w < W; w++) { const t = dayStart(start + (w * 7 + dow) * DAY + DAY / 2), v = per.get(t);
        cells += t > end ? '<i style="visibility:hidden"></i>' : `<i title="${fmtDate(t, { weekday: 'short', day: 'numeric', month: 'short' })}: ${v ? fmtDist(v) + ' ' + uName() : 'rest'}"${v ? ` style="background:var(--z${lvl(v)})"` : ''}></i>`; }
    }
    const days = per.size, km = vals.reduce((a, b) => a + b, 0);
    el.innerHTML = head('Activity calendar', `<span class="muted sm">${days} run days · ${fmtDist(km)} ${uName()}</span>`) + `<div class="cal" style="--wk:${W}">${cells}</div>
      <div class="cal-leg">Less <i style="background:var(--sunk)"></i><i style="background:var(--z1)"></i><i style="background:var(--z2)"></i><i style="background:var(--z3)"></i><i style="background:var(--z4)"></i><i style="background:var(--z5)"></i> More</div>`;
  } },
  zones: { name: 'Intensity mix', desc: 'Time in heart-rate zones, last 4 weeks', size: 'M', render(el) {
    const T = dayStart(st.asOf) + DAY, z = [0, 0, 0, 0, 0];
    st.runs.forEach((r, i) => { const e = st.res[i]; if (r.start >= T - 28 * DAY && e.zones) e.zones.forEach((s, k) => z[k] += s); });
    const tot = z.reduce((a, b) => a + b, 0);
    if (!tot) { el.innerHTML = head('Intensity mix', '', 'zones') + '<p class="empty">Needs runs with heart rate in the last 4 weeks.</p>'; return; }
    const pc = x => Math.round(x / tot * 100), easy = pc(z[0] + z[1]), mod = pc(z[2]), hard = pc(z[3] + z[4]);
    const verdict = easy >= 75 ? 'Close to the 80/20 balance most coaches aim for.' : mod > 25 ? 'A lot of moderate “grey zone” running — make easy days easier.' : 'Less easy running than the usual 80% target.', ev = STATUS.easy(easy);
    const lab = ZONE.labels;
    el.innerHTML = head('Intensity mix', '<span class="muted sm">Last 4 weeks</span>', 'zones') + `<div class="btns" style="align-items:center;margin:0 0 10px">${badge(ev[0], ev[1])}<span class="sub"><b>${easy}%</b> easy · <b>${mod}%</b> mod · <b>${hard}%</b> hard</span></div><p class="sub help" style="margin:0 0 12px">${verdict}</p>
      <div class="bars">${z.map((s, k) => `<div class="bar-row"><span>${lab[k]}</span><span class="v">${fmtDur(s)} · ${pc(s)}%</span><div class="track"><i style="width:${Math.max(1, s / tot * 100)}%;background:var(--hz${k + 1})"></i></div></div>`).join('')}</div>`;
  } },
  focus: { name: 'Load focus', desc: 'Low aerobic, high aerobic and anaerobic load, like Garmin', size: 'M', render(el) {
    const F = LF.of(st.runs, st.res, st.asOf);
    if (!F) { el.innerHTML = head('Load focus', '', 'lf') + '<p class="empty">Needs runs with heart rate in the last 4 weeks.</p>'; return; }
    el.innerHTML = head('Load focus', '<span class="muted sm">Last 4 weeks</span>', 'lf') + `<div class="ts-name b-${F.status[1]}" style="font-size:1.6rem"><i></i>${F.status[0]}</div>
      <div class="lf">${F.rows.map(r => `<div class="lf-row"><span class="lf-n">${r.name}</span><span class="v">${Math.round(r.share * 100)}%<small class="help"> · ${f0(r.load)}</small></span>
        <div class="lf-track"><span class="lf-tgt" style="left:${r.lo * 100}%;width:${(r.hi - r.lo) * 100}%"></span><i style="width:${Math.min(100, r.share * 100)}%;background:${r.col}"></i></div></div>`).join('')}</div>
      <p class="sub help" style="margin-top:8px">Bars: share of your 4-week load. Outlined boxes: target range.</p>`;
  } },
  fage: { name: 'Fitness age', desc: 'Your fitness age against your real age, like Garmin', size: 'S', render(el) {
    const D = lastDay(), S = st.S, lab = `<span class="label">${al('rating', 'Fitness age')}</span>`;
    if (!S.age || !D.vo2) { el.innerHTML = lab + '<p class="sub">Add your age in Profile (and resting HR, height, weight).</p>'; return; }
    const fa = RATE.fitnessAge(D.vo2, S.sex, S.hrRest, S.weight, S.height), d = S.age - fa, rt = RATE.rate(D.vo2, S.age, S.sex);
    const bmi = S.weight && S.height ? S.weight / (S.height / 100) ** 2 : null, T = dayStart(st.asOf) + DAY;
    let vig = 0; st.runs.forEach((r, i) => { const z = st.res[i].zones; if (r.start >= T - 28 * DAY && z) vig += (z[3] + z[4]) / 60; }); vig /= 4;
    el.innerHTML = lab + `<div class="big">${fa}<small>years</small></div>${badge(d >= 1 ? 'good' : d > -1 ? 'ok' : 'warn', d >= 1 ? `${d} years younger than ${S.age}` : d > -1 ? `Same as your age` : `${-d} years older than ${S.age}`)}
      <dl class="kv" style="margin-top:6px"><dt>${al('vo2', 'VO₂max')}</dt><dd>${f1(D.vo2)} ${badge(STATUS.rating(rt.k), rt.name)}</dd>
      <dt>Resting HR</dt><dd>${S.hrRest} ${badge(S.hrRest < 55 ? 'good' : S.hrRest <= 70 ? 'ok' : 'warn', S.hrRest < 55 ? 'Good' : S.hrRest <= 70 ? 'Normal' : 'High')}</dd>
      ${bmi ? `<dt>BMI</dt><dd>${bmi.toFixed(1)} ${badge(bmi < 18.5 ? 'warn' : bmi < 25 ? 'good' : bmi < 30 ? 'warn' : 'bad', bmi < 18.5 ? 'Low' : bmi < 25 ? 'Healthy' : bmi < 30 ? 'Over' : 'High')}</dd>` : ''}
      <dt>Vigorous min/week</dt><dd>${Math.round(vig)} ${badge(vig >= 75 ? 'good' : 'warn', vig >= 75 ? 'On target' : 'Below 75')}</dd></dl>`;
  } },
  drivers: { name: 'What drives your endurance', desc: 'Ceiling, volume, long runs and durability', size: 'M', render(el) { el.innerHTML = head('What drives your endurance', '', 'end') + '<div class="bars"></div>'; renderBreakdown(lastDay(), el.querySelector('.bars')); } },
  records: { name: 'Personal bests', desc: 'Fastest 5K, 10K, half and marathon', size: 'M', render(el) {
    const best = {}; st.runs.forEach((r, i) => { for (const e of st.res[i].efforts) if (e.label !== 'Run' && e.label !== '1 km' && (!best[e.label] || e.sec < best[e.label].e.sec)) best[e.label] = { e, r }; });
    const rows = EFFORTS.map(([, l]) => best[l]).filter(Boolean);
    el.innerHTML = head('Personal bests', '<a class="sm" href="#records">All records →</a>', 'best') + (rows.length ? `<dl class="kv">${rows.map(({ e, r }) => `<dt><a href="#w-${esc(r.id)}" style="color:inherit">${e.label}</a> <span class="muted sm">${fmtDate(r.start, { day: 'numeric', month: 'short', year: '2-digit' })}</span></dt><dd>${fmtDur(e.sec)}<small>${fmtPace(e.sec / (e.D / 1000))}/${uName()}</small></dd>`).join('')}</dl>` : '<p class="empty">Run 5 km or more to set a best.</p>');
  } },
};
// where tapping each card goes: a metric page (#m-key), or a page hash
const DASH_GO = {"focus": "zones", "fage": "vo2", "vo2": "vo2", "end": "end", "status": "ff", "race": "race", "week": "dist", "acute": "load", "vo2chart": "vo2", "weekchart": "dist", "loadchart": "ff", "endchart": "end", "efchart": "ef", "calendar": "dist", "zones": "zones", "drivers": "end", "records": "#records"};
const DASH_DEFAULT = ['vo2:S', 'end:S', 'status:S', 'race:S', 'ai:L', 'latest:M', 'vo2chart:M', 'week:S', 'acute:S', 'weekchart:M', 'calendar:M', 'focus:M', 'drivers:M', 'fage:S'];
function dashCfg() {
  const raw = Array.isArray(st.S.dash) && st.S.dash.length ? st.S.dash : DASH_DEFAULT;
  return raw.map(x => String(x).split(':')).filter(([id, s]) => WIDGETS[id] && ['S', 'M', 'L'].includes(s));
}
function saveDash(cfg) {
  st.S.dash = cfg.map(([id, s]) => id + ':' + s);
  if (st.user) st.backend.updateProfile({ settings: { dash: st.S.dash } }).then(u => { if (u) st.user = u; }).catch(e => setStatus('Could not save the layout: ' + e.message));
}
function renderBreakdown(D, box) {
  if (!D || !D.vo2) { box.innerHTML = '<p class="empty">Needs a VO₂max estimate.</p>'; return; }
  const items = [
    [al('vo2', 'Aerobic ceiling'), `${f1(D.vo2)} ml/kg/min`, clamp((D.vo2 - 30) / 45, 0, 1), 'VO₂max. Raised by intervals and threshold work.'],
    [al('ff', 'Training volume'), `${fmtDur(D.H * 3600)} / week`, fVol(D.H), `At ${Math.round(fVol(D.H) * 100)}% of its ceiling. More easy hours lift it most.`],
    ['Long-run reach', `${Math.round(D.L)} min longest`, gLong(D.L), `Longest run in the last 6 weeks. ${D.L < 90 ? 'A weekly run of 90+ minutes raises this.' : 'Strong.'}`],
    [al('drift', 'Durability'), D.hasDec ? `${f1(D.D)}% HR drift` : 'No 60-min runs', D.hasDec ? clamp((1.04 - 0.012 * D.D - 0.8) / 0.24, 0, 1) : 0.4, D.hasDec ? (D.D < 5 ? 'Heart rate stays steady late in long runs.' : 'Heart rate climbs late in long runs; more easy volume helps.') : 'Run 60+ minutes with heart rate to measure this.'],
  ];
  box.innerHTML = items.map(([n, v, f, h]) => `<div class="bar-row"><span>${n} ${badge(...STATUS.factor(f))}</span><span class="v">${v}</span><div class="track"><i style="width:${Math.max(3, f * 100)}%"></i></div><span class="hint">${h}</span></div>`).join('');
}

function renderOverview() {
  const u = st.user;
  $('#hello').textContent = u ? `Hi, ${u.name.split(' ')[0]}` : 'Sample athlete';
  $('#asof').textContent = st.runs.length ? (Date.now() - st.asOf > DAY ? 'As of your last workout, ' : 'Today, ') + fmtDate(st.asOf, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const cfg = dashCfg(), box = $('#dash'), edit = !!st.dashEdit;
  $('#dashEdit').textContent = edit ? 'Done' : 'Customize'; $('#dashEdit').classList.toggle('primary', edit); $('#dashReset').hidden = !edit;
  box.classList.toggle('editing', edit);
  box.innerHTML = cfg.map(([id, size], k) => `<div class="w w-${size}" data-k="${k}">
    <div class="w-ctl" role="group" aria-label="${esc(WIDGETS[id].name)} card"><button type="button" data-a="up" aria-label="Move earlier"${k ? '' : ' disabled'}>↑</button><button type="button" data-a="down" aria-label="Move later"${k < cfg.length - 1 ? '' : ' disabled'}>↓</button>${['S', 'M', 'L'].map(s => `<button type="button" data-a="size" data-s="${s}" class="${s === size ? 'on' : ''}" aria-label="Size ${s}">${s}</button>`).join('')}<button type="button" data-a="del" aria-label="Remove card">✕</button></div>
    <div class="card ${WIDGETS[id].chart ? 'chart-card' : 'tile'}" data-w="${id}"></div></div>`).join('');
  cfg.forEach(([id, size], k) => {
    const el = box.querySelector(`.w[data-k="${k}"] .card`), w = WIDGETS[id];
    if (!st.runs.length && !w.always) { el.innerHTML = (w.size === 'S' ? `<span class="label">${w.name}</span>` : head(w.name)) + '<p class="empty">Import workouts to see this</p>'; return; }
    try { w.render(el, size); } catch (e) { console.warn(id, e); el.innerHTML = head(w.name) + '<p class="empty">Could not draw this card.</p>'; }
  });
  box.querySelectorAll('.w > .card').forEach(el => {
    const id = el.dataset.w, latest = id === 'latest' && st.runs.length ? '#w-' + st.runs[st.runs.length - 1].id : null, g = DASH_GO[id];
    const href = latest || (g ? (g[0] === '#' ? g : '#m-' + g) : null); if (!href || !st.runs.length) return;
    el.classList.add('go'); el.tabIndex = 0; el.setAttribute('role', 'link'); el.setAttribute('aria-label', WIDGETS[id].name + ' — open trends');
    el.onclick = ev => { if (st.dashEdit || ev.target.closest('a, button, input, select, [data-algo]')) return; location.hash = href; };
    el.onkeydown = ev => { if (ev.key === 'Enter' && ev.target === el && !st.dashEdit) location.hash = href; };
  });
  box.querySelectorAll('.w-ctl button').forEach(b => b.onclick = () => {
    const k = +b.closest('.w').dataset.k, c = dashCfg(), a = b.dataset.a;
    if (a === 'up' && k > 0) [c[k - 1], c[k]] = [c[k], c[k - 1]];
    else if (a === 'down' && k < c.length - 1) [c[k + 1], c[k]] = [c[k], c[k + 1]];
    else if (a === 'size') c[k][1] = b.dataset.s;
    else if (a === 'del') c.splice(k, 1);
    saveDash(c); renderOverview(); addChartShare(); addHelp();
  });
  const add = $('#dashAdd'), used = new Set(cfg.map(c => c[0])), free = Object.keys(WIDGETS).filter(id => !used.has(id));
  add.hidden = !edit;
  add.innerHTML = edit ? `<div class="card"><div class="ch"><h3>Add cards</h3><span class="muted sm">${free.length ? 'Tap a card to add it at the end' : 'Every card is on your overview'}</span></div>
    <div class="add-list">${free.map(id => `<button type="button" data-id="${id}"><span><b>+ ${WIDGETS[id].name}</b><span>${WIDGETS[id].desc}</span></span></button>`).join('')}</div></div>` : '';
  add.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { const c = dashCfg(); c.push([b.dataset.id, WIDGETS[b.dataset.id].size]); saveDash(c); renderOverview(); addChartShare(); addHelp(); });
}
function initDash() {
  $('#dashEdit').onclick = () => { st.dashEdit = !st.dashEdit; renderOverview(); addChartShare(); addHelp(); };
  $('#dashReset').onclick = () => { saveDash(DASH_DEFAULT.map(x => x.split(':'))); renderOverview(); addChartShare(); addHelp(); };
}
// ===== END DASHBOARD =====
