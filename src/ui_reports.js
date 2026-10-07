// ===== REPORTS: Garmin-style hub (#reports) and all-day report pages (#r-<key>) with a day view and 7 days / 4 weeks / Year =====
// Data: users/{uid}/daily/{YYYY-MM-DD} through normDaily (hrP / stressP / bbP are [ms, value] samples, sleep holds the stage seconds).
const R_ICON = {
  hr: '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/>',
  sleep: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  stress: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  bb: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  steps: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  weight: '<path d="M5 4h14l2 16H3z"/><path d="M9 9a3 3 0 0 1 6 0"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  run: '<path d="M3 17l5-6 4 3 6-8"/><path d="M3 21h18"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  cup: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 20h8"/>',
};
const R_KEYS = {
  hr: { title: 'Heart rate', color: '--rhr', has: d => d.hrP.length || d.rhr != null },
  sleep: { title: 'Sleep', color: '--end', has: d => !!d.sleep },
  stress: { title: 'Stress', color: '--stress', has: d => d.stressP.length || d.stress != null },
  bb: { title: 'Body battery', color: '--bb', has: d => d.bbP.length || d.bbHigh != null },
  steps: { title: 'Steps', color: '--dist', has: d => d.steps != null },
  weight: { title: 'Weight', color: '--accent', noDay: true, has: () => false },
};
const R_HUB = [
  ['Health stats', [['hr', 'Heart rate', 'Resting, minimum and maximum through the day'], ['sleep', 'Sleep', 'Duration, stages and score'], ['stress', 'Stress', 'All-day stress level'],
    ['bb', 'Body battery', 'Energy charge and drain'], ['steps', 'Steps', 'Daily steps against your goal'], ['weight', 'Weight', 'Weight log and goal progress']]],
  ['Training', [['m-vo2', 'VO₂max', 'Aerobic ceiling and rating', 'chart'], ['m-end', 'Endurance score', 'How long you can hold your ceiling', 'chart'], ['m-ff', 'Fitness & form', 'Fitness, fatigue and form', 'chart'],
    ['m-load', 'Training load', 'Acute and chronic load', 'chart'], ['m-zones', 'Intensity mix', 'Time in each heart-rate zone', 'chart'], ['m-ef', 'Aerobic efficiency', 'Metres per heartbeat', 'chart'], ['m-race', 'Race predictions', '5K to marathon', 'chart']]],
  ['Activities', [['m-dist', 'Distance', 'Weekly and daily running distance', 'run'], ['workouts', 'Workouts', 'Every imported run', 'list'], ['records', 'Records', 'Personal bests', 'cup']]],
];
const hh = h => String(Math.floor(h)).padStart(2, '0') + ':00';
const hhmm = h => { const m = Math.round(h * 60); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const latestWith = f => { for (let i = st.daily.length - 1; i >= 0; i--) if (f(st.daily[i])) return st.daily[i]; return null; };
const dayDoc = t => st.daily.find(d => d.t === t) || null;
const isoDay = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const hm = s => s == null ? '–' : `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m`;
const clock = ms => ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–';
const SLEEP_STAGES = [['deepSleepSeconds', 'Deep', 'var(--end)'], ['lightSleepSeconds', 'Light', 'var(--fit)'], ['remSleepSeconds', 'REM', 'var(--race)'], ['awakeSleepSeconds', 'Awake', 'var(--warn, #ffb020)']];
const dayLabel = t => { const T = dayStart(Date.now()); return t === T ? 'Today' : t === dayStart(T - DAY / 2) ? 'Yesterday' : fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' }); };

/* ---------- small shared pieces ---------- */
function ringSvg(frac, color, centre, sub, size = 140) {
  const r = 52, c = 2 * Math.PI * r, f = clamp(frac || 0, 0, 1);
  return `<svg class="ring" viewBox="0 0 140 140" width="${size}" height="${size}" role="img" aria-label="${esc(centre)} ${esc(sub)}"><circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="13"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 70 70)"/>
    <text x="70" y="70" text-anchor="middle" font-size="25" font-weight="700" fill="var(--ink)" font-family="var(--display)">${esc(centre)}</text><text x="70" y="90" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(sub)}</text></svg>`;
}
function stageBar(sl) {
  const parts = SLEEP_STAGES.map(([k, n, c]) => [n, c, +sl[k] || 0]), tot = parts.reduce((s, p) => s + p[2], 0) || 1;
  return `<div class="stagebar" role="img" aria-label="Sleep stages">${parts.filter(p => p[2] > 0).map(([n, c, s]) => `<i style="width:${s / tot * 100}%;background:${c}" title="${n} ${hm(s)}"></i>`).join('')}</div>
    <div class="stagelist">${parts.map(([n, c, s]) => `<span><i style="background:${c}"></i>${n} <b>${hm(s)}</b> <small>${Math.round(s / tot * 100)}%</small></span>`).join('')}</div>`;
}

/* ---------- one-day charts (also used by the overview cards) ---------- */
function intradayPlot(el, key, d, height) {
  const hrs = ps => ps.map(p => [(p[0] - d.t) / 3600000, p[1]]).filter(p => p[0] >= -0.05 && p[0] <= 24.05);
  const o = { xMin: 0, xMax: 24, xTime: false, xTicks: [0, 6, 12, 18, 24], xFmt: hh, tipX: hhmm, height, empty: 'No data for this day.' };
  if (key === 'hr') {
    const s = [{ name: 'Heart rate', kind: 'line', color: css('--rhr'), w: 2, pts: hrs(d.hrP), fmt: v => Math.round(v) + ' bpm' }];
    if (d.rhr != null) s.push({ name: 'Resting', kind: 'line', color: css('--rhr'), op: .5, dash: true, w: 1.5, end: false, pts: [[0, d.rhr], [24, d.rhr]], fmt: v => Math.round(v) + ' bpm' });
    plot(el, { ...o, label: 'Heart rate', minSpan: 40, series: s });
  } else if (key === 'stress') {
    plot(el, { ...o, label: 'Stress', zero: true, yMax: 100, series: [{ name: 'Stress', kind: 'area', color: css('--stress'), w: 2, pts: hrs(d.stressP), fmt: v => Math.round(v) }] });
  } else if (key === 'bb') {
    plot(el, { ...o, label: 'Body battery', zero: true, yMax: 100, series: [{ name: 'Body battery', kind: 'area', color: css('--bb'), w: 2.5, pts: hrs(d.bbP), fmt: v => Math.round(v) }] });
  }
}

/* ---------- range charts ---------- */
function rPeriod() {
  const t1 = dayStart(Date.now()), n = +st.rMode || 7, t0 = dayStart(t1 - (n - 1) * DAY + DAY / 2);
  return { t0, t1, n, xMin: t0 - DAY / 2, xMax: t1 + DAY / 2, D: st.daily.filter(d => d.t >= t0 && d.t <= t1) };
}
const dayPts = (P, f) => P.D.map(d => [d.t, f(d)]);
function weightLog() { const S = st.S, l = (S.wlog || []).map(p => [+p[0], +p[1]]).filter(p => isFinite(p[0]) && p[1] > 0); if (!l.length && S.weight) l.push([Date.now(), +S.weight]); return l; }

/* ---------- report page ---------- */
function rBody(key, mode, P, d) { // returns {html, draw}
  const stats = a => `<div class="stats">${a.join('')}</div>`, bar = P && P.n > 60 ? 'line' : 'bars';
  if (mode === 'day') {
    if (!d || !R_KEYS[key].has(d)) return { html: '<p class="empty">No data for this day. Use ‹ › to find a day with data.</p>' };
    if (key === 'hr') { const v = d.hrP.map(p => p[1]);
      return { html: stats([mStat('Resting', f0(d.rhr), 'bpm'), mStat('Maximum', f0(d.maxHR || (v.length ? Math.max(...v) : null)), 'bpm'), mStat('Minimum', v.length ? f0(Math.min(...v)) : '–', 'bpm'), mStat('Average', v.length ? f0(mean(v)) : '–', 'bpm')]) + mCard('Heart rate through the day', 'rc1', 'Dashed line is your resting heart rate.'),
        draw: () => intradayPlot($('#rc1'), 'hr', d, 240) }; }
    if (key === 'stress') { const v = d.stressP.map(p => p[1]), sh = (a, b) => v.length ? Math.round(v.filter(x => x >= a && x < b).length / v.length * 100) + '%' : '–';
      return { html: stats([mStat('Average', f0(d.stress)), mStat('Highest', f0(d.stressMax)), mStat('Resting', sh(0, 26)), mStat('Low', sh(26, 51)), mStat('Medium', sh(51, 76)), mStat('High', sh(76, 101))]) + mCard('Stress through the day', 'rc1', 'Garmin stress score, 0–100. Lower is calmer.'),
        draw: () => intradayPlot($('#rc1'), 'stress', d, 240) }; }
    if (key === 'bb') { const v = d.bbP.map(p => p[1]);
      return { html: stats([mStat('Highest', f0(d.bbHigh)), mStat('Lowest', f0(d.bbLow)), mStat('Latest', v.length ? f0(v[v.length - 1]) : '–'), mStat('Drained', v.length ? f0(Math.max(0, v.reduce((s, x, i) => i && x < v[i - 1] ? s + v[i - 1] - x : s, 0))) : '–')]) + mCard('Body battery through the day', 'rc1', 'Charges while you rest, drains with activity and stress.'),
        draw: () => intradayPlot($('#rc1'), 'bb', d, 240) }; }
    if (key === 'sleep') { const s = d.sleep;
      return { html: stats([mStat('Duration', hm(s.sleepTimeSeconds)), mStat('Score', f0(d.sleepScore)), mStat('Bedtime', clock(s.sleepStartTimestampGMT)), mStat('Wake-up', clock(s.sleepEndTimestampGMT))]) + `<div class="card"><h3>Sleep stages</h3>${stageBar(s)}</div>` }; }
    if (key === 'steps') { const g = d.stepGoal || 10000;
      return { html: `<div class="card ringcard">${ringSvg(d.steps / g, css('--dist'), f0(d.steps), 'steps', 170)}<div class="ringtxt"><b>${Math.round(d.steps / g * 100)}%</b> of your ${f0(g)} step goal<br><span class="muted">${d.steps >= g ? 'Goal reached 🎯' : f0(g - d.steps) + ' to go'}</span></div></div>` }; }
  }
  // ---- ranges ----
  const D = P.D; if (key !== 'weight' && !D.some(R_KEYS[key].has)) return { html: '<p class="empty">No all-day data in this period.</p>' };
  const axis = { xMin: P.xMin, xMax: P.xMax, empty: 'No data in this period.' };
  if (key === 'hr') { const r = D.map(x => x.rhr).filter(Boolean);
    return { html: stats([mStat('Average resting', r.length ? f0(mean(r)) : '–', 'bpm'), mStat('Lowest resting', r.length ? f0(Math.min(...r)) : '–', 'bpm'), mStat('Highest', f0(Math.max(0, ...D.map(x => x.maxHR || 0))), 'bpm')]) + mCard('Heart rate by day', 'rc1', 'Resting and maximum heart rate for each day.'),
      draw: () => plot($('#rc1'), { ...axis, label: 'Heart rate', minSpan: 20, series: [{ name: 'Maximum', kind: 'line', color: css('--rhr'), op: .55, w: 2, pts: dayPts(P, x => x.maxHR), fmt: v => Math.round(v) + ' bpm' }, { name: 'Resting', kind: 'line', color: css('--rhr'), w: 2.5, pts: dayPts(P, x => x.rhr), fmt: v => Math.round(v) + ' bpm' }] }) }; }
  if (key === 'stress') { const v = D.map(x => x.stress).filter(x => x != null);
    return { html: stats([mStat('Average', v.length ? f0(mean(v)) : '–'), mStat('Calmest day', v.length ? f0(Math.min(...v)) : '–'), mStat('Highest peak', f0(Math.max(0, ...D.map(x => x.stressMax || 0))))]) + mCard('Stress by day', 'rc1', 'Average stress (bars) and the day’s peak (line).'),
      draw: () => plot($('#rc1'), { ...axis, label: 'Stress', zero: true, yMax: 100, series: [{ name: 'Average', kind: bar, bw: DAY, color: css('--stress'), w: 2.5, pts: dayPts(P, x => x.stress), fmt: v => Math.round(v) }, { name: 'Peak', kind: 'line', color: css('--stress'), op: .5, w: 1.5, end: false, pts: dayPts(P, x => x.stressMax), fmt: v => Math.round(v) }] }) }; }
  if (key === 'bb') { const hi = D.map(x => x.bbHigh).filter(x => x != null), lo = D.map(x => x.bbLow).filter(x => x != null);
    return { html: stats([mStat('Average high', hi.length ? f0(mean(hi)) : '–'), mStat('Average low', lo.length ? f0(mean(lo)) : '–'), mStat('Best day', hi.length ? f0(Math.max(...hi)) : '–')]) + mCard('Body battery by day', 'rc1', 'Highest and lowest charge each day.'),
      draw: () => plot($('#rc1'), { ...axis, label: 'Body battery', zero: true, yMax: 100, series: [{ name: 'Highest', kind: 'line', color: css('--bb'), w: 2.5, pts: dayPts(P, x => x.bbHigh), fmt: v => Math.round(v) }, { name: 'Lowest', kind: 'line', color: css('--bb'), op: .5, pts: dayPts(P, x => x.bbLow), fmt: v => Math.round(v) }] }) }; }
  if (key === 'sleep') { const s = D.filter(x => x.sleep), sc = D.map(x => x.sleepScore).filter(x => x != null);
    return { html: stats([mStat('Average sleep', s.length ? hm(mean(s.map(x => x.sleep.sleepTimeSeconds))) : '–'), mStat('Average score', sc.length ? f0(mean(sc)) : '–'), mStat('Best night', s.length ? hm(Math.max(...s.map(x => x.sleep.sleepTimeSeconds))) : '–')]) + `<div class="wd-grid">${mCard('Sleep duration', 'rc1', 'Hours asleep each night.')}${mCard('Sleep score', 'rc2', 'Garmin’s 0–100 score.')}</div>`,
      draw: () => { plot($('#rc1'), { ...axis, label: 'Sleep duration', zero: true, series: [{ name: 'Sleep', kind: bar, bw: DAY, color: css('--end'), w: 2.5, pts: dayPts(P, x => x.sleep ? x.sleep.sleepTimeSeconds / 3600 : null), fmt: v => hm(v * 3600) }] });
        plot($('#rc2'), { ...axis, label: 'Sleep score', yMax: 100, minSpan: 20, series: [{ name: 'Score', kind: 'line', color: css('--end'), w: 2.5, pts: dayPts(P, x => x.sleepScore), fmt: v => Math.round(v) }] }); } }; }
  if (key === 'steps') { const v = D.map(x => x.steps).filter(x => x != null), hit = D.filter(x => x.steps != null && x.stepGoal && x.steps >= x.stepGoal).length;
    return { html: stats([mStat('Daily average', v.length ? f0(mean(v)) : '–'), mStat('Total', f0(v.reduce((a, b) => a + b, 0))), mStat('Goal reached', `${hit}/${v.length}`, 'days')]) + mCard('Steps by day', 'rc1', 'Dashed line is your daily goal.'),
      draw: () => plot($('#rc1'), { ...axis, label: 'Steps', zero: true, series: [{ name: 'Steps', kind: bar, bw: DAY, color: css('--dist'), w: 2.5, pts: dayPts(P, x => x.steps), fmt: v => f0(v) }, { name: 'Goal', kind: 'line', color: css('--ink2'), dash: true, w: 1.5, end: false, pts: dayPts(P, x => x.stepGoal), fmt: v => f0(v) }] }) }; }
  if (key === 'weight') { const all = weightLog(), inP = all.filter(p => p[0] >= P.t0 - DAY && p[0] <= P.t1 + DAY), last = all.length ? all[all.length - 1][1] : null, w = st.S.wgoal, wp = wgoalOn(w) ? weightProgress(w) : null;
    const ch = inP.length > 1 ? inP[inP.length - 1][1] - inP[0][1] : null;
    return { html: stats([mStat('Current', last ? f1(last) : '–', 'kg'), mStat('Change', ch == null ? '–' : (ch > 0 ? '+' : '−') + Math.abs(ch).toFixed(1), 'kg'), mStat('Goal', wgoalOn(w) ? f1(w.kg) : '–', 'kg')])
      + (wp ? `<div class="card"><h3>Goal progress</h3><div class="goal-h"><span class="muted sm">From ${f1(wp.start)} · now ${f1(wp.now)} kg</span><span class="pct num">${Math.round(wp.pct * 100)}%</span></div>${gbar(wp.pct, 'wt')}</div>` : '')
      + mCard('Weight', 'rc1', all.length > 1 ? '' : 'Log your weight in Profile → Goals to build a trend.'),
      draw: () => plot($('#rc1'), { ...axis, label: 'Weight', minSpan: 2, empty: 'No weight logged in this period.', series: [{ name: 'Weight', kind: 'line', color: css('--accent'), w: 2.5, pts: inP, fmt: v => f1(v) + ' kg' }].concat(wgoalOn(w) ? [{ name: 'Goal', kind: 'line', color: css('--ink2'), dash: true, w: 1.5, end: false, pts: [[P.xMin, w.kg], [P.xMax, w.kg]], fmt: v => f1(v) + ' kg' }] : []) }) }; }
  return { html: '' };
}
function renderReport(key) {
  const box = $('#v-report'), R = R_KEYS[key];
  if (!R) { location.hash = '#reports'; return; }
  if (R.noDay && st.rMode === 'day') st.rMode = 365;
  if (st.rDay == null) st.rDay = Math.min(dayStart(Date.now()), (latestWith(R.has) || { t: dayStart(Date.now()) }).t);
  const mode = st.rMode || 'day', today = dayStart(Date.now()), opts = [...(R.noDay ? [] : [['day', 'Today']]), ...M_RANGES];
  const seg = `<div class="seg" role="group" aria-label="Period">${opts.map(([n, l]) => `<button type="button" data-r="${n}" aria-pressed="${mode == n}">${l}</button>`).join('')}</div>`;
  let nav = '', body;
  if (mode === 'day') {
    nav = `<div class="daynav"><button type="button" data-d="-1" aria-label="Previous day">‹</button><span class="dlabel">${esc(dayLabel(st.rDay))}</span><input type="date" value="${isoDay(st.rDay)}" max="${isoDay(today)}" aria-label="Pick a day"><button type="button" data-d="1" aria-label="Next day"${st.rDay >= today ? ' disabled' : ''}>›</button></div>`;
    body = rBody(key, 'day', null, dayDoc(st.rDay));
  } else {
    const P = rPeriod(); nav = `<p class="muted sm" style="margin:-6px 0 12px">${fmtDate(P.t0, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(P.t1, { day: 'numeric', month: 'short', year: 'numeric' })}</p>`;
    body = rBody(key, 'range', P, null);
  }
  box.innerHTML = `<a class="btn back ghost" href="#reports">← Reports</a><div class="vh"><h2>${R.title}</h2>${seg}</div>${nav}${body.html}`;
  box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { st.rMode = b.dataset.r === 'day' ? 'day' : +b.dataset.r; renderReport(key); });
  box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const t = +b.dataset.d > 0 ? dayStart(st.rDay + DAY * 1.5) : dayStart(st.rDay - DAY / 2); st.rDay = Math.min(t, today); renderReport(key); });
  const di = box.querySelector('.daynav input'); if (di) di.onchange = () => { if (di.value) { st.rDay = Math.min(dayStart(new Date(di.value + 'T12:00').getTime()), today); renderReport(key); } };
  if (body.draw) requestAnimationFrame(() => body.draw());
}

/* ---------- hub ---------- */
function rValue(key) {
  const d = latestWith(R_KEYS[key] ? R_KEYS[key].has : () => false), u = x => `<small>${x}</small>`;
  if (key === 'weight') { const l = weightLog(); return l.length ? f1(l[l.length - 1][1]) + u('kg') : '–'; }
  if (!d) return '–';
  if (key === 'hr') return d.rhr != null ? f0(d.rhr) + u('bpm') : '–';
  if (key === 'sleep') return hm(d.sleep.sleepTimeSeconds);
  if (key === 'stress') return d.stress != null ? f0(d.stress) : '–';
  if (key === 'bb') return d.bbHigh != null ? f0(d.bbHigh) : '–';
  if (key === 'steps') return f0(d.steps);
  return '–';
}
function renderReports() {
  const box = $('#v-reports');
  box.innerHTML = `<div class="vh"><h2>Reports</h2></div>${online() || st.daily.length ? '' : '<p class="muted sm" style="margin:0 0 12px">All-day health stats need your online account and the Garmin export job.</p>'}
    <div class="rhub">${R_HUB.map(([cat, rows]) => `<section class="rcat"><h3>${cat}</h3><div class="rlist">${rows.map(([k, name, sub, ic]) => {
      const health = !!R_KEYS[k], href = health ? '#r-' + k : '#' + k, col = health ? `var(${R_KEYS[k].color})` : 'var(--accent)';
      return `<a class="rrow" href="${href}"><span class="ric" style="--c:${col}"><svg viewBox="0 0 24 24" aria-hidden="true">${R_ICON[health ? k : ic]}</svg></span><span class="rt"><b>${name}</b><small>${sub}</small></span>${health ? `<span class="rv">${rValue(k)}</span>` : ''}<span class="chev" aria-hidden="true">›</span></a>`; }).join('')}</div></section>`).join('')}</div>`;
}

/* ---------- overview cards for the all-day data ---------- */
function dailyWidget(el, key, size) {
  const R = R_KEYS[key], d = latestWith(R.has), big = size === 'S' ? 110 : 150;
  const h = (extra = '') => head(R.title, `<span class="muted sm">${d ? dayLabel(d.t) : ''}</span>${extra}`);
  if (!d) { el.innerHTML = head(R.title) + '<p class="sub">No all-day data yet. It appears once the Garmin export job has written your days.</p>'; return; }
  if (key === 'sleep') {
    const s = d.sleep; el.innerHTML = h() + `<div class="big">${hm(s.sleepTimeSeconds)}${d.sleepScore != null ? `<small>score ${f0(d.sleepScore)}</small>` : ''}</div>${stageBar(s)}`;
    if (size !== 'S') { el.insertAdjacentHTML('beforeend', '<div class="plot" style="margin-top:12px"></div>'); const P = { t0: dayStart(d.t - 6 * DAY), t1: d.t, n: 7, xMin: dayStart(d.t - 6 * DAY) - DAY / 2, xMax: d.t + DAY / 2, D: st.daily.filter(x => x.t > d.t - 7 * DAY && x.t <= d.t) };
      plot(el.querySelector('.plot'), { label: 'Sleep, last 7 nights', xMin: P.xMin, xMax: P.xMax, zero: true, height: 130, series: [{ name: 'Sleep', kind: 'bars', bw: DAY, color: css('--end'), pts: dayPts(P, x => x.sleep ? x.sleep.sleepTimeSeconds / 3600 : null), fmt: v => hm(v * 3600) }] }); }
    return;
  }
  const v = key === 'hr' ? [d.rhr, 'bpm resting'] : key === 'stress' ? [d.stress, 'avg'] : [d.bbHigh, `high · low ${f0(d.bbLow)}`];
  el.innerHTML = h() + `<div class="big">${f0(v[0])}<small>${v[1]}</small></div><div class="plot"></div>`;
  intradayPlot(el.querySelector('.plot'), key, d, big);
}
function stepsWidget(el, size) {
  const d = latestWith(R_KEYS.steps.has);
  if (!d) { el.innerHTML = head('Steps') + '<p class="sub">No all-day data yet. It appears once the Garmin export job has written your days.</p>'; return; }
  const g = d.stepGoal || 10000, wk = st.daily.filter(x => x.steps != null && x.t > d.t - 7 * DAY && x.t <= d.t);
  el.innerHTML = head('Steps', `<span class="muted sm">${dayLabel(d.t)}</span>`) + `<div class="ringcard">${ringSvg(d.steps / g, css('--dist'), f0(d.steps), 'of ' + f0(g), size === 'S' ? 120 : 150)}<div class="ringtxt"><b>${Math.round(d.steps / g * 100)}%</b> of goal<br><span class="muted">7-day average ${f0(mean(wk.map(x => x.steps)))}</span></div></div>`;
}
function weightWidget(el) {
  const l = weightLog(), w = st.S.wgoal, wp = wgoalOn(w) ? weightProgress(w) : null;
  if (!l.length) { el.innerHTML = head('Weight', '<a class="sm" href="#profile" data-goto="goalCard">Set weight →</a>') + '<p class="sub">Add your weight in Profile → Goals to follow it here.</p>'; return; }
  const now = l[l.length - 1][1], prev = l.length > 1 ? l[l.length - 2][1] : null;
  el.innerHTML = head('Weight', `<span class="muted sm">${fmtDate(l[l.length - 1][0])}</span>`) + `<div class="big">${f1(now)}<small>kg</small></div>
    ${wp ? `<div class="goal-h" style="margin-top:10px"><span class="muted sm">Goal ${f1(w.kg)} kg${goalWhen(w.date)}</span><span class="pct num">${Math.round(wp.pct * 100)}%</span></div>${gbar(wp.pct, 'wt')}<div class="gstats"><span>From ${f1(wp.start)} · ${wp.pct >= 1 ? 'Reached 🎯' : f1(Math.abs(now - w.kg)) + ' kg to ' + (now > w.kg ? 'lose' : 'gain')}</span></div>`
      : `<div class="sub">${prev != null ? `<span class="${now <= prev ? 'delta-up' : 'delta-down'}">${now >= prev ? '▲' : '▼'} ${f1(Math.abs(now - prev))} kg</span> since the last entry` : 'No goal set. <a href="#profile" data-goto="goalCard">Set one →</a>'}</div>`}`;
}
