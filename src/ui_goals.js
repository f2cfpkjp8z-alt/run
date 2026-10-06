// ===== GOALS: a running goal (distance at a target pace, optional date) and a weight goal =====
// Saved in settings: goal = { dist (m), pace (s/km), date ('YYYY-MM-DD' or ''), start (s, estimate when set), set (ms) }
//                    wgoal = { kg, start (kg), date, set }; wlog = [[ms, kg], …] — every weight change, newest last.
const GOAL_DISTS = [[5000, '5K'], [10000, '10K'], [21097.5, 'Half marathon'], [42195, 'Marathon']];
const goalName = d => (GOAL_DISTS.find(x => Math.abs(x[0] - d) < 1) || [0, fmtDist(d) + ' ' + uName()])[1];
const goalOn = g => g && g.dist > 0 && g.pace > 0;
const wgoalOn = w => w && w.kg > 0;
const goalDays = date => date ? Math.ceil((new Date(date + 'T23:59:59') - Date.now()) / DAY) : null;
function parsePace(s) { // "6:00", "6", "5:45.5" → seconds per unit
  const p = String(s || '').trim().split(':').map(Number); if (!p.length || p.some(x => !isFinite(x) || x < 0)) return null;
  const sec = p.length === 1 ? p[0] * 60 : p.length === 2 ? p[0] * 60 + p[1] : null; return sec && sec >= 120 && sec <= 1800 ? sec : null;
}
// Where the runner stands for a running goal: only whole runs at least the goal distance count (1% GPS slack),
// judged by their average moving pace. Race predictions are not used.
const goalRuns = (dist, from, to) => st.runs.map((r, i) => [r, st.res[i]]).filter(([r, e]) => r.start >= from && r.start <= to && e.dist >= dist * 0.99 && e.pace > 0);
function goalNow(dist) {
  const pick = rs => rs.reduce((b, [r, e]) => !b || e.pace < b.pace ? { pace: e.pace, dist: e.dist, t: r.start, id: r.id } : b, null);
  const best = pick(goalRuns(dist, st.asOf - 84 * DAY, Infinity)), pr = pick(goalRuns(dist, -Infinity, Infinity));
  const longest = st.runs.reduce((m, r, i) => r.start >= st.asOf - 84 * DAY ? Math.max(m, st.res[i].dist || 0) : m, 0);
  return { best, pr, longest, pace: best ? best.pace : null };
}
// where the bar starts: the median pace of qualifying runs in the 12 weeks before the goal was set
function goalBase(g) {
  const t = g.set || st.asOf, ps = goalRuns(g.dist, t - 84 * DAY, t).map(([, e]) => e.pace).sort((a, b) => a - b);
  return ps.length ? ps[ps.length >> 1] : null;
}
function goalProgress(g) {
  const now = goalNow(g.dist), target = g.pace * g.dist / 1000;
  if (!now.pace) return { now, target, pct: null };
  const base = Math.max(goalBase(g) || now.pace, now.pace);
  const pct = now.pace <= g.pace ? 1 : base > g.pace ? clamp((base - now.pace) / (base - g.pace), 0, 1) : g.pace / now.pace;
  return { now, target, base, pct };
}
function weightProgress(w) {
  const now = st.S.weight, start = w.start || now; if (!now) return { now, pct: null };
  const span = start - w.kg; return { now, start, pct: Math.abs(now - w.kg) < 0.05 ? 1 : span ? clamp((start - now) / span, 0, 1) : 0 };
}
const gbar = (pct, cls) => `<div class="gbar${pct >= 1 ? ' done' : ''}${cls ? ' ' + cls : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((pct || 0) * 100)}"><i style="width:${Math.max(2, (pct || 0) * 100)}%"></i></div>`;
const goalWhen = date => { const d = goalDays(date); return d == null ? '' : d < 0 ? ` · ended ${fmtDate(new Date(date + 'T12:00').getTime())}` : d === 0 ? ' · today' : ` · ${d} day${d > 1 ? 's' : ''} left`; };
// The progress blocks, shared by the overview widget and the Profile card.
function goalBlocks() {
  const S = st.S, g = S.goal, w = S.wgoal, out = [];
  if (goalOn(g)) {
    const P = goalProgress(g), n = P.now, done = P.pct >= 1;
    out.push(`<div class="goal"><div class="goal-h"><span><b>${esc(goalName(g.dist))} in ${fmtDur(P.target)}</b> <span class="muted sm">${fmtPace(g.pace)}/${uName()}${goalWhen(g.date)}</span></span><span class="pct num">${P.pct == null ? '–' : Math.round(P.pct * 100) + '%'}</span></div>
      ${gbar(P.pct, 'run')}
      <div class="gstats">${n.best ? `<span>Best ${esc(goalName(g.dist))}+ run, 12 weeks: <a href="#w-${esc(n.best.id)}">${fmtPace(n.best.pace)}/${uName()}</a> · ${fmtDist(n.best.dist)} ${uName()} · ${fmtDate(n.best.t)}</span><span>${done ? 'On target 🎯' : fmtPace(n.best.pace - g.pace) + '/' + uName() + ' to go'}</span>` : `<span>No run of ${esc(goalName(g.dist))} or longer in the last 12 weeks${n.longest ? ` (longest ${fmtDist(n.longest)} ${uName()})` : ''}.</span>`}</div>
      <div class="gstats">${P.base && P.pct < 1 ? `<span>Bar starts at ${fmtPace(P.base)}/${uName()}, your typical pace on these runs when you set the goal</span>` : ''}${n.pr && (!n.best || n.pr.id !== n.best.id) ? `<span>Fastest ever: <a href="#w-${esc(n.pr.id)}">${fmtPace(n.pr.pace)}/${uName()}</a></span>` : ''}</div></div>`);
  }
  if (wgoalOn(w)) {
    const P = weightProgress(w), left = P.now ? P.now - w.kg : null;
    out.push(`<div class="goal"><div class="goal-h"><span><b>Weight ${f1(w.kg)} kg</b><span class="muted sm">${goalWhen(w.date).replace(' · ', ' ')}</span></span><span class="pct num">${P.pct == null ? '–' : Math.round(P.pct * 100) + '%'}</span></div>
      ${gbar(P.pct, 'wt')}
      <div class="gstats">${P.now ? `<span>From ${f1(P.start)} · now ${f1(P.now)} kg</span><span>${P.pct >= 1 ? 'Reached 🎯' : f1(Math.abs(left)) + ' kg to ' + (left > 0 ? 'lose' : 'gain')}</span>` : '<span>Enter your current weight.</span>'}</div></div>`);
  }
  return out.join('');
}
function setWeight(kg) { // keeps a log of weight changes for the trend and the AI coach
  const S = st.S; if (kg && kg !== S.weight) { S.wlog = (S.wlog || []).concat([[Date.now(), kg]]).slice(-100); } S.weight = kg;
}

/* ---------- Profile card ---------- */
function renderGoals() {
  const S = st.S, g = goalOn(S.goal) ? S.goal : null, w = wgoalOn(S.wgoal) ? S.wgoal : null, u = uName();
  const std = g ? GOAL_DISTS.find(x => Math.abs(x[0] - g.dist) < 1) : GOAL_DISTS[1];
  $('#goalCard').innerHTML = `<div class="ch"><h3>Goals</h3><span class="muted sm">The AI coach plans around them</span></div>
    <div class="goals" id="goalNow">${goalBlocks() || '<p class="muted sm">No goal yet. Set a race goal, a weight goal or both.</p>'}</div>
    <form id="goalForm" autocomplete="off">
      <p class="eyebrow" style="margin-top:16px">Running goal</p>
      <p class="muted sm help" style="margin:0 0 8px">Only runs at least this long count, by their average pace. The bar runs from your typical pace on such runs (12 weeks before you set the goal) to the target.</p>
      <div class="form">
        <label for="gDist">Distance<select id="gDist">${GOAL_DISTS.map(([d, n]) => `<option value="${d}"${std && std[0] === d ? ' selected' : ''}>${n}</option>`).join('')}<option value="c"${g && !std ? ' selected' : ''}>Other distance</option></select></label>
        <label for="gCustom" id="gCustomL"${g && !std ? '' : ' hidden'}>Distance (${u})<input id="gCustom" type="number" min="0.4" max="250" step="0.01" inputmode="decimal" value="${g && !std ? (g.dist / U()).toFixed(2) : ''}"></label>
        <label for="gPace">Target pace (min/${u})<input id="gPace" placeholder="6:00" inputmode="decimal" value="${g ? fmtPace(g.pace) : ''}"><span class="hint" id="gPaceHint">Empty = no running goal.</span></label>
        <label for="gDate">Race or target date<input id="gDate" type="date" value="${esc(g && g.date || '')}"><span class="hint">Optional.</span></label>
      </div>
      <p class="eyebrow" style="margin-top:16px">Weight goal</p>
      <div class="form">
        <label for="gW">Current weight (kg)<input id="gW" type="number" min="30" max="200" step="0.1" inputmode="decimal" value="${S.weight || ''}"><span class="hint">Update it here to move the bar.</span></label>
        <label for="gWt">Target weight (kg)<input id="gWt" type="number" min="30" max="200" step="0.1" inputmode="decimal" value="${w ? w.kg : ''}"><span class="hint">Empty = no weight goal.</span></label>
        <label for="gWs">Starting weight (kg)<input id="gWs" type="number" min="30" max="200" step="0.1" inputmode="decimal" value="${w && w.start ? w.start : ''}" placeholder="${S.weight || ''}"><span class="hint">Where the bar starts. Empty = current.</span></label>
        <label for="gWd">Target date<input id="gWd" type="date" value="${esc(w && w.date || '')}"><span class="hint">Optional.</span></label>
      </div>
      <div class="foot"><span class="muted sm" id="goalSaved">${st.user ? '' : 'Guest goals are not saved.'}</span><button type="submit" class="primary">Save goals</button></div>
    </form>`;
  const dist = () => { const v = $('#gDist').value; return v === 'c' ? (parseFloat($('#gCustom').value) || 0) * U() : +v; };
  const hint = () => { const p = parsePace($('#gPace').value), d = dist();
    $('#gPaceHint').textContent = !$('#gPace').value.trim() ? 'Empty = no running goal.' : p && d ? `Finish time ${fmtDur(p * d / U())}.` : 'Use min:sec, e.g. 6:00.'; };
  $('#gDist').onchange = () => { $('#gCustomL').hidden = $('#gDist').value !== 'c'; hint(); };
  $('#gPace').oninput = hint; $('#gCustom').oninput = hint; hint();
  $('#goalForm').onsubmit = async ev => {
    ev.preventDefault();
    const num = id => { const x = parseFloat($(id).value); return isFinite(x) && x > 0 ? x : null; };
    const p = parsePace($('#gPace').value), d = dist();
    if ($('#gPace').value.trim() && !p) { $('#goalSaved').textContent = 'Pace looks off — use min:sec, e.g. 6:00.'; return; }
    if (p && !(d >= 400)) { $('#goalSaved').textContent = 'Enter the goal distance.'; return; }
    let goal = null;
    if (p) { const pace = p * 1000 / U(), old = S.goal, same = old && Math.abs(old.dist - d) < 1 && Math.abs(old.pace - pace) < 0.5;
      goal = { dist: d, pace, date: $('#gDate').value, set: same ? old.set : Date.now() }; }
    setWeight(num('#gW'));
    const kg = num('#gWt'), wold = S.wgoal;
    const wgoal = kg ? { kg, start: num('#gWs') || (wold && wold.kg === kg && wold.start) || S.weight, date: $('#gWd').value, set: wold && wold.kg === kg ? wold.set : Date.now() } : null;
    Object.assign(S, { goal, wgoal });
    const settings = { goal, wgoal, weight: S.weight, wlog: S.wlog || [] };
    if (st.user) { try { st.user = await st.backend.updateProfile({ settings }); } catch (e) { $('#goalSaved').textContent = 'Could not save: ' + e.message; return; } }
    renderGoals(); $('#fWeight').value = S.weight || ''; $('#goalSaved').textContent = st.user ? 'Saved.' : 'Guest goals are not saved.';
  };
}
// links with data-goto="<id>" open their page, then scroll to that card
document.addEventListener('click', ev => { const a = ev.target.closest('a[data-goto]'); if (a) setTimeout(() => { const c = document.getElementById(a.dataset.goto); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); });
// ===== END GOALS =====
