// ===== APP =====
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const st = { backend: null, user: null, guest: true, sample: true, runs: [], daily: [], S: Object.assign({}, DEFAULT_SETTINGS), res: [], days: [], asOf: Date.now(),
  range: 182, shown: 30, view: 'overview', detail: null, q: '', yr: 'all', sort: 'new', mapMode: 'pace', pending: null, authMode: 'in' };

const VIEWS = [
  ['overview', 'Overview', '<path d="M3 12h4l3-8 4 16 3-8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'],
  ['workouts', 'Workouts', '<path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'],
  ['feed', 'Feed', '<circle cx="5.5" cy="18.5" r="1.8" fill="currentColor"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'],
  ['trends', 'Trends', '<path d="M3 20h18M5 16l4-5 4 3 6-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'],
  ['records', 'Records', '<path d="M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 20h8M16 6h3v2a3 3 0 0 1-3 3M8 6H5v2a3 3 0 0 0 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'],
  ['profile', 'Profile', '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'],
];
$('#tabs').innerHTML = VIEWS.map(([k, l]) => `<a href="#${k}" data-v="${k}">${l}</a>`).join('');
$('#bnav').innerHTML = VIEWS.map(([k, l, ic]) => `<a href="#${k}" data-v="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${l}</a>`).join('');

/* ---------- compute ---------- */
function compute() {
  const runs = st.runs.sort((a, b) => a.start - b.start), S = st.S;
  const hm = HRMAX.detect(runs, S.age, S.hrMax); // HRMAXalg
  st.hm = hm; st.detectedMax = hm.detected; st.ageMax = hm.ageMax; S.hrMaxEff = hm.eff;
  S.hrRest = S.hrRest || 55;
  if (!runs.length) { st.res = []; st.days = []; return; }
  const last = runs[runs.length - 1].start;
  st.asOf = Date.now() - last < 14 * DAY ? Date.now() : last;
  const sig = anSig(S), dirty = [];
  st.res = runs.map(r => analyzed(r, S, 45, sig, dirty, !!(r.hasHR || r.avgHR)));
  st.days = buildTimeline(runs, st.res, st.asOf);
  const ref = st.days[st.days.length - 1].vo2 || 45; let changed = false;
  runs.forEach((r, i) => { if (!(r.hasHR || r.avgHR)) { st.res[i] = analyzed(r, S, ref, sig, dirty, true); changed = true; } });
  if (changed) st.days = buildTimeline(runs, st.res, st.asOf);
  st.idx = new Map(runs.map((r, i) => [r.id, i]));
  if (dirty.length && st.user && !st.sample) saveAnalysisSoon(dirty);
}
/* ---------- saved analysis: each workout keeps its computed results (r.an) with the key they were made with ---------- */
// The key holds every algorithm version and every setting analyze() reads, so results are reused on every page
// load and recomputed only when a new algorithm version ships or max HR / resting HR / sex changes.
const anSig = S => Object.values(ALGOS).map(a => a.id).join(',') + '|' + [S.hrMaxEff, S.hrRest, S.sex].join(',');
const anFix = (k, v) => typeof v === 'number' && !isFinite(v) ? { __n: String(v) } : v; // JSON has no NaN/Infinity
const anRev = (k, v) => v && typeof v === 'object' && v.__n !== undefined && Object.keys(v).length === 1 ? Number(v.__n) : v;
const anMem = new WeakMap(); // parsed results, kept out of the stored row
function analyzed(r, S, ref, sig, dirty, keep) {
  const key = sig + '|' + ref, m = anMem.get(r);
  if (r.an && r.an.k === key) {
    if (m && m.k === key) return m.res;
    try { const res = JSON.parse(r.an.j, anRev); anMem.set(r, { k: key, res }); return res; } catch (e) { }
  }
  const res = analyze(r, S, ref);
  if (keep) { r.an = { k: key, j: JSON.stringify(res, anFix) }; anMem.set(r, { k: key, res }); if (!dirty.includes(r)) dirty.push(r); }
  return res;
}
let anTimer = null, anQueue = new Set();
function saveAnalysisSoon(list) {
  list.forEach(r => anQueue.add(r)); clearTimeout(anTimer);
  anTimer = setTimeout(async () => {
    const rows = [...anQueue].filter(r => st.runs.includes(r)); anQueue.clear();
    if (!rows.length || !st.user) return;
    try { await st.backend.saveAnalysis(rows); } catch (e) { console.warn('Could not save computed results', e); }
  }, 1500);
}
const dayAt = t => { const d = st.days; if (!d.length) return null; let lo = 0, hi = d.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (d[m].t <= t) lo = m; else hi = m - 1; } return d[lo]; };

/* ---------- session ---------- */
function setShell(app) { $('#auth').hidden = app; $('#shell').hidden = !app; }
function loadSample() { const s = makeSample(Date.now()); st.runs = s.runs; st.sample = true; st.S = Object.assign({}, DEFAULT_SETTINGS, s.settings, { units: st.S.units || 'km' }); }
function enterGuest() { st.user = null; st.guest = true; loadSample(); setShell(true); refresh(); }
async function enterUser(u) {
  st.user = u; st.guest = false; st.sample = false; st.S = Object.assign({}, DEFAULT_SETTINGS, u.settings || {}); st.published = new Set();
  setStatus('Loading workouts…');
  try { st.runs = await st.backend.listWorkouts(); setStatus(''); } catch (e) { st.runs = []; setStatus('Could not load workouts: ' + (e.message || e)); }
  setShell(true); st.shown = 30; refresh();
  st.daily = []; st.backend.listDaily().then(d => { st.daily = d; if (d.length) refresh(); }).catch(e => console.warn('daily data', e)); // all-day data is optional
  if (st.pending) { const f = st.pending; st.pending = null; importFiles(f); }
  maybeOfferMigration(); loadPublished();
  if (online()) { aiAdopt(); if (st.user.ui) setUI(st.user.ui, true); else uiSync(uiPrefs()); }
}
// appearance follows the online account
function uiSync(p) { if (online()) st.backend.updateProfile({ ui: p }).then(u => { if (u) st.user = u; }).catch(e => console.warn(e)); }
function showAuth(note) {
  const b = st.backend, local = b.kind === 'local';
  $('#authNote').hidden = !note; $('#authNote').textContent = note || '';
  $('#authLocal').hidden = !local; $('#authFire').hidden = local; $('#goOnline').hidden = false;
  if (local) {
    const accts = b.accounts();
    $('#profilePick').hidden = !accts.length;
    $('#plist').innerHTML = accts.map(p => `<button type="button" data-id="${esc(p.id)}"><span class="avatar">${esc(initials(p.name))}</span><span><b>${esc(p.name)}</b><span>${esc(p.email || 'Created ' + fmtDate(p.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }))}</span></span></button>`).join('');
    $$('#plist button').forEach(x => x.onclick = async () => enterUser(await b.signIn({ id: x.dataset.id })));
    $('#createTitle').textContent = accts.length ? 'Create a new profile' : 'Create your profile';
  } else setAuthMode(st.authMode);
  setShell(false); $('#cErr').hidden = $('#aErr').hidden = true;
  scrollTo(0, 0);
}
function setAuthMode(m) {
  st.authMode = m; const up = m === 'up';
  $('#tabIn').setAttribute('aria-selected', String(!up)); $('#tabUp').setAttribute('aria-selected', String(up));
  $('#lName').hidden = !up; $('#aReset').hidden = up; $('#aSubmit').textContent = up ? 'Create account' : 'Sign in';
  $('#aPass').autocomplete = up ? 'new-password' : 'current-password';
}
$('#tabIn').onclick = () => setAuthMode('in'); $('#tabUp').onclick = () => setAuthMode('up');
$('#fCreate').addEventListener('submit', async ev => {
  ev.preventDefault();
  try {
    const rest = parseFloat($('#cRest').value), mx = parseFloat($('#cMax').value);
    const u = await st.backend.signUp({ name: $('#cName').value, email: $('#cEmail').value, settings: { hrRest: isFinite(rest) ? rest : 55, hrMax: isFinite(mx) ? mx : null, units: st.S.units } });
    $('#fCreate').reset(); enterUser(u);
  } catch (e) { $('#cErr').textContent = e.message; $('#cErr').hidden = false; }
});
const fireMsg = e => ({ 'auth/invalid-credential': 'Email or password is wrong.', 'auth/wrong-password': 'Email or password is wrong.', 'auth/user-not-found': 'No account with that email. Create one instead.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.', 'auth/weak-password': 'Use at least 6 characters for the password.', 'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
  'auth/network-request-failed': 'Firebase could not be reached. Check your connection.', 'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.', 'auth/popup-blocked': 'The browser blocked the Google window. Allow pop-ups and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not switched on for the app yet.', 'auth/unauthorized-domain': 'This web address is not allowed to sign in to the app yet.',
  'permission-denied': 'The online database refused this. Try signing in again.' }[e.code] || e.message);
$('#aReset').onclick = async () => {
  const email = $('#aEmail').value.trim(), err = $('#aErr');
  if (!email) { err.textContent = 'Type your email above, then tap “Forgot password?” again.'; err.hidden = false; $('#aEmail').focus(); return; }
  try { await st.backend.auth.sendPasswordResetEmail(email); err.textContent = 'Check your inbox: a password reset link is on its way.'; }
  catch (e) { err.textContent = fireMsg(e); }
  err.hidden = false;
};
$('#fFire').addEventListener('submit', async ev => {
  ev.preventDefault(); $('#aErr').hidden = true;
  try {
    const email = $('#aEmail').value, password = $('#aPass').value;
    const u = st.authMode === 'up' ? await st.backend.signUp({ name: $('#aName').value || email.split('@')[0], email, password, settings: { units: st.S.units } }) : await st.backend.signIn({ email, password });
    enterUser(u);
  } catch (e) { $('#aErr').textContent = fireMsg(e); $('#aErr').hidden = false; }
});
$('#aGoogle').onclick = async () => { if (standaloneApp()) { st.backend.googleRedirect({}); return; } try { enterUser(await st.backend.signIn({ google: true })); } catch (e) { $('#aErr').textContent = fireMsg(e); $('#aErr').hidden = false; } };
$('#btnGuest').onclick = () => { st.pending = null; enterGuest(); location.hash = '#overview'; };
async function signOut() { await st.backend.signOut(); st.user = null; st.published = new Set(); closeMenu(); showAuth(); }

/* ---------- account menu ---------- */
function renderChrome() {
  // the feed needs an online account: its tab only appears once the account is saved online
  $$('#tabs [data-v="feed"], #bnav [data-v="feed"]').forEach(a => a.hidden = !online());
  const u = st.user, av = $('#avatar');
  av.textContent = u ? initials(u.name) : '?'; av.classList.toggle('guest', !u);
  $('#menu').innerHTML = u
    ? `<div class="who"><b>${esc(u.name)}</b><span>${esc(u.email || 'Local profile')} · ${esc(st.backend.label)}</span></div>
       <button type="button" role="menuitem" data-a="profile">Profile &amp; settings</button>
       ${st.backend.kind === 'local' ? '<button type="button" role="menuitem" data-a="online">Save account online</button>' : ''}
       ${st.backend.kind === 'local' ? '<button type="button" role="menuitem" data-a="switch">Switch profile</button>' : ''}
       <button type="button" role="menuitem" data-a="out">${st.backend.kind === 'local' ? 'Sign out of profile' : 'Sign out'}</button>`
    : `<div class="who"><b>Guest preview</b><span>Sample athlete, nothing is saved</span></div>
       <button type="button" role="menuitem" data-a="signin">${st.backend && st.backend.kind === 'firebase' ? 'Sign in or create account' : 'Create or choose a profile'}</button>`;
  $$('#menu button').forEach(b => b.onclick = () => { closeMenu(); const a = b.dataset.a;
    if (a === 'online') saveOnlineDlg(); else if (a === 'profile') location.hash = '#profile'; else if (a === 'switch' || a === 'signin') showAuth(); else if (a === 'out') signOut(); });
  const bn = $('#banner'); const fb = st.backend && st.backend.fallbackError;
  if (st.sample) { bn.hidden = false; bn.className = 'banner'; bn.innerHTML = `<span class="grow"><b>Guest preview with a sample athlete.</b> Create a profile, then import .fit, .tcx, .gpx, .zip or the activities .csv from Garmin Connect.</span><button type="button" class="primary" id="bnGo">Create profile</button>`; $('#bnGo').onclick = () => showAuth(); }
  else if (fb) { bn.hidden = false; bn.className = 'banner warn'; bn.innerHTML = `<span class="grow">${esc(fb)}</span>`; }
  else if (!st.runs.length) { bn.hidden = false; bn.className = 'banner'; bn.innerHTML = `<span class="grow"><b>No workouts yet.</b> Import your Garmin Connect exports to start tracking. Drag files anywhere on the page, or use Import.</span><label class="btn primary" for="file">Import workouts</label>`; }
  else bn.hidden = true;
}
const closeMenu = () => { $('#menu').hidden = true; $('#avatar').setAttribute('aria-expanded', 'false'); };
$('#avatar').onclick = ev => { ev.stopPropagation(); const m = $('#menu'); m.hidden = !m.hidden; $('#avatar').setAttribute('aria-expanded', String(!m.hidden)); };
document.addEventListener('click', ev => { if (!$('#menu').hidden && !ev.target.closest('.menu-wrap')) closeMenu(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeMenu(); });

/* ---------- router ---------- */
function route() {
  const h = (location.hash || '#overview').slice(1);
  let v = h, id = null;
  if (h.startsWith('w-')) { v = 'workout'; id = h.slice(2); }
  if (h.startsWith('s-')) { v = 'shared'; id = h.slice(2); }
  if (h.startsWith('m-')) { v = 'metric'; id = h.slice(2); if (st.view !== 'metric' || st.detail !== id) st.mRange = 7; } // always opens on 7 days
  if (!['overview', 'workouts', 'workout', 'feed', 'shared', 'metric', 'trends', 'records', 'profile'].includes(v)) v = 'overview';
  if (st.view === 'shared' && v !== 'shared') renderChrome();
  if (v === 'feed' && !online()) { location.replace('#overview'); return; }
  st.view = v; st.detail = id;
  $$('.view').forEach(s => s.hidden = s.dataset.view !== v);
  const tab = v === 'workout' ? 'workouts' : v === 'metric' ? 'overview' : v;
  $$('#tabs a, #bnav a').forEach(a => { if (a.dataset.v === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (v === 'shared') $('#banner').hidden = true;
  renderView();
}
addEventListener('hashchange', () => { route(); scrollTo(0, 0); });
function renderView() {
  const v = st.view;
  if (v === 'overview') renderOverview();
  else if (v === 'workouts') renderLedger();
  else if (v === 'workout') renderWorkout(st.detail);
  else if (v === 'trends') renderTrends();
  else if (v === 'records') renderRecords();
  else if (v === 'profile') renderProfile();
  else if (v === 'feed') renderFeed();
  else if (v === 'shared') renderShared(st.detail);
  else if (v === 'metric') renderMetric(st.detail);
  addChartShare(); addHelp();
}
function refresh() { compute(); renderChrome(); route(); }

/* ---------- route glyph & map ---------- */
const glyphCache = new Map();
function routeGlyph(r, size = 34, pad = 3) {
  if (!r.hasGPS) return '';
  const key = r.id + ':' + size; if (glyphCache.has(key)) return glyphCache.get(key);
  const k = Math.cos(r.lat0 * Math.PI / 180), step = Math.max(1, Math.floor(r.n / 120)), xs = [], ys = [];
  for (let i = 0; i < r.n; i += step) if (!isNaN(r.dla[i])) { xs.push(r.dlo[i] * k); ys.push(-r.dla[i]); }
  if (xs.length < 2) return '';
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), s = (size - 2 * pad) / Math.max(x1 - x0, y1 - y0, 1e-9);
  const ox = (size - (x1 - x0) * s) / 2, oy = (size - (y1 - y0) * s) / 2;
  const d = xs.map((x, i) => (i ? 'L' : 'M') + ((x - x0) * s + ox).toFixed(1) + ',' + ((ys[i] - y0) * s + oy).toFixed(1)).join('');
  glyphCache.set(key, d); return d;
}
const wx = (lo, z) => (lo + 180) / 360 * 256 * 2 ** z;
const wy = (la, z) => { const s = Math.sin(la * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
function mapView(el, r, mode) {
  const n = r.n, step = Math.max(1, Math.floor(n / 1800)), I = [];
  for (let i = 0; i < n; i += step) if (!isNaN(r.dla[i])) I.push(i);
  if (I.length < 2) { el.outerHTML = '<p class="empty">No GPS positions in this file.</p>'; return; }
  const LA = i => r.lat0 + r.dla[i], LO = i => r.lon0 + r.dlo[i];
  // values to colour by
  const sp = new Float32Array(n); for (let i = 0; i < n; i++) { const a = Math.max(0, i - 5), b = Math.min(n - 1, i + 5); sp[i] = b > a ? (r.d[b] - r.d[a]) / ((b - a) * DT) : 0; }
  const val = i => mode === 'hr' ? (r.hr[i] > 0 ? r.hr[i] : NaN) : mode === 'elev' ? r.alt[i] : (r.mv[i] && sp[i] > 1 ? sp[i] : NaN);
  const vs = I.map(val).filter(x => !isNaN(x)).sort((a, b) => a - b);
  const lo = vs[Math.floor(vs.length * 0.05)] ?? 0, hi = vs[Math.floor(vs.length * 0.95)] ?? 1;
  const ramp = ['--z1', '--z2', '--z3', '--z4', '--z5'].map(css);
  const bin = i => { const v = val(i); if (isNaN(v) || hi <= lo) return 2; return clamp(Math.floor((v - lo) / (hi - lo) * 5), 0, 4); };
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180; for (const i of I) { const a = LA(i), o = LO(i); la0 = Math.min(la0, a); la1 = Math.max(la1, a); lo0 = Math.min(lo0, o); lo1 = Math.max(lo1, o); }
  el.classList.add('no-tiles');
  el.innerHTML = `<div class="tiles"></div><svg aria-label="Route map"></svg><div class="ctrl"><button type="button" data-z="1" aria-label="Zoom in">+</button><button type="button" data-z="-1" aria-label="Zoom out">−</button><button type="button" data-z="0" aria-label="Fit route" style="font-size:13px">⤢</button></div><div class="attr" hidden>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</div><div class="tip" hidden></div>`;
  const tilesEl = el.querySelector('.tiles'), svg = el.querySelector('svg'), tip = el.querySelector('.tip');
  let W = el.clientWidth, H = el.clientHeight, z, cx, cy;
  const fit = () => { W = el.clientWidth; H = el.clientHeight; for (z = 18; z > 2; z--) if (wx(lo1, z) - wx(lo0, z) <= W - 60 && wy(la0, z) - wy(la1, z) <= H - 60) break; cx = (wx(lo0, z) + wx(lo1, z)) / 2; cy = (wy(la0, z) + wy(la1, z)) / 2; };
  const unit = U(); let P = [];
  const draw = () => {
    const x0 = cx - W / 2, y0 = cy - H / 2, N = 2 ** z; let im = '';
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) {
      if (ty < 0 || ty >= N) continue; const wxp = ((tx % N) + N) % N;
      im += `<img alt="" draggable="false" src="https://tile.openstreetmap.org/${z}/${wxp}/${ty}.png" style="left:${tx * 256 - x0}px;top:${ty * 256 - y0}px">`;
    }
    tilesEl.innerHTML = im;
    tilesEl.querySelectorAll('img').forEach(img => { img.onload = () => { el.classList.remove('no-tiles'); el.querySelector('.attr').hidden = false; }; img.onerror = () => img.remove(); });
    P = I.map(i => [wx(LO(i), z) - x0, wy(LA(i), z) - y0, i]);
    let halo = '', segs = '', cur = -1, d = '';
    for (let k = 0; k < P.length; k++) {
      const [x, y, i] = P[k], b = bin(i), gap = k && !r.mv[i] && !r.mv[P[k - 1][2]];
      if (b !== cur || gap) { if (d) segs += `<path d="${d}" stroke="${ramp[cur]}"/>`; d = k && !gap ? `M${P[k - 1][0].toFixed(1)},${P[k - 1][1].toFixed(1)}` : ''; cur = b; }
      d += (d ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    if (d) segs += `<path d="${d}" stroke="${ramp[cur]}"/>`;
    halo = `<path d="${P.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('')}" stroke="var(--surface)" stroke-width="7" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
    let marks = ''; const total = r.d[n - 1] - r.d[0], every = total / unit > 30 ? 5 : 1;
    if (z >= 13) for (let km = every; km * unit < total; km += every) { const p = P.find(q => r.d[q[2]] - r.d[0] >= km * unit); if (p) marks += `<g transform="translate(${p[0]},${p[1]})"><circle r="8" fill="var(--surface)" stroke="var(--ink2)" stroke-width="1.2"/><text text-anchor="middle" y="3.5">${km}</text></g>`; }
    const s = P[0], e = P[P.length - 1];
    svg.innerHTML = halo + `<g fill="none" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${segs}</g>` + marks +
      `<circle cx="${e[0]}" cy="${e[1]}" r="7" fill="var(--ink)" stroke="var(--surface)" stroke-width="2.5"/><circle cx="${s[0]}" cy="${s[1]}" r="7" fill="var(--good)" stroke="var(--surface)" stroke-width="2.5"/><g class="hl"></g>`;
  };
  fit(); draw();
  // interactions: drag to pan, two-finger pinch / buttons / double-tap to zoom, hover for details
  let drag = null, pinch = null; const pts = new Map();
  const mid = () => { const [a, b] = [...pts.values()], rc = el.getBoundingClientRect(); return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2 - rc.left, y: (a.y + b.y) / 2 - rc.top }; };
  el.addEventListener('pointerdown', ev => { if (ev.target.closest('.ctrl')) return; pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); el.setPointerCapture(ev.pointerId);
    if (pts.size === 2) { drag = null; pinch = mid(); } else if (pts.size === 1) { drag = { x: ev.clientX, y: ev.clientY, cx, cy }; el.style.cursor = 'grabbing'; } });
  const up = ev => { pts.delete(ev.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; el.style.cursor = ''; } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('pointermove', ev => {
    if (pts.has(ev.pointerId)) pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pts.size === 2) { const m = mid(), f = m.d / pinch.d; if (f > 1.45 || f < 0.69) { zoom(f > 1 ? 1 : -1, m.x, m.y); pinch = m; } tip.hidden = true; return; }
    if (drag) { cx = drag.cx - (ev.clientX - drag.x); cy = drag.cy - (ev.clientY - drag.y); draw(); tip.hidden = true; return; }
    const rc = el.getBoundingClientRect(), px = ev.clientX - rc.left, py = ev.clientY - rc.top;
    let best = null, bd = 26; for (const p of P) { const dd = Math.hypot(p[0] - px, p[1] - py); if (dd < bd) { bd = dd; best = p; } }
    const hl = svg.querySelector('.hl'); if (!best) { tip.hidden = true; hl.innerHTML = ''; return; }
    const i = best[2]; hl.innerHTML = `<circle cx="${best[0]}" cy="${best[1]}" r="6" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/>`;
    tip.innerHTML = `<b>${fmtDist(r.d[i] - r.d[0])} ${uName()}</b> · ${fmtDur(i * DT)}<br>${sp[i] > 1 ? fmtPace(1000 / sp[i]) + '/' + uName() : '–'}${r.hr[i] > 0 ? ' · ' + Math.round(r.hr[i]) + ' bpm' : ''}${!isNaN(r.alt[i]) ? ' · ' + Math.round(r.alt[i]) + ' m' : ''}`;
    tip.hidden = false; tip.style.left = Math.min(W - tip.offsetWidth - 4, best[0] + 12) + 'px'; tip.style.top = Math.max(4, best[1] - tip.offsetHeight - 10) + 'px';
  });
  el.addEventListener('pointerleave', () => { tip.hidden = true; });
  const zoom = (dz, px = W / 2, py = H / 2) => { const nz = clamp(z + dz, 2, 18); if (nz === z) return; const f = 2 ** (nz - z); cx = (cx - W / 2 + px) * f - px + W / 2; cy = (cy - H / 2 + py) * f - py + H / 2; z = nz; draw(); };
  el.querySelectorAll('.ctrl button').forEach(b => b.onclick = () => { const dz = +b.dataset.z; if (dz) zoom(dz); else { fit(); draw(); } });
  el.addEventListener('dblclick', ev => { const rc = el.getBoundingClientRect(); zoom(1, ev.clientX - rc.left, ev.clientY - rc.top); });
  return { lo, hi };
}

function weekly() {
  const wk = new Map();
  st.runs.forEach((r, i) => { const d = new Date(dayStart(r.start)); const k = d.getTime() - ((d.getDay() + 6) % 7) * DAY; const w = wk.get(k) || { d: 0, n: 0, t: 0 }; w.d += st.res[i].dist || 0; w.t += st.res[i].mov || 0; w.n++; wk.set(k, w); });
  return [...wk.entries()].sort((a, b) => a[0] - b[0]).map(([k, w]) => [k + 3.5 * DAY, w.d / U(), w.n, w.t]);
}
/* ---------- workouts ledger ---------- */
function renderLedger() {
  const years = [...new Set(st.runs.map(r => new Date(r.start).getFullYear()))].sort((a, b) => b - a);
  $('#yr').innerHTML = `<option value="all">All years</option>` + years.map(y => `<option value="${y}">${y}</option>`).join(''); $('#yr').value = years.includes(+st.yr) ? st.yr : 'all';
  $('#q').value = st.q; $('#sort').value = st.sort;
  const q = st.q.trim().toLowerCase();
  let idx = st.runs.map((r, i) => i).filter(i => (st.yr === 'all' || new Date(st.runs[i].start).getFullYear() === +st.yr) && (!q || st.runs[i].name.toLowerCase().includes(q)));
  const by = { new: (a, b) => st.runs[b].start - st.runs[a].start, old: (a, b) => st.runs[a].start - st.runs[b].start, dist: (a, b) => st.res[b].dist - st.res[a].dist, vo2: (a, b) => (st.res[b].est || 0) - (st.res[a].est || 0) };
  idx.sort(by[st.sort]);
  const totD = idx.reduce((s, i) => s + (st.res[i].dist || 0), 0), totT = idx.reduce((s, i) => s + (st.res[i].mov || 0), 0);
  $('#runCount').textContent = `${idx.length} workouts · ${fmtDist(totD)} ${uName()} · ${fmtDur(totT)}`;
  const head = `<div class="ledger-head"><span></span><span>Date</span><span>Workout</span><span>Dist ${uName()}</span><span>Time</span><span>Pace</span><span>Avg HR</span><span>${al('vo2', 'VO₂ est.')}</span><span>${al('load', 'Load')}</span></div>`;
  const rows = idx.slice(0, st.shown).map(i => { const r = st.runs[i], e = st.res[i], g = routeGlyph(r);
    return `<a class="row" href="#w-${esc(r.id)}"><span class="glyph">${g ? `<svg viewBox="0 0 34 34"><path d="${g}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>` : `<svg viewBox="0 0 34 34"><path d="M7 21h5l3-8 4 10 2-5h6" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`}</span>
      <span class="d">${fmtDate(r.start, { day: 'numeric', month: 'short', year: 'numeric' })}<span>${new Date(r.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></span>
      <span class="nm">${esc(r.name)}${r.summary ? '<small>CSV</small>' : ''}</span>
      <span class="m"><em>Dist</em>${fmtDist(e.dist)}</span><span class="m"><em>Time</em>${fmtDur(e.mov)}</span><span class="m"><em>Pace</em>${fmtPace(e.pace)}</span>
      <span class="m xs"><em>Avg HR</em>${e.avgHR ? Math.round(e.avgHR) : '–'}</span><span class="m xs"><em>VO₂ est.</em>${e.est ? f1(e.est) : '–'}</span><span class="m xs"><em>Load</em>${f0(e.load)}</span></a>`; }).join('');
  $('#ledger').innerHTML = idx.length ? head + rows + (idx.length > st.shown ? `<button type="button" class="more" id="more">Show ${Math.min(30, idx.length - st.shown)} more</button>` : '') : '<p class="empty">No workouts match.</p>';
  const mo = $('#more'); if (mo) mo.onclick = () => { st.shown += 30; renderLedger(); };
}
$('#q').addEventListener('input', ev => { st.q = ev.target.value; st.shown = 30; renderLedger(); });
$('#yr').addEventListener('change', ev => { st.yr = ev.target.value; st.shown = 30; renderLedger(); });
$('#sort').addEventListener('change', ev => { st.sort = ev.target.value; renderLedger(); });

/* ---------- workout detail ---------- */
function renderWorkout(id) {
  const box = $('#v-workout'), i = st.idx ? st.idx.get(id) : undefined;
  if (i == null) { box.innerHTML = `<a class="btn back" href="#workouts">← Workouts</a><p class="empty">This workout isn’t in the current profile.</p>`; return; }
  const r = st.runs[i], e = st.res[i], S = st.S, D = dayAt(r.start);
  const stat = (l, v, u = '', k) => `<div class="stat"><span>${k ? al(k, l) : l}</span><b>${v}${u ? `<small>${u}</small>` : ''}</b></div>`;
  const when = new Date(r.start).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  let h = `<a class="btn back ghost" href="#workouts">← Workouts</a>
    <div class="wd-head"><div><h2>${esc(r.name)}</h2><p>${when} · from ${esc(r.src || 'file')}</p></div>
    <div class="btns">${i > 0 ? `<a class="btn" href="#w-${esc(st.runs[i - 1].id)}" aria-label="Previous workout">‹ Older</a>` : ''}${i < st.runs.length - 1 ? `<a class="btn" href="#w-${esc(st.runs[i + 1].id)}" aria-label="Next workout">Newer ›</a>` : ''}
    <button type="button" id="aiW">✨ AI opinion</button><button type="button" id="imgW">🖼 Share image</button>
    ${online() ? `<button type="button" id="shareW">${ICON_SHARE}Share link</button><button type="button" class="${st.published && st.published.has(r.id) ? '' : 'primary'}" id="pubW">${st.published && st.published.has(r.id) ? 'In feed ✓' : 'Publish to feed'}</button>` : ''}
    ${st.user ? `<button type="button" class="danger" id="delW">Delete</button>` : ''}</div></div>
    <div class="stats">${stat('Distance', fmtDist(e.dist), uName())}${stat('Moving time', fmtDur(e.mov))}${stat('Avg pace', fmtPace(e.pace), '/' + uName())}
    ${stat('Grade-adj. pace', fmtPace(e.gapPace), '/' + uName(), 'gap')}${stat('Avg HR', e.avgHR ? Math.round(e.avgHR) : '–', 'bpm')}${stat('Max HR', e.maxHR ? Math.round(e.maxHR) + (st.hm && st.hm.source === 'detected' && st.hm.run === r ? ' ★' : '') : '–', st.hm && st.hm.source === 'detected' && st.hm.run === r ? 'bpm · sets your max' : 'bpm', 'hrmax')}
    ${stat('VO₂max est.', e.est ? f1(e.est) : '–', e.est ? `${Math.round(e.conf * 100)}% conf.` : '', 'vo2')}${stat('VO₂max that day', D && D.vo2 ? f1(D.vo2) : '–', '', 'vo2')}${stat('Endurance that day', D && D.end ? f0(D.end) : '–', '', 'end')}
    ${stat('Load (TRIMP)', f0(e.load), '', 'load')}${stat('HR drift', e.dec != null ? f1(e.dec) + '% ' + badge(...STATUS.drift(e.dec)) : '–', '', 'drift')}${stat('Efficiency', e.ef ? e.ef.toFixed(2) : '–', 'm/beat', 'ef')}
    ${stat('Ascent', e.ascent != null ? Math.round(e.ascent) : '–', 'm')}${stat('Cadence', e.cad ? Math.round(e.cad) : '–', 'spm')}</div>`;
  h += `<div class="card" id="wAI" style="margin-top:12px" hidden></div>`;
  if (r.summary) h += `<p class="sub" style="margin-top:12px">This workout came from the activity list CSV, so only totals are known. Import its .fit file for the map, charts and splits.</p>`;
  else {
    h += `<div class="wd-grid">
      <div class="card span2"><div class="map-bar"><h3>Route</h3>${r.hasGPS ? `<div class="seg" id="mapMode" role="group" aria-label="Colour route by"><button type="button" data-m="pace">Pace</button><button type="button" data-m="hr">Heart rate</button><button type="button" data-m="elev">Elevation</button></div>` : ''}</div>
        ${r.hasGPS ? `<div class="map" id="map"></div><div class="map-bar" style="margin:10px 0 0"><span class="ramp" id="ramp"></span><a class="sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${(r.lat0 + r.dla[0]).toFixed(5)}&mlon=${(r.lon0 + r.dlo[0]).toFixed(5)}#map=14/${(r.lat0 + r.dla[0]).toFixed(5)}/${(r.lon0 + r.dlo[0]).toFixed(5)}">Open start point in OpenStreetMap ↗</a></div>`
          : `<p class="empty">${r.ver >= 2 ? 'No GPS in this file (treadmill or indoor run).' : 'Imported before maps were supported. Import the file again to add its route.'}</p>`}</div>
      <div class="card chart-card"><h3>Pace</h3><p class="cap">Per ${uName()}, 30-second smoothing. Faster is higher.</p><div class="plot" id="dPace"></div></div>
      <div class="card chart-card"><h3>Heart rate</h3><p class="cap">bpm with zone boundaries.</p><div class="plot" id="dHr"></div></div>
      ${r.hasAlt ? `<div class="card chart-card"><h3>Elevation</h3><p class="cap">Metres, smoothed.</p><div class="plot" id="dAlt"></div></div>` : ''}
      <div class="card chart-card"><h3>${al('vo2', 'How this run’s VO₂max was found')}</h3><p class="cap">Each dot is a steady 60-s window: its oxygen cost (from grade-adjusted pace) against heart rate. The dashed line is the median estimate; where it meets your max HR is this run’s VO₂max.</p><div class="plot" id="dFit"></div></div>
      <div class="card"><div class="ch"><h3>Splits</h3><span class="muted sm">per ${uName()}</span></div><div class="scroll-x" id="dSplits"></div></div>
      <div class="card"><div class="ch"><h3>${al('zones', 'Time in heart-rate zones')}</h3><span class="muted sm">% of max HR</span></div><div class="bars" id="dZones"></div></div>
      ${e.efforts.length ? `<div class="card"><div class="ch"><h3>${al('best', 'Best efforts in this run')}</h3></div><div class="scroll-x" id="dEff"></div></div>` : ''}
    </div>`;
  }
  box.innerHTML = h;
  $('#imgW').onclick = () => shareImageDlg(r, e);
  renderWorkoutAI($('#wAI'), r, e, false);
  $('#aiW').onclick = () => { renderWorkoutAI($('#wAI'), r, e, true); $('#wAI').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  if ($('#shareW')) { $('#shareW').onclick = () => shareWorkout(r, e); $('#pubW').onclick = () => publishDlg(r, e); }
  const del = $('#delW'); if (del) del.onclick = async () => {
    if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'Tap again to delete'; return; }
    try { await st.backend.deleteWorkout(r.id); st.runs = st.runs.filter(x => x.id !== r.id); glyphCache.clear(); setStatus(`Deleted “${r.name}”.`); location.hash = '#workouts'; compute(); renderChrome(); }
    catch (err) { setStatus('Could not delete: ' + err.message); }
  };
  if (r.summary) return;
  requestAnimationFrame(() => drawWorkout(r, e, S));
}
function drawWorkout(r, e, S) {
  if (r.hasGPS) {
    const syncMode = () => $$('#mapMode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === st.mapMode)));
    const paint = () => { const m = $('#map'); if (!m) return; const fresh = m.cloneNode(false); m.replaceWith(fresh); const rg = mapView(fresh, r, st.mapMode);
      const lab = { pace: ['slower', 'faster', v => fmtPace(1000 / v)], hr: ['lower', 'higher', v => Math.round(v) + ' bpm'], elev: ['lower', 'higher', v => Math.round(v) + ' m'] }[st.mapMode];
      if (rg) $('#ramp').innerHTML = `<span>${lab[0]} ${lab[2](rg.lo)}</span><i style="background:linear-gradient(90deg,var(--z1),var(--z2),var(--z3),var(--z4),var(--z5))"></i><span>${lab[2](rg.hi)} ${lab[1]}</span>`; };
    $$('#mapMode button').forEach(b => b.onclick = () => { st.mapMode = b.dataset.m; syncMode(); paint(); });
    syncMode(); paint();
  }
  const n = r.n, step = Math.max(1, Math.ceil(n / 500)), sp = smooth(Array.from(r.d, (x, i) => i ? (x - r.d[i - 1]) / DT : 0), 15), hrS = smooth(r.hr, 5);
  const pace = [], hr = [], alt = []; const altS = r.hasAlt ? smooth(r.alt, 9) : null;
  for (let i = 0; i < n; i += step) { const t = i * DT / 60; pace.push([t, r.mv[i] && sp[i] > 1.2 ? 1000 / sp[i] : null]); hr.push([t, hrS[i] > 0 ? hrS[i] : null]); if (altS) alt.push([t, altS[i]]); }
  const tf = v => fmtDur(v * 60), pv = pace.filter(p => p[1] != null).map(p => p[1]).sort((a, b) => a - b);
  const pLo = pv[Math.floor(pv.length * 0.02)], pHi = pv[Math.floor(pv.length * 0.98)];
  const xo = { xTime: false, xFmt: v => v + "'", tipX: v => tf(v), height: 190 };
  plot($('#dPace'), Object.assign({}, xo, { invert: true, label: 'Pace over time', yMin: pLo, yMax: pHi, minSpan: 30, series: [{ name: 'Pace', kind: 'line', color: css('--pace'), end: false, pts: pace.map(p => [p[0], p[1] == null ? null : clamp(p[1], pLo || 0, pHi || 1e9)]), fmt: v => fmtPace(v) + '/' + uName() }], yFmt: v => fmtPace(v) }));
  const hrr = q => q * S.hrMaxEff; // ZONEalg2: zones are % of max HR
  plot($('#dHr'), Object.assign({}, xo, { label: 'Heart rate over time', minSpan: 20, series: [{ name: 'Heart rate', kind: 'line', color: css('--hr'), end: false, pts: hr, fmt: v => Math.round(v) + ' bpm' }],
    empty: 'No heart-rate data in this file.',
    extra: (sx, sy, b) => [0.6, 0.7, 0.8, 0.9].map((q, k) => { const y = hrr(q); return y > b.y0 && y < b.y1 ? `<text class="ax" x="${b.W - b.m.r - 2}" y="${sy(y) - 3}" text-anchor="end">Z${k + 2}</text><line x1="${b.m.l}" x2="${b.W - b.m.r}" y1="${sy(y)}" y2="${sy(y)}" stroke="var(--hz${k + 2})" stroke-dasharray="2 4"/>` : ''; }).join('') }));
  if (altS) plot($('#dAlt'), Object.assign({}, xo, { label: 'Elevation over time', minSpan: 20, series: [{ name: 'Elevation', kind: 'area', color: css('--elev'), end: false, pts: alt, fmt: v => Math.round(v) + ' m' }] }));
  if (e.est && e.windows.length) {
    // VO2alg3: each window's oxygen cost against heart rate; the Swain line runs from 37% of max HR (zero) to max HR (= VO₂max)
    const x0 = 0.37 * S.hrMaxEff, at = h => e.est * (h / S.hrMaxEff - 0.37) / 0.64;
    plot($('#dFit'), { xTime: false, xFmt: v => String(v), xMin: Math.min(x0, ...e.windows.map(w => w[0])) - 5, xMax: S.hrMaxEff + 5, zero: true, yMax: e.est * 1.08, height: 230, label: 'Oxygen cost versus heart rate',
      series: [{ name: 'Steady window', kind: 'dots', color: css('--vo2'), pts: e.windows.map(w => [w[0], w[1], w[2], w[3]]), r: p => 3 + 2 * p[2], op: 0.45, tip: p => `<b>${Math.round(p[0])} bpm</b> · VO₂ ${p[1].toFixed(1)} → VO₂max ${p[3].toFixed(1)}` }],
      extra: (sx, sy) => `<line x1="${sx(x0)}" y1="${sy(0)}" x2="${sx(S.hrMaxEff)}" y2="${sy(e.est)}" stroke="var(--ink2)" stroke-width="2" stroke-dasharray="6 4"/>
        <circle cx="${sx(S.hrMaxEff)}" cy="${sy(e.est)}" r="6" fill="var(--vo2)" stroke="var(--surface)" stroke-width="2"/>
        <text class="fitlab" x="${sx(S.hrMaxEff) - 10}" y="${sy(e.est) + 4}" text-anchor="end">VO₂max ${e.est.toFixed(1)} at ${Math.round(S.hrMaxEff)} bpm</text>` });
  } else $('#dFit').innerHTML = `<p class="empty">${r.hasHR ? 'Not enough steady running to estimate VO₂max. Even-paced runs of 20+ minutes work best.' : 'No heart-rate data in this file.'}</p>`;
  const sp2 = splitsOf(r, U());
  if (sp2.length) {
    const ps = sp2.map(s => s.sec / (s.len / 1000)), pmin = Math.min(...ps), pmax = Math.max(...ps);
    $('#dSplits').innerHTML = `<table class="tb"><thead><tr><th>${uName()}</th><th class="n">Pace</th><th class="n">${al('gap', 'GAP')}</th><th class="n">HR</th><th class="n">Elev</th><th class="n">Cad</th></tr></thead><tbody>${sp2.map((s, k) => {
      const p = s.sec / (s.len / 1000), w = pmax > pmin ? 35 + 65 * (pmax - p) / (pmax - pmin) : 70;
      return `<tr><td>${s.len < U() * 0.99 ? (s.len / U()).toFixed(2) : k + 1}</td><td class="n barcell"><i style="width:${w}%"></i><span>${fmtPace(p)}</span></td><td class="n">${fmtPace(s.gap / (s.len / 1000))}</td><td class="n">${s.hr ? Math.round(s.hr) : '–'}</td><td class="n">${s.elev != null ? (s.elev >= 0 ? '+' : '') + Math.round(s.elev) : '–'}</td><td class="n">${s.cad ? Math.round(s.cad) : '–'}</td></tr>`; }).join('')}</tbody></table>`;
  } else $('#dSplits').innerHTML = '<p class="empty">Too short for splits.</p>';
  if (e.zones) {
    const tot = e.zones.reduce((a, b) => a + b, 0) || 1, lab = ZONE.labels, lim = ['<60%', '60–70%', '70–80%', '80–90%', '>90%'];
    $('#dZones').innerHTML = e.zones.map((z, k) => `<div class="bar-row"><span>${lab[k]} <span class="sub">${lim[k]}${k ? ' · ' + Math.round(hrr([0, 0.6, 0.7, 0.8, 0.9][k])) + '+ bpm' : ''}</span></span><span class="v">${fmtDur(z)} · ${Math.round(z / tot * 100)}%</span><div class="track"><i style="width:${Math.max(1, z / tot * 100)}%;background:var(--hz${k + 1})"></i></div></div>`).join('');
  } else $('#dZones').innerHTML = '<p class="empty">No heart-rate data.</p>';
  if ($('#dEff')) $('#dEff').innerHTML = effTable(e.efforts.map(x => ({ e: x, r })), false);
}
function effTable(rows, withRun = true) {
  return `<table class="tb"><thead><tr><th>Distance</th><th class="n">Time</th><th class="n">Pace</th><th class="n">Avg HR</th><th class="n">${al('best', 'VDOT')}</th>${withRun ? '<th>Workout</th>' : ''}</tr></thead><tbody>${rows.map(({ e, r }) =>
    `<tr><td>${e.label}</td><td class="n">${fmtDur(e.sec)}</td><td class="n">${fmtPace(e.sec / (e.D / 1000))}</td><td class="n">${e.hr ? Math.round(e.hr) : '–'}</td><td class="n">${e.vdot ? f1(e.vdot) : '–'}</td>${withRun ? `<td><a href="#w-${esc(r.id)}">${fmtDate(r.start, { day: 'numeric', month: 'short', year: 'numeric' })}</a></td>` : ''}</tr>`).join('')}</tbody></table>`;
}

/* ---------- trends ---------- */
function renderTrends() {
  const days = st.days;
  if (!days.length) { ['#cVo2', '#cEnd', '#cLoad', '#cWeek', '#cEf', '#cDec'].forEach(s => $(s).innerHTML = '<p class="empty">Import workouts to see trends.</p>'); $('#monthly').innerHTML = ''; return; }
  const xMax = days[days.length - 1].t, xMin = st.range ? Math.max(days[0].t, xMax - st.range * DAY) : days[0].t;
  const inR = t => t >= xMin - DAY && t <= xMax + DAY, decPts = [];
  st.runs.forEach((r, i) => { const e = st.res[i]; if (inR(r.start) && e.dec != null) decPts.push([r.start, clamp(e.dec, -5, 25), Math.min(1, e.mov / 7200), r.name]); });
  vo2Chart($('#cVo2'), st.range, true);
  endChart($('#cEnd'), st.range);
  loadChart($('#cLoad'), st.range);
  $('#capWeek').textContent = `Total running distance per week, ${uName()}.`;
  weekChart($('#cWeek'), st.range ? Math.ceil(st.range / 7) : 0);
  efChart($('#cEf'), st.range);
  plot($('#cDec'), { label: 'Heart-rate drift', xMin, xMax, zero: true, minSpan: 6, empty: 'Needs steady runs of 40+ minutes with heart rate.', series: [
    { name: 'Run', kind: 'dots', color: css('--drift'), pts: decPts, r: p => 3 + 3 * p[2], op: 0.5, fmt: (v, p) => `${v.toFixed(1)}% · ${p[3]}` }], yFmt: (v, d) => v.toFixed(d) + '%',
    extra: (sx, sy, b) => 5 > b.y0 && 5 < b.y1 ? `<line x1="${b.m.l}" x2="${b.W - b.m.r}" y1="${sy(5)}" y2="${sy(5)}" stroke="var(--good)" stroke-dasharray="6 4" stroke-width="1.5"/><text class="ax" x="${b.W - b.m.r - 2}" y="${sy(5) - 4}" text-anchor="end">5% target</text>` : '' });
  // monthly
  const mon = new Map();
  st.runs.forEach((r, i) => { const dt = new Date(r.start), k = dt.getFullYear() * 12 + dt.getMonth(); const m = mon.get(k) || { n: 0, d: 0, t: 0, hs: 0, hc: 0, l: 0 }; const e = st.res[i];
    m.n++; m.d += e.dist || 0; m.t += e.mov || 0; m.l += e.load || 0; if (e.avgHR) { m.hs += e.avgHR * e.mov; m.hc += e.mov; } mon.set(k, m); });
  const ks = [...mon.keys()].sort((a, b) => b - a), dmax = Math.max(...ks.map(k => mon.get(k).d));
  $('#monthly').innerHTML = `<table class="tb"><thead><tr><th>Month</th><th class="n">Runs</th><th class="n">Distance ${uName()}</th><th class="n">Time</th><th class="n">Avg HR</th><th class="n">${al('load', 'Load')}</th><th class="n">${al('vo2', 'VO₂max')}</th><th class="n">${al('end', 'Endurance')}</th></tr></thead><tbody>${ks.map(k => {
    const m = mon.get(k), y = Math.floor(k / 12), mo = k % 12, endT = Math.min(new Date(y, mo + 1, 0).getTime(), st.asOf), D = dayAt(endT);
    return `<tr><td>${new Date(y, mo, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</td><td class="n">${m.n}</td><td class="n barcell"><i style="width:${dmax ? m.d / dmax * 100 : 0}%"></i><span>${fmtDist(m.d)}</span></td><td class="n">${fmtDur(m.t)}</td><td class="n">${m.hc ? Math.round(m.hs / m.hc) : '–'}</td><td class="n">${f0(m.l)}</td><td class="n">${D && D.vo2 ? f1(D.vo2) : '–'}</td><td class="n">${D && D.end ? f0(D.end) : '–'}</td></tr>`; }).join('')}</tbody></table>`;
}
function syncRange() { $$('#range button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.d === st.range))); }
$$('#range button').forEach(b => b.onclick = () => { st.range = +b.dataset.d; lsSet('pp-range', st.range); syncRange(); renderTrends(); });

/* ---------- records ---------- */
function renderRecords() {
  if (!st.runs.length) { $('#recTop').innerHTML = '<p class="empty">Import workouts to see records.</p>'; $('#recBest').innerHTML = $('#recProg').innerHTML = ''; return; }
  const best = {}, prog = [];
  st.runs.forEach((r, i) => { for (const e of st.res[i].efforts) { if (e.label === 'Run') continue; const b = best[e.label]; if (!b || e.sec < b.e.sec) { if (b) prog.push({ e, r, prev: b.e.sec }); else prog.push({ e, r, prev: null }); best[e.label] = { e, r }; } } });
  let longest = 0, mostUp = 0, totD = 0, totT = 0; st.res.forEach((e, i) => { if (e.dist > st.res[longest].dist) longest = i; if ((e.ascent || 0) > (st.res[mostUp].ascent || 0)) mostUp = i; totD += e.dist || 0; totT += e.mov || 0; });
  const wk = weekly(), bw = wk.reduce((b, w) => w[1] > b[1] ? w : b, wk[0]);
  let vmax = null, emax = null; for (const d of st.days) { if (d.vo2 && (!vmax || d.vo2 > vmax.vo2)) vmax = d; if (d.end && (!emax || d.end > emax.end)) emax = d; }
  const card = (l, v, u, p, href) => `<div class="card rec"><span class="label">${l}</span><div class="val">${v}<small>${u}</small></div><p>${href ? `<a href="${href}">${p}</a>` : p}</p></div>`;
  const R = i => st.runs[i];
  $('#recTop').innerHTML =
    card(al('vo2', 'Highest VO₂max'), vmax ? f1(vmax.vo2) : '–', 'ml/kg/min', vmax ? fmtDate(vmax.t, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Needs heart-rate data') +
    card(al('end', 'Best endurance score'), emax ? f0(emax.end) : '–', emax ? tierOf(emax.end) : '', emax ? fmtDate(emax.t, { day: 'numeric', month: 'short', year: 'numeric' }) : '') +
    card('Longest run', fmtDist(st.res[longest].dist), uName(), `${esc(R(longest).name)} · ${fmtDate(R(longest).start, { day: 'numeric', month: 'short', year: 'numeric' })}`, '#w-' + R(longest).id) +
    card('Biggest week', bw ? bw[1].toFixed(1) : '–', uName(), bw ? `Week of ${fmtDate(bw[0] - 3.5 * DAY, { day: 'numeric', month: 'short', year: 'numeric' })} · ${bw[2]} runs` : '') +
    card('Most climbing', st.res[mostUp].ascent ? Math.round(st.res[mostUp].ascent) : '–', 'm', `${esc(R(mostUp).name)}`, '#w-' + R(mostUp).id) +
    card('All time', fmtDist(totD), uName(), `${st.runs.length} workouts · ${fmtDur(totT)} since ${fmtDate(st.runs[0].start, { month: 'short', year: 'numeric' })}`);
  const rows = EFFORTS.map(([, l]) => best[l]).filter(Boolean);
  $('#recBest').innerHTML = rows.length ? effTable(rows) : '<p class="empty">No efforts found.</p>';
  $('#recProg').innerHTML = prog.length ? `<table class="tb"><thead><tr><th>Date</th><th>Distance</th><th class="n">Time</th><th class="n">Improved by</th></tr></thead><tbody>${prog.slice().reverse().slice(0, 40).map(({ e, r, prev }) =>
    `<tr><td><a href="#w-${esc(r.id)}">${fmtDate(r.start, { day: 'numeric', month: 'short', year: 'numeric' })}</a></td><td>${e.label}</td><td class="n">${fmtDur(e.sec)}</td><td class="n">${prev ? '−' + fmtDur(prev - e.sec) : 'first'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No efforts yet.</p>';
}

/* ---------- profile ---------- */
function renderProfile() {
  const u = st.user, b = st.backend;
  const totD = st.res.reduce((s, e) => s + (e.dist || 0), 0);
  $('#pCard').innerHTML = u ? `<div class="pc-head"><span class="avatar">${esc(initials(u.name))}</span><div><h3>${esc(u.name)}</h3><p>${esc(u.email || 'No email')} · ${esc(b.label)}</p></div></div>
      <div class="pc-stats"><div><b>${st.runs.length}</b><span>workouts</span></div><div><b>${fmtDist(totD)}</b><span>${uName()} total</span></div><div><b>${st.runs.length ? fmtDate(st.runs[0].start, { month: 'short', year: '2-digit' }) : '–'}</b><span>first workout</span></div></div>
      <form id="pEdit" class="form1" hidden><label for="pName">Name<input id="pName" required value="${esc(u.name)}"></label>${b.kind === 'local' ? `<label for="pEmail">Email<input id="pEmail" type="email" value="${esc(u.email || '')}"></label>` : ''}<div class="btns"><button type="submit" class="primary">Save</button><button type="button" id="pCancel">Cancel</button></div></form>
      <div class="btns" id="pBtns">${b.kind === 'local' ? '<button type="button" class="primary" id="pOnline">Save account online</button>' : ''}${online() ? `<button type="button" class="primary" id="pShare">${ICON_SHARE}Share profile</button>` : ''}<button type="button" id="pEditB">Edit details</button>${b.kind === 'local' ? '<button type="button" id="pSwitch">Switch profile</button>' : ''}<button type="button" id="pOut">Sign out</button></div>`
    : `<div class="pc-head"><span class="avatar guest">?</span><div><h3>Guest preview</h3><p>You’re viewing a sample athlete. Nothing is saved.</p></div></div>
      <div class="btns" style="margin-top:16px"><button type="button" class="primary" id="pCreate">${b && b.kind === 'firebase' ? 'Sign in or create account' : 'Create or choose a profile'}</button></div>`;
  if (u) {
    $('#pEditB').onclick = () => { $('#pEdit').hidden = false; $('#pBtns').hidden = true; $('#pName').focus(); };
    $('#pCancel').onclick = () => { $('#pEdit').hidden = true; $('#pBtns').hidden = false; };
    $('#pEdit').onsubmit = async ev => { ev.preventDefault(); const patch = { name: $('#pName').value.trim() || u.name }; if ($('#pEmail')) patch.email = $('#pEmail').value.trim(); st.user = await b.updateProfile(patch); renderChrome(); renderProfile(); };
    if ($('#pSwitch')) $('#pSwitch').onclick = () => showAuth();
    if ($('#pOnline')) $('#pOnline').onclick = saveOnlineDlg;
    if ($('#pShare')) $('#pShare').onclick = shareProfile;
    $('#pOut').onclick = signOut;
  } else $('#pCreate').onclick = () => showAuth();
  // settings
  const S = st.S;
  $('#fHrMax').value = S.hrMax || ''; $('#fHrRest').value = S.hrRest; $('#fAge').value = S.age || ''; $('#fSex').value = S.sex; $('#fWeight').value = S.weight || ''; $('#fHeight').value = S.height || '';
  const bmi = S.weight && S.height ? S.weight / (S.height / 100) ** 2 : null; $('#bmiHint').textContent = bmi ? `BMI ${bmi.toFixed(1)}. Not used in VO₂max (see How it’s calculated).` : 'With weight, gives your BMI.'; $('#fUnits').value = S.units;
  $('#hrMaxHint').innerHTML = st.hm ? 'In use: ' + HRMAX.describe(st.hm) + '.' : 'Empty = automatic.';
  $('#fHrMax').placeholder = st.hm && !S.hrMax ? 'Auto ' + Math.round(S.hrMaxEff) : 'Auto';
  $('#setSaved').textContent = u ? '' : 'Guest changes are not saved.';
  renderGoals(); renderStorage(); renderDataCard(); renderLook(); renderAISettings(); renderMethods();
}
$('#setForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const v = id => { const x = parseFloat($(id).value); return isFinite(x) ? x : null; };
  setWeight(v('#fWeight'));
  const settings = { hrMax: v('#fHrMax'), hrRest: v('#fHrRest') || 55, age: v('#fAge'), sex: $('#fSex').value, weight: st.S.weight, wlog: st.S.wlog || [], height: v('#fHeight'), units: $('#fUnits').value };
  Object.assign(st.S, settings);
  if (st.user) { try { st.user = await st.backend.updateProfile({ settings }); $('#setSaved').textContent = 'Saved. All workouts recalculated.'; } catch (e) { $('#setSaved').textContent = 'Could not save: ' + e.message; } }
  glyphCache.clear(); compute(); renderChrome(); renderProfile();
});
const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    // profiles and workouts: owner only
    match /users/{uid}/{doc=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // share links: anyone with the id can open one; never listed
    match /shares/{id} {
      allow get: if true;
      allow list: if request.auth != null && resource.data.uid == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }
    // feed: signed-in runners read; authors write their own posts
    match /feed/{id} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null && request.resource.data.uid == request.auth.uid
                            && id == request.auth.uid + '_' + request.resource.data.wid;
      allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }
  }
}`;
function renderStorage() {
  const b = st.backend, isOn = b && b.kind === 'firebase';
  $('#storeCard').innerHTML = `<div class="ch"><h3>Storage &amp; sync</h3><span class="chip ${isOn ? 'good' : 'warn'}"><i></i>${isOn ? 'Online account' : 'This device only'}</span></div>
    <div class="stack">
      ${isOn ? `<p class="sub">Everything is saved in your private online account: profile, settings, AI key, workouts and their computed results. Sign in on any device; only what you share or publish can be seen by others.</p>`
      : `<p class="sub">This profile is stored in this browser only. Save it online to keep it safe, sync between devices, share links and use the feed.</p>
        <div class="btns">${st.user ? '<button type="button" class="primary" id="saveOn">Save account online</button>' : '<button type="button" class="primary" id="goOnP">Sign in or create an account</button>'}</div>`}
      <details class="help"><summary>Firestore security rules</summary><div class="formula">${esc(RULES)}</div></details>
    </div>`;
  if ($('#saveOn')) $('#saveOn').onclick = saveOnlineDlg;
  if ($('#goOnP')) $('#goOnP').onclick = () => useBackend('firebase');
}
async function maybeOfferMigration() {
  const pid = lsGet('pp-migrate', null); if (!pid || st.backend.kind !== 'firebase' || !st.user) return;
  const prof = LocalBackend.accounts().find(p => p.id === pid); if (!prof) { lsSet('pp-migrate', null); return; }
  await LocalBackend.init(); const saved = lsGet('pp-session', null); lsSet('pp-session', pid); const list = await LocalBackend.listWorkouts(); lsSet('pp-session', saved);
  if (!list.length) { lsSet('pp-migrate', null); return; }
  const bn = $('#banner'); bn.hidden = false; bn.className = 'banner';
  bn.innerHTML = `<span class="grow"><b>${list.length} workouts</b> from the on-device profile “${esc(prof.name)}” can be copied to your Firebase account.</span><button type="button" class="primary" id="mgGo">Copy to cloud</button><button type="button" class="ghost" id="mgNo">Not now</button>`;
  $('#mgNo').onclick = () => { lsSet('pp-migrate', null); renderChrome(); };
  $('#mgGo').onclick = () => { $('#mgGo').disabled = true; migrateLocal(pid); };
}
// copy an on-device profile's workouts (and, for a brand-new account, its settings) into the online account
async function migrateLocal(pid, settings, auto) {
  setStatus('Copying workouts to your online account…');
  try {
    await LocalBackend.init(); const saved = lsGet('pp-session', null); lsSet('pp-session', pid); const list = await LocalBackend.listWorkouts(); lsSet('pp-session', saved);
    const had = st.runs.length;
    if (settings && !had) st.user = await st.backend.updateProfile({ settings });
    for (let i = 0; i < list.length; i += 20) await st.backend.putWorkouts(list.slice(i, i + 20));
    lsSet('pp-migrate', null); st.runs = await st.backend.listWorkouts(); if (settings && !had) st.S = Object.assign({}, DEFAULT_SETTINGS, st.user.settings);
    refresh(); setStatus(auto ? `Account saved online. ${list.length} workout${list.length === 1 ? '' : 's'} uploaded.` : `Copied ${list.length} workouts to your online account.`);
  } catch (e) { setStatus('Copy failed: ' + (e.message || e)); maybeOfferMigration(); }
}
function renderDataCard() {
  const u = st.user;
  const full = st.runs.filter(r => !r.summary).length, gps = st.runs.filter(r => r.hasGPS).length;
  $('#dataCard').innerHTML = `<div class="ch"><h3>Your data</h3></div>
    <dl class="kv"><dt>Workouts</dt><dd>${st.runs.length}</dd><dt>With full detail</dt><dd>${full}</dd><dt>With GPS route</dt><dd>${gps}</dd><dt>Date range</dt><dd>${st.runs.length ? fmtDate(st.runs[0].start, { day: 'numeric', month: 'short', year: '2-digit' }) + ' – ' + fmtDate(st.runs[st.runs.length - 1].start, { day: 'numeric', month: 'short', year: '2-digit' }) : '–'}</dd></dl>
    <p class="fine" style="margin-top:12px">Each workout is dated by the start time inside its file, so re-importing never shifts your history. A workout that is already imported is skipped, even from a different file type; only a full file can replace an activity-list CSV row.</p>
    ${u ? `<div class="btns" style="margin-top:14px"><label class="btn" for="file">Import files</label>${'webkitdirectory' in HTMLInputElement.prototype && !matchMedia('(pointer: coarse)').matches ? '<label class="btn" for="folder">Import folder</label>' : ''}<button type="button" class="danger" id="delAll">Delete all workouts</button><button type="button" class="danger" id="delAcct">Delete profile</button></div>` : ''}`;
  const arm = (id, text, fn) => { const b = $(id); if (!b) return; b.onclick = async () => { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = text; return; } b.disabled = true; try { await fn(); } catch (e) { setStatus(e.message); } }; };
  arm('#delAll', 'Tap again to delete all', async () => { await st.backend.clearWorkouts(); st.runs = []; glyphCache.clear(); setStatus('All workouts deleted.'); refresh(); });
  arm('#delAcct', 'Tap again to delete profile', async () => { await st.backend.deleteAccount(); st.user = null; setStatus(''); showAuth('Profile deleted.'); });
}

/* ---------- appearance ---------- */
function renderLook() {
  const p = uiPrefs();
  $('#lookCard').innerHTML = `<div class="ch"><h3>Appearance</h3><span class="muted sm">Saved on this device</span></div>
    <div class="stack"><span class="sm" style="font-weight:600;color:var(--ink2)">Theme</span>
    <div class="swatches">${THEMES.map(([id, name, mode, bg, acc]) => { const a = id === 'auto';
      return `<button type="button" data-th="${id}" aria-pressed="${p.theme === id}" style="--sw-bg:${a ? 'linear-gradient(135deg,#0b0f13 50%,#f3f5f0 50%)' : bg};--sw-ink:${mode === 'light' ? '#12170f' : '#eef3f6'};--sw-acc:${a ? 'linear-gradient(90deg,#c6f24e 50%,#3b7d16 50%)' : acc}"><i></i>${name}</button>`; }).join('')}</div>
    <label for="lkFont" class="sm" style="font-weight:600;color:var(--ink2);display:grid;gap:6px">Font style<select id="lkFont">${Object.entries(FONTS).map(([id, [n]]) => `<option value="${id}"${p.font === id ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    <span class="sm" style="font-weight:600;color:var(--ink2)">Text size</span>
    <div class="seg seg-wide" role="group" aria-label="Text size">${SIZES.map(([id, n]) => `<button type="button" data-sz="${id}" aria-pressed="${p.size === id}">${n}</button>`).join('')}</div></div>`;
  $$('#lookCard [data-th]').forEach(b => b.onclick = () => { setUI({ theme: b.dataset.th }); renderLook(); });
  $('#lkFont').onchange = ev => { setUI({ font: ev.target.value }); renderLook(); };
  $$('#lookCard [data-sz]').forEach(b => b.onclick = () => { setUI({ size: b.dataset.sz }); renderLook(); });
}

/* ---------- import ---------- */
const setStatus = t => { $('#status').textContent = t; };
async function importFiles(files) { st.importing = true; try { await importFilesNow(files); } finally { st.importing = false; } }
/* import feedback: a progress bar while reading, then a results sheet listing the imported runs */
function impProgress(text, frac) {
  let el = $('#impbar'); if (!el) { el = document.createElement('div'); el.id = 'impbar'; el.className = 'impbar'; el.setAttribute('role', 'status'); el.innerHTML = '<span class="ai-busy"></span><span class="t"></span><i><b></b></i>'; document.body.appendChild(el); }
  el.hidden = false; el.querySelector('.t').textContent = text; el.querySelector('b').style.width = Math.round(clamp(frac, 0.03, 1) * 100) + '%';
}
const impDone = () => { const el = $('#impbar'); if (el) el.hidden = true; };
function importResult(o) {
  impDone(); setStatus('');
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const chips = [o.added ? badge('good', `+${n(o.added, 'new run', 'new runs')}`) : '', o.upd ? badge('exc', `${n(o.upd, 'run', 'runs')} with full detail`) : '',
    o.dup ? badge('ok', `${o.dup} already imported`) : '', o.other ? badge('warn', `${o.other} not running`) : '', o.bad ? badge('bad', `${n(o.bad, 'file', 'files')} unreadable`) : '',
    o.hr ? badge('top', `Max HR ↑ ${o.hr[1]} bpm`) : ''].join('');
  const list = (o.runs || []).slice().sort((x, y) => y.start - x.start).map(r => { const i = st.idx.get(r.id), e = i != null ? st.res[i] : null, g = routeGlyph(r);
    return `<a class="imp-run" href="#w-${esc(r.id)}"><span class="glyph">${g ? `<svg viewBox="0 0 34 34"><path d="${g}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>` : ''}</span>
      <span class="nm"><b>${esc(r.name)}</b><span>${fmtDate(r.start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
      <span class="m">${e ? `<b>${fmtDist(e.dist)}</b> ${uName()}<span>${fmtDur(e.mov)} · ${fmtPace(e.pace)}</span>` : ''}</span></a>`; }).join('');
  const title = o.title || (o.added || o.upd ? 'Import done' : 'Nothing new');
  openDlg(`<h2>${title}</h2>${o.msg ? `<p>${o.msg}</p>` : ''}<div class="btns" style="margin-bottom:12px">${chips}</div>
    ${list ? `<div class="imp-list">${list}</div>` : ''}
    <div class="btns" style="margin-top:14px">${list ? '<a class="btn primary" href="#workouts" data-close>All workouts</a>' : ''}<button type="button" data-close>${list ? 'Done' : 'OK'}</button></div>`);
  $$('#dlgBody .imp-run, #dlgBody a[data-close]').forEach(a => a.addEventListener('click', () => $('#dlg').close()));
}
async function importFilesNow(files) {
  if (!st.user) { st.pending = files; showAuth(`Create a profile${st.backend.kind === 'firebase' ? ' or sign in' : ''} to keep the ${files.length} file${files.length === 1 ? '' : 's'} you chose. The import continues right after.`); return; }
  const found = [], skipped = { other: 0, bad: 0 }; let seen = 0;
  const handle = async (name, getBuf) => {
    const ext = name.toLowerCase().split('.').pop();
    if (!['fit', 'tcx', 'gpx', 'csv', 'zip'].includes(ext)) return;
    seen++; if (seen % 5 === 0) await new Promise(r => setTimeout(r));
    try {
      const buf = await getBuf();
      if (ext === 'zip') { for (const en of zipEntries(buf)) await handle(en.name, () => inflateEntry(en)); return; }
      if (ext === 'csv') { found.push(...parseCSV(new TextDecoder().decode(buf), st.S.units)); return; }
      const raw = ext === 'fit' ? parseFIT(buf) : ext === 'tcx' ? parseTCX(new TextDecoder().decode(buf)) : parseGPX(new TextDecoder().decode(buf));
      if (!raw) { skipped.bad++; return; }
      if (raw.sport !== 'running') { skipped.other++; return; }
      const g = buildGrid(raw, { src: ext.toUpperCase() }); if (g) found.push(g); else skipped.bad++;
    } catch (err) { skipped.bad++; console.warn(name, err); }
  };
  let k = 0;
  for (const f of files) { k++; impProgress(files.length > 1 ? `Reading ${k} of ${files.length} · ${found.length} runs` : 'Reading file…', (k - 0.5) / files.length * 0.8); await new Promise(r => setTimeout(r, 0)); await handle(f.name, () => f.arrayBuffer()); }
  const base = { other: skipped.other, bad: skipped.bad };
  if (!found.length) { importResult(Object.assign(base, { title: 'No runs found', msg: 'Use Garmin .fit, .tcx, .gpx, .zip or the activities .csv.' })); return; }
  // keep only workouts not already stored (or imported earlier in this batch); upgrade a CSV row to full detail
  const kept = st.runs.slice(), bucket = new Map(), toSave = [], drop = []; let added = 0, upd = 0, dup = 0;
  const key = t => Math.round(t / 60000), near = r => { const k = key(r.start), out = []; for (let m = k - 2; m <= k + 2; m++) out.push(...(bucket.get(m) || [])); return out; };
  const index = r => { const k = key(r.start); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(r); };
  kept.forEach(index);
  for (const r of found.sort((a, b) => a.start - b.start)) {
    const ex = near(r).find(x => kept.includes(x) && sameWorkout(x, r));
    if (!ex) { kept.push(r); index(r); toSave.push(r); added++; continue; }
    if (!betterCopy(r, ex)) { dup++; continue; }
    kept[kept.indexOf(ex)] = r; index(r); toSave.push(r); upd++; if (ex.id !== r.id) drop.push(ex.id);
  }
  if (!toSave.length) { importResult(Object.assign(base, { dup, msg: dup === 1 ? 'That run is already in your history.' : 'These runs are already in your history.' })); return; }
  impProgress(`Saving ${toSave.length} run${toSave.length === 1 ? '' : 's'}…`, 0.9);
  try { await st.backend.putWorkouts(toSave); for (const id of drop) await st.backend.deleteWorkout(id); } catch (e) { impDone(); importResult(Object.assign(base, { title: 'Saving failed', msg: esc(e.message || String(e)) })); return; }
  const hrBefore = st.S.hrMaxEff;
  st.runs = kept; glyphCache.clear(); st.shown = 30; refresh();
  const hr = !st.S.hrMax && st.S.hrMaxEff > hrBefore && st.hm.source === 'detected' ? [Math.round(hrBefore), Math.round(st.S.hrMaxEff)] : null;
  importResult(Object.assign(base, { added, upd, dup, hr, runs: toSave }));
}
['#file', '#folder'].forEach(s => $(s).addEventListener('change', ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) importFiles(fs); }));
let dragN = 0;
addEventListener('dragenter', ev => { if ([...(ev.dataTransfer?.types || [])].includes('Files')) { dragN++; $('#drop').hidden = false; } });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#drop').hidden = true; } });
addEventListener('dragover', ev => ev.preventDefault());
addEventListener('drop', ev => { ev.preventDefault(); dragN = 0; $('#drop').hidden = true; const fs = [...(ev.dataTransfer?.files || [])]; if (fs.length) importFiles(fs); });

/* ---------- resize / theme ---------- */
let rz, lastW = innerWidth; addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => { if (!$('#shell').hidden && ['overview', 'trends', 'workout', 'metric'].includes(st.view)) renderView(); }, 200); });
const repaint = () => { if (!$('#shell').hidden) renderView(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', repaint);
new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-size', 'data-font'] });
document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { clearTimeout(rz); rz = setTimeout(repaint, 150); });

/* ---------- boot ---------- */
// Google sends the home-screen app back with #id_token=…; take it off the address straight away
const G_RETURN = /^#(.*&)?(id_token|error)=/.test(location.hash) && lsGet('pp-greturn', null) ? location.hash : null;
if (G_RETURN) history.replaceState(null, '', location.pathname + location.search);
async function boot() {
  const r = lsGet('pp-range', 182); if ([90, 182, 365, 0].includes(r)) st.range = r; syncRange();
  if (!st.backend) enterGuest(); // instant first frame with the sample athlete
  st.backend = await openBackend();
  if (G_RETURN && st.backend.kind === 'firebase') {
    let after = null;
    try { after = await st.backend.finishGoogle(G_RETURN); }
    catch (e) { showAuth(fireMsg(e)); if (e.after && e.after.save) { lsSet('pp-backend', { kind: 'local' }); lsSet('pp-migrate', null); st.backend = await openBackend(); const u = st.backend.user(); if (u) await enterUser(u); setStatus(fireMsg(e)); } return; }
    await enterUser(st.backend.user());
    if (after && after.save) migrateLocal(after.save, after.settings, true);
    return;
  }
  const u = st.backend.user();
  if (u) await enterUser(u);
  else if (!location.hash.startsWith('#s-') && (st.backend.kind === 'firebase' || st.backend.accounts().length)) showAuth();
  else { renderChrome(); route(); }
}
if (typeof BUILD !== 'undefined') $$('[data-ver]').forEach(el => { el.onclick = () => checkUpdate(true); el.setAttribute('role', 'button'); el.textContent = `Version ${BUILD.v} · ${new Date(BUILD.at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`; el.title = 'Built ' + BUILD.at + ' — tap to check for updates'; el.insertAdjacentHTML('beforeend', ' · <u>Check for updates</u>'); });
/* ---------- update check: GitHub Pages lets browsers cache the page for 10 min; offer the newer version ---------- */
// The app updates itself: on open, when you come back to it, every 15 minutes and on pull-down / "Check for updates".
// It reloads straight away unless you are in the middle of something (a dialog, an import, editing, typing) —
// then a banner waits for you.
const busy = () => $('#dlg').open || st.importing || st.dashEdit || (document.activeElement && document.activeElement.matches('input, textarea, select'));
function toast(t, ms = 2200) {
  let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms);
}
// one-line "In short:" summaries of every version after ours, from change.log
async function whatsNew(from, to) {
  try {
    const log = await (await fetch(location.pathname.replace(/[^/]*$/, '') + 'change.log?check=' + Date.now(), { cache: 'no-store' })).text(), out = [];
    for (let v = to; v > from && out.length < 3; v--) { const m = log.match(new RegExp('\\nv' + v + ' — [^\\n]*\\n([\\s\\S]*?)(?=\\nv\\d+ — |$)')); if (!m) continue;
      const short = (m[1].match(/In short:\s*(.+)/) || [, m[1].trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 120)])[1]; out.push([v, short.trim()]); }
    return out;
  } catch (e) { return []; }
}
const newsText = news => news.map(([v, t]) => (news.length > 1 ? `v${v}: ` : '') + t).join(' · ');
const applyUpdate = (v, news) => { lsSet('pp-updated', { v: +v, news }); toast(`Updating to version ${v}…${news.length ? ' ' + newsText(news) : ''}`, 6000); setTimeout(() => location.replace(location.pathname + '?v=' + v + location.hash), 1600); };
async function checkUpdate(manual) {
  if (typeof BUILD === 'undefined' || !/^https?:/.test(location.protocol)) { if (manual) toast('Updates are checked when the app runs from the web.'); return; }
  try {
    const t = await (await fetch(location.pathname + '?check=' + Date.now(), { cache: 'no-store' })).text(), m = t.match(/const BUILD = \{ v: (\d+)/);
    if (!m || +m[1] <= BUILD.v) { if (manual) toast(`You have the latest version (${BUILD.v}).`); return; }
    const news = await whatsNew(BUILD.v, +m[1]);
    if (!busy()) return applyUpdate(m[1], news);
    if ($('#upd')) return;
    const d = document.createElement('div'); d.id = 'upd'; d.className = 'banner'; d.innerHTML = `<span class="grow"><b>Version ${m[1]} is ready.</b> ${esc(newsText(news))}</span><button type="button" class="primary">Update now</button>`;
    d.querySelector('button').onclick = () => applyUpdate(m[1], news); $('#main').prepend(d);
  } catch (e) { if (manual) toast('No connection — try again later.'); }
}
// after an update: show once what it brought
setTimeout(() => { const u = lsGet('pp-updated', null); if (!u || typeof BUILD === 'undefined' || u.v !== BUILD.v) return; lsSet('pp-updated', null);
  const d = document.createElement('div'); d.className = 'banner'; d.innerHTML = `<span class="grow"><b>Updated to version ${u.v}.</b> ${esc(newsText(u.news || []))}</span><button type="button" class="ghost">OK</button>`;
  d.querySelector('button').onclick = () => d.remove(); $('#main').prepend(d); }, 600);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
addEventListener('pageshow', ev => { if (ev.persisted) checkUpdate(); }); // iOS restores home-screen apps from memory
setTimeout(checkUpdate, 3000); setInterval(() => { if (!document.hidden) checkUpdate(); }, 15 * 60000);
// pull down at the top of the page: check for updates and redraw, like a native app's pull-to-refresh
(() => {
  let y0 = null, dy = 0; const ind = document.createElement('div'); ind.className = 'ptr'; ind.innerHTML = '<span class="ai-busy"></span>'; document.body.appendChild(ind);
  document.addEventListener('touchstart', e => { y0 = scrollY <= 0 && e.touches.length === 1 && !$('#dlg').open && !(e.target.closest && e.target.closest('.map, .plot, .smap, input, textarea')) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  document.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); ind.style.transform = `translate(-50%, ${Math.min(dy, 110) - 50}px)`; ind.classList.toggle('ready', dy > 80); ind.style.opacity = Math.min(1, dy / 80); }, { passive: true });
  document.addEventListener('touchend', () => { if (y0 == null) return; const go = dy > 80; y0 = null; ind.style.transform = ''; ind.style.opacity = 0; ind.classList.remove('ready'); if (go) { checkUpdate(true); if (!$('#shell').hidden) refresh(); } });
})();
// native feel: iOS Safari ignores user-scalable=no, so block its pinch gestures directly (the route map has its own pinch)
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// installable app (home screen / Chrome install): offline copy via the service worker
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
initSocial(); initDash(); initAlgo();
boot();
