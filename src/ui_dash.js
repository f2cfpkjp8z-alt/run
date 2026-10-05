// ===== OVERVIEW DASHBOARD: Garmin-style cards the runner can add, remove, resize and reorder =====
// Layout is saved in the profile settings as ["id:size", …] (Firestore can't store nested arrays).

/* ---------- chart builders, shared by the dashboard and Trends ---------- */
const lastDay = () => st.days[st.days.length - 1];
const rangeOf = days => { const xMax = lastDay().t, xMin = days ? Math.max(st.days[0].t, xMax - days * DAY) : st.days[0].t; return { xMin, xMax, inR: t => t >= xMin - DAY && t <= xMax + DAY }; };
function vo2Chart(el, days, withRuns, height) {
  const { xMin, xMax, inR } = rangeOf(days), series = [];
  if (withRuns) series.push({ name: 'Run estimate', kind: 'dots', color: css('--c1'), op: 0.35, r: p => 3 + 3 * p[2], fmt: (v, p) => `${v.toFixed(1)} · ${p[3]}`,
    pts: st.runs.map((r, i) => [r.start, st.res[i].est, st.res[i].conf, r.name]).filter(p => p[1] && inR(p[0])) });
  series.push({ name: withRuns ? 'Blended VO₂max' : 'VO₂max', kind: withRuns ? 'line' : 'area', color: css('--c1'), w: withRuns ? 2.5 : 2, pts: st.days.filter(d => inR(d.t)).map(d => [d.t, d.vo2]), fmt: v => v.toFixed(1) + ' ml/kg/min' });
  plot(el, { label: 'VO2max over time', xMin, xMax, height, minSpan: 4, series });
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
    const rt = RATE.rate(D.vo2, S.age, S.sex), fa = S.age ? RATE.fitnessAge(D.vo2, S.sex) : null;
    let g = `<div class="big">${f1(D.vo2)}<small>ml/kg/min</small></div>`;
    if (rt) { const b = rt.bounds, lo = Math.floor(b[0] - (b[1] - b[0]) * 1.6), hi = Math.ceil(b[3] + (b[3] - b[2]) * 1.2);
      g = gauge({ label: 'VO2max rating', value: D.vo2, min: lo, max: hi, center: f1(D.vo2), fmt: v => Math.round(v),
        bands: [[lo, b[0]], [b[0], b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], hi]].map(([f, t], k) => [f, t, RATE.names[k], ratingCol(k, 5)]) }); }
    el.innerHTML = `<span class="label">${al('vo2', 'VO₂max')}</span>${g}
      ${rt ? `<span class="chip acc">${al('rating', `${rt.name} for ${S.sex === 'f' ? 'women' : 'men'} ${S.age}`)}</span>` : `<span class="chip">Add age &amp; sex in Profile for a rating</span>`}
      <div class="sub">${fa ? `${al('rating', 'Fitness age')} <b>${fa}</b>${fa < S.age ? ` · ${S.age - fa} years younger` : ''}<br>` : ''}${ago && ago.vo2 ? delta(D.vo2 - ago.vo2, 1, '', 0.05) + '<br>' : ''}Heart-rate model <span class="num">${f1(D.vo2hr)}</span>${D.vo2perf ? ` · race efforts <span class="num">${f1(D.vo2perf)}</span>` : ''}${S.weight ? ` · <span class="num">${(D.vo2 * S.weight / 1000).toFixed(2)}</span> L/min` : ''}</div>`;
  } },
  end: { name: 'Endurance score', desc: 'How long you can hold your aerobic ceiling', size: 'S', render(el) {
    const D = lastDay(), ago = agoDay();
    if (!D.end) { el.innerHTML = `<span class="label">${al('end', 'Endurance score')}</span><p class="sub">Appears once a VO₂max estimate exists.</p>`; return; }
    const lo = 2000, hi = 13000, bands = TIERS.map(([f, n], k) => [Math.max(lo, f), k < TIERS.length - 1 ? TIERS[k + 1][0] : hi, n, ratingCol(k, 7)]);
    el.innerHTML = `<span class="label">${al('end', 'Endurance score')}</span>${gauge({ label: 'Endurance score', value: D.end, min: lo, max: hi, center: f0(D.end), fmt: v => (v / 1000) + 'k', bands })}
      ${ago && ago.end ? `<div class="sub">${delta(D.end - ago.end, 0, '', 20)}</div>` : ''}`;
  } },
  status: { name: 'Training status', desc: 'Form, fitness, fatigue and weekly time', size: 'S', render(el) {
    const D = lastDay(), tsb = D.tsb, s = FF.status(tsb);
    el.innerHTML = `<span class="label">${al('ff', 'Training status')}</span><div class="big">${tsb >= 0 ? '+' : ''}${Math.round(tsb)}<small>form</small></div><span class="chip ${s[1]}"><i></i>${s[0]}</span>
      <dl class="kv"><dt>Fitness (42-day load)</dt><dd>${f0(D.ctl)}</dd><dt>Fatigue (7-day load)</dt><dd>${f0(D.atl)}</dd><dt>Weekly running time</dt><dd>${fmtDur(D.H * 3600)}</dd></dl>`;
  } },
  race: { name: 'Race predictions', desc: '5K to marathon from VO₂max and endurance', size: 'S', render(el) {
    const D = lastDay();
    if (!D.vo2) { el.innerHTML = `<span class="label">${al('race', 'Race predictions')}</span><p class="sub">Appear once a VO₂max estimate exists.</p>`; return; }
    el.innerHTML = `<span class="label">${al('race', 'Race predictions')}</span><dl class="kv">${RACE.predict(D).map(([name, t, dist]) => `<dt>${name}</dt><dd>${fmtDur(t)}<small>${fmtPace(t / (dist / 1000))}/${uName()}</small></dd>`).join('')}</dl><div class="sub">From VO₂max, adjusted for volume and long runs.</div>`;
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
    el.innerHTML = lab + gauge({ label: 'Load ratio', value: L.ratio, min: 0, max: 2, center: L.ratio.toFixed(2) + '×', fmt: v => v.toFixed(1), bands })
      + `<div class="sub"><b>${f0(L.acute)}</b> load in 7 days · optimal ${f0(0.8 * L.chronic)}–${f0(1.3 * L.chronic)}<br>${L.status[2]}</div>`;
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
    const verdict = easy >= 75 ? 'close to the 80/20 balance most coaches aim for' : mod > 25 ? 'a lot of moderate “grey zone” running — make easy days easier' : 'less easy running than the usual 80% target';
    const lab = ZONE.labels;
    el.innerHTML = head('Intensity mix', '<span class="muted sm">Last 4 weeks</span>', 'zones') + `<p class="sub" style="margin:0 0 12px"><b>${easy}%</b> easy · <b>${mod}%</b> moderate · <b>${hard}%</b> hard — ${verdict}.</p>
      <div class="bars">${z.map((s, k) => `<div class="bar-row"><span>${lab[k]}</span><span class="v">${fmtDur(s)} · ${pc(s)}%</span><div class="track"><i style="width:${Math.max(1, s / tot * 100)}%;background:var(--z${k + 1})"></i></div></div>`).join('')}</div>`;
  } },
  drivers: { name: 'What drives your endurance', desc: 'Ceiling, volume, long runs and durability', size: 'M', render(el) { el.innerHTML = head('What drives your endurance', '', 'end') + '<div class="bars"></div>'; renderBreakdown(lastDay(), el.querySelector('.bars')); } },
  records: { name: 'Personal bests', desc: 'Fastest 5K, 10K, half and marathon', size: 'M', render(el) {
    const best = {}; st.runs.forEach((r, i) => { for (const e of st.res[i].efforts) if (e.label !== 'Run' && e.label !== '1 km' && (!best[e.label] || e.sec < best[e.label].e.sec)) best[e.label] = { e, r }; });
    const rows = EFFORTS.map(([, l]) => best[l]).filter(Boolean);
    el.innerHTML = head('Personal bests', '<a class="sm" href="#records">All records →</a>', 'best') + (rows.length ? `<dl class="kv">${rows.map(({ e, r }) => `<dt><a href="#w-${esc(r.id)}" style="color:inherit">${e.label}</a> <span class="muted sm">${fmtDate(r.start, { day: 'numeric', month: 'short', year: '2-digit' })}</span></dt><dd>${fmtDur(e.sec)}<small>${fmtPace(e.sec / (e.D / 1000))}/${uName()}</small></dd>`).join('')}</dl>` : '<p class="empty">Run 5 km or more to set a best.</p>');
  } },
};
const DASH_DEFAULT = ['vo2:S', 'end:S', 'status:S', 'race:S', 'ai:L', 'latest:M', 'vo2chart:M', 'week:S', 'acute:S', 'weekchart:M', 'calendar:M', 'zones:M', 'drivers:M'];
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
  box.innerHTML = items.map(([n, v, f, h]) => `<div class="bar-row"><span>${n}</span><span class="v">${v}</span><div class="track"><i style="width:${Math.max(3, f * 100)}%"></i></div><span class="hint">${h}</span></div>`).join('');
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
  box.querySelectorAll('.w-ctl button').forEach(b => b.onclick = () => {
    const k = +b.closest('.w').dataset.k, c = dashCfg(), a = b.dataset.a;
    if (a === 'up' && k > 0) [c[k - 1], c[k]] = [c[k], c[k - 1]];
    else if (a === 'down' && k < c.length - 1) [c[k + 1], c[k]] = [c[k], c[k + 1]];
    else if (a === 'size') c[k][1] = b.dataset.s;
    else if (a === 'del') c.splice(k, 1);
    saveDash(c); renderOverview();
  });
  const add = $('#dashAdd'), used = new Set(cfg.map(c => c[0])), free = Object.keys(WIDGETS).filter(id => !used.has(id));
  add.hidden = !edit;
  add.innerHTML = edit ? `<div class="card"><div class="ch"><h3>Add cards</h3><span class="muted sm">${free.length ? 'Tap a card to add it at the end' : 'Every card is on your overview'}</span></div>
    <div class="add-list">${free.map(id => `<button type="button" data-id="${id}"><span><b>+ ${WIDGETS[id].name}</b><span>${WIDGETS[id].desc}</span></span></button>`).join('')}</div></div>` : '';
  add.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { const c = dashCfg(); c.push([b.dataset.id, WIDGETS[b.dataset.id].size]); saveDash(c); renderOverview(); });
}
function initDash() {
  $('#dashEdit').onclick = () => { st.dashEdit = !st.dashEdit; renderOverview(); addChartShare(); };
  $('#dashReset').onclick = () => { saveDash(DASH_DEFAULT.map(x => x.split(':'))); renderOverview(); addChartShare(); };
}
// ===== END DASHBOARD =====
