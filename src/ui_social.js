// ===== ONLINE: save account online, share links, feed =====
// Loaded before ui_main.js; everything here runs at call time, after ui_main's helpers exist.
const ICON_SHARE = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2M5 4.8 8 2l3 2.8M3 8v6h10V8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const online = () => !!(st.user && st.backend && st.backend.kind === 'firebase');
const clean = o => JSON.parse(JSON.stringify(o)); // Firestore rejects undefined; NaN becomes null
const numOr = x => (x == null || x === '' || !isFinite(+x)) ? null : +x;

/* ---------- dialog ---------- */
function openDlg(html) {
  const d = $('#dlg');
  $('#dlgBody').innerHTML = `<button type="button" class="x" aria-label="Close" data-close>×</button>` + html;
  d.querySelectorAll('[data-close]').forEach(b => b.onclick = () => d.close());
  if (!d.open) d.showModal();
  return d;
}
function closeDlg() { const d = $('#dlg'); if (d.open) d.close(); }

/* ---------- routes for sharing ---------- */
function routeFlat(r, max = 400) {
  if (!r.hasGPS) return null;
  const out = [], step = Math.max(1, Math.floor(r.n / max));
  for (let i = 0; i < r.n; i += step) if (!isNaN(r.dla[i])) out.push(+(r.lat0 + r.dla[i]).toFixed(5), +(r.lon0 + r.dlo[i]).toFixed(5));
  return out.length >= 4 ? out : null;
}
// Static tile map of a flat [lat, lon, lat, lon, …] route. Used for shared links and feed posts.
function staticMap(el, flat) {
  const pts = [];
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) { const a = +flat[i], o = +flat[i + 1]; if (isFinite(a) && isFinite(o) && Math.abs(a) < 85 && Math.abs(o) <= 180) pts.push([a, o]); }
  if (pts.length < 2) { el.remove(); return; }
  const W = el.clientWidth || 600, H = el.clientHeight || 260;
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
  for (const [a, o] of pts) { la0 = Math.min(la0, a); la1 = Math.max(la1, a); lo0 = Math.min(lo0, o); lo1 = Math.max(lo1, o); }
  let z; for (z = 17; z > 2; z--) if (wx(lo1, z) - wx(lo0, z) <= W - 40 && wy(la0, z) - wy(la1, z) <= H - 40) break;
  const x0 = (wx(lo0, z) + wx(lo1, z)) / 2 - W / 2, y0 = (wy(la0, z) + wy(la1, z)) / 2 - H / 2, N = 2 ** z;
  let im = '';
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) {
    if (ty < 0 || ty >= N) continue;
    im += `<img alt="" draggable="false" loading="lazy" src="https://tile.openstreetmap.org/${z}/${((tx % N) + N) % N}/${ty}.png" style="left:${tx * 256 - x0}px;top:${ty * 256 - y0}px">`;
  }
  const P = pts.map(([a, o]) => [wx(o, z) - x0, wy(a, z) - y0]);
  const d = P.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  const s = P[0], e = P[P.length - 1];
  el.innerHTML = `<div class="tiles"></div><svg aria-label="Route map"><path d="${d}" stroke="var(--surface)" stroke-width="7" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/><path d="${d}" stroke="var(--accent)" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${e[0]}" cy="${e[1]}" r="6" fill="var(--ink)" stroke="var(--surface)" stroke-width="2.5"/><circle cx="${s[0]}" cy="${s[1]}" r="6" fill="var(--good)" stroke="var(--surface)" stroke-width="2.5"/></svg>
    <div class="attr" hidden>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>`;
  const tiles = el.querySelector('.tiles'); tiles.innerHTML = im;
  tiles.querySelectorAll('img').forEach(img => { img.onload = () => { el.querySelector('.attr').hidden = false; }; img.onerror = () => img.remove(); });
}

/* ---------- chart → image ---------- */
async function chartPng(card) {
  const svg = card.querySelector('.plot svg'); if (!svg) throw new Error('This chart has no data to share yet.');
  const vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
  const title = (card.querySelector('h3') || {}).textContent || 'Chart';
  const res = t => t.replace(/var\((--[\w-]+)\)/g, (m, n) => (css(n) || '#888').replace(/"/g, "'"));
  const style = `<style>.ax{fill:${css('--muted')};font:11px monospace}.grid{stroke:${css('--line')};stroke-width:1}.base{stroke:${css('--ink2')};stroke-width:1;opacity:.5}.xh,.hl{display:none}</style>`;
  const markup = res(svg.outerHTML).replace(/^<svg([^>]*)>/, (m, a) => `<svg${/xmlns=/.test(a) ? '' : ' xmlns="http://www.w3.org/2000/svg"'} width="${W}" height="${H}"${a}>${style}`);
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup); await img.decode();
  const legend = [...card.querySelectorAll('.legend span')].map(s => [s.textContent, res((s.querySelector('i') || {}).style?.background || '') || css('--accent')]);
  const k = 2, pad = 20, head = 44 + (legend.length ? 24 : 0), cw = W + 2 * pad, chh = H + head + pad + 18;
  const cv = document.createElement('canvas'); cv.width = cw * k; cv.height = chh * k;
  const g = cv.getContext('2d'); g.scale(k, k);
  g.fillStyle = css('--surface'); g.fillRect(0, 0, cw, chh);
  g.fillStyle = css('--ink'); g.font = '600 20px "Barlow Condensed", sans-serif'; g.fillText(title.toUpperCase(), pad, 32);
  let lx = pad; g.font = '13px "Source Sans 3", sans-serif';
  for (const [t, c] of legend) { g.fillStyle = c; g.fillRect(lx, 50, 10, 10); g.fillStyle = css('--ink2'); g.fillText(t, lx + 15, 59); lx += 30 + g.measureText(t).width; }
  g.drawImage(img, pad, head, W, H);
  g.fillStyle = css('--muted'); g.font = '12px "Source Sans 3", sans-serif'; g.fillText('Pace & Pulse' + (st.user ? ' · ' + st.user.name : ''), pad, chh - 10);
  let url = cv.toDataURL('image/png'); if (url.length > 800000) url = cv.toDataURL('image/jpeg', 0.85);
  return url;
}
function addChartShare() {
  $$('.chart-card').forEach(c => {
    let b = c.querySelector('.share-btn');
    if (!b) {
      const h = c.querySelector('h3'); if (!h) return;
      let row = h.parentElement.classList.contains('ch') ? h.parentElement : null;
      if (!row) { row = document.createElement('div'); row.className = 'ch'; row.style.marginBottom = '2px'; h.before(row); row.appendChild(h); }
      b = document.createElement('button'); b.type = 'button'; b.className = 'share-btn ghost'; b.setAttribute('aria-label', 'Share chart');
      b.innerHTML = ICON_SHARE + '<span>Share</span>'; b.onclick = () => shareChart(c); row.appendChild(b);
    }
    b.hidden = !online() || !!c.closest('#v-shared');
  });
}
async function shareChart(card) {
  openDlg('<h2>Share chart</h2><p>Making an image…</p>');
  try { const img = await chartPng(card); await shareThing({ type: 'chart', title: (card.querySelector('h3') || {}).textContent || 'Chart', by: st.user.name, img }, 'chart'); }
  catch (e) { openDlg(`<h2>Could not share</h2><p>${esc(e.message || e)}</p>`); }
}

/* ---------- share links ---------- */
async function shareThing(data, label) {
  openDlg(`<h2>Share ${esc(label)}</h2><p>Creating a link…</p>`);
  let id;
  try { id = await st.backend.createShare(clean(data)); }
  catch (e) { openDlg(`<h2>Could not share</h2><p>${esc(fireMsg(e))}</p>`); return; }
  const url = location.origin + location.pathname + '#s-' + id;
  openDlg(`<h2>Share ${esc(label)}</h2><p>Anyone with this link can see this ${esc(label)} — nothing else. Your profile stays private.</p>
    ${data.img ? `<img src="${data.img}" alt="">` : ''}
    <div class="linkrow"><input id="shUrl" readonly value="${esc(url)}" aria-label="Share link"><button type="button" class="primary" id="shCopy">Copy</button></div>
    <div class="btns" style="margin-top:12px">${navigator.share ? '<button type="button" id="shNative">Share…</button>' : ''}${data.img ? '<a class="btn" id="shImg" download="pace-pulse.png">Save image</a>' : ''}<button type="button" class="danger" id="shStop">Stop sharing</button></div>`);
  $('#shCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(url); } catch (e) { $('#shUrl').select(); document.execCommand('copy'); }
    $('#shCopy').textContent = 'Copied';
  };
  if ($('#shImg')) $('#shImg').href = data.img;
  if ($('#shNative')) $('#shNative').onclick = async () => {
    const o = { title: data.title, url };
    try {
      if (data.img) { const blob = await (await fetch(data.img)).blob(), f = new File([blob], 'pace-pulse.' + (blob.type === 'image/jpeg' ? 'jpg' : 'png'), { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] })) o.files = [f]; }
      await navigator.share(o);
    } catch (e) { /* user cancelled */ }
  };
  $('#shStop').onclick = async () => { try { await st.backend.deleteShare(id); closeDlg(); setStatus('Share link removed.'); } catch (e) { setStatus('Could not remove link: ' + fireMsg(e)); } };
}
function shareWorkout(r, e) {
  const n = r.n, step = Math.max(1, Math.ceil(n / 200)), sp = r.summary ? null : smooth(Array.from(r.d, (x, i) => i ? (x - r.d[i - 1]) / DT : 0), 15), hrS = r.summary ? null : smooth(r.hr, 5);
  const pace = [], hr = [];
  if (sp) for (let i = 0; i < n; i += step) { pace.push(r.mv[i] && sp[i] > 1.2 ? Math.round(1000 / sp[i]) : 0); hr.push(hrS[i] > 0 ? Math.round(hrS[i]) : 0); }
  shareThing({ type: 'workout', title: r.name, by: st.user.name, name: r.name, start: r.start, dist: e.dist, mov: e.mov, pace: e.pace, gap: e.gapPace, avgHR: e.avgHR, maxHR: e.maxHR,
    ascent: e.ascent, cad: e.cad, est: e.est, load: e.load, route: routeFlat(r), step: step * DT, paceS: pace, hrS: hr.some(x => x) ? hr : null }, 'workout');
}
function shareProfile() {
  const D = st.days.length ? st.days[st.days.length - 1] : null, totD = st.res.reduce((s, e) => s + (e.dist || 0), 0), totT = st.res.reduce((s, e) => s + (e.mov || 0), 0);
  const recent = st.runs.map((r, i) => [r, st.res[i]]).slice(-10).reverse().map(([r, e]) => ({ name: r.name, start: r.start, dist: e.dist, mov: e.mov, avgHR: e.avgHR }));
  const weeks = weekly().slice(-16).map(w => [w[0], Math.round(w[1] * U()), w[2]]);
  shareThing({ type: 'profile', title: st.user.name, by: st.user.name, name: st.user.name, n: st.runs.length, dist: totD, mov: totT, first: st.runs.length ? st.runs[0].start : null,
    vo2: D && D.vo2, end: D && D.end, tier: D && D.end ? tierOf(D.end) : null, recent, weeks }, 'profile');
}

/* ---------- shared view (#s-<id>) ---------- */
async function renderShared(id) {
  const box = $('#v-shared'); box.innerHTML = '<p class="empty">Loading…</p>';
  const cfg = fbConfig();
  if (!cfg) { box.innerHTML = '<p class="empty">Sharing is not set up in this copy of the app.</p>'; return; }
  let s;
  try { await FirebaseBackend.init(cfg); s = await FirebaseBackend.getShare(id); }
  catch (e) { if (st.detail === id) box.innerHTML = `<p class="empty">Could not open this link. ${esc(fireMsg(e))}</p>`; return; }
  if (st.view !== 'shared' || st.detail !== id) return;
  if (!s) { box.innerHTML = '<p class="empty">This link was removed by its owner.</p>'; return; }
  const by = s.by ? `Shared by ${esc(s.by)}` : 'Shared';
  const stat = (l, v, u = '') => `<div class="stat"><span>${l}</span><b>${v}${u ? `<small>${u}</small>` : ''}</b></div>`;
  const foot = `<p class="fine" style="margin-top:20px">${by} with Pace &amp; Pulse. <a href="#overview">Open the app</a></p>`;
  if (s.type === 'chart') {
    const ok = typeof s.img === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s.img);
    box.innerHTML = `<div class="vh"><div><p class="eyebrow">${by}</p><h2>${esc(s.title)}</h2></div></div>${ok ? `<img class="shared-img" src="${s.img}" alt="${esc(s.title)}">` : '<p class="empty">Image missing.</p>'}${foot}`;
  } else if (s.type === 'workout') {
    const when = numOr(s.start) ? new Date(+s.start).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    box.innerHTML = `<div class="wd-head"><div><p class="eyebrow">${by}</p><h2>${esc(s.name)}</h2><p>${esc(when)}</p></div></div>
      <div class="stats">${stat('Distance', fmtDist(numOr(s.dist)), uName())}${stat('Moving time', fmtDur(numOr(s.mov)))}${stat('Avg pace', fmtPace(numOr(s.pace)), '/' + uName())}
      ${stat('Grade-adj. pace', fmtPace(numOr(s.gap)), '/' + uName())}${stat('Avg HR', numOr(s.avgHR) ? Math.round(s.avgHR) : '–', 'bpm')}${stat('Max HR', numOr(s.maxHR) ? Math.round(s.maxHR) : '–', 'bpm')}
      ${stat('Ascent', numOr(s.ascent) != null ? Math.round(s.ascent) : '–', 'm')}${stat('Cadence', numOr(s.cad) ? Math.round(s.cad) : '–', 'spm')}${stat('VO₂max est.', numOr(s.est) ? f1(+s.est) : '–')}</div>
      <div class="wd-grid">${Array.isArray(s.route) ? '<div class="card span2"><h3 style="margin-bottom:10px">Route</h3><div class="smap" id="shMap"></div></div>' : ''}
      ${Array.isArray(s.paceS) && s.paceS.length ? '<div class="card chart-card"><h3>Pace</h3><div class="plot" id="shPace"></div></div>' : ''}
      ${Array.isArray(s.hrS) ? '<div class="card chart-card"><h3>Heart rate</h3><div class="plot" id="shHr"></div></div>' : ''}</div>${foot}`;
    if ($('#shMap')) staticMap($('#shMap'), s.route);
    const stp = (numOr(s.step) || 2) / 60, xo = { xTime: false, xFmt: v => v + "'", tipX: v => fmtDur(v * 60), height: 190 };
    if ($('#shPace')) {
      const pts = s.paceS.map((v, i) => [i * stp, numOr(v) || null]), pv = pts.filter(p => p[1]).map(p => p[1]).sort((a, b) => a - b);
      const lo = pv[Math.floor(pv.length * 0.02)], hi = pv[Math.floor(pv.length * 0.98)];
      plot($('#shPace'), Object.assign({}, xo, { invert: true, yMin: lo, yMax: hi, label: 'Pace', series: [{ name: 'Pace', kind: 'line', color: css('--accent'), end: false, pts: pts.map(p => [p[0], p[1] == null ? null : clamp(p[1], lo || 0, hi || 1e9)]), fmt: v => fmtPace(v) + '/' + uName() }], yFmt: v => fmtPace(v) }));
    }
    if ($('#shHr')) plot($('#shHr'), Object.assign({}, xo, { label: 'Heart rate', series: [{ name: 'Heart rate', kind: 'line', color: css('--hr'), end: false, pts: s.hrS.map((v, i) => [i * stp, numOr(v) || null]), fmt: v => Math.round(v) + ' bpm' }] }));
  } else if (s.type === 'profile') {
    const rec = Array.isArray(s.recent) ? s.recent : [];
    box.innerHTML = `<div class="card"><div class="pc-head"><span class="avatar">${esc(initials(s.name))}</span><div><p class="eyebrow">${by}</p><h3>${esc(s.name)}</h3></div></div>
      <div class="pc-stats"><div><b>${f0(numOr(s.n))}</b><span>workouts</span></div><div><b>${fmtDist(numOr(s.dist))}</b><span>${uName()} total</span></div><div><b>${fmtDur(numOr(s.mov))}</b><span>total time</span></div></div>
      <div class="pc-stats"><div><b>${numOr(s.vo2) ? f1(+s.vo2) : '–'}</b><span>VO₂max</span></div><div><b>${numOr(s.end) ? f0(+s.end) : '–'}</b><span>${esc(s.tier || 'Endurance score')}</span></div><div><b>${numOr(s.first) ? fmtDate(+s.first, { month: 'short', year: '2-digit' }) : '–'}</b><span>first workout</span></div></div></div>
      ${Array.isArray(s.weeks) && s.weeks.length ? '<div class="card chart-card" style="margin-top:12px"><h3>Weekly distance</h3><div class="plot" id="shWeek"></div></div>' : ''}
      ${rec.length ? `<div class="card" style="margin-top:12px"><div class="ch"><h3>Recent workouts</h3></div><div class="scroll-x"><table class="tb"><thead><tr><th>Date</th><th>Workout</th><th class="n">Dist ${uName()}</th><th class="n">Time</th><th class="n">Avg HR</th></tr></thead><tbody>${rec.map(w =>
        `<tr><td>${numOr(w.start) ? fmtDate(+w.start, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</td><td>${esc(w.name)}</td><td class="n">${fmtDist(numOr(w.dist))}</td><td class="n">${fmtDur(numOr(w.mov))}</td><td class="n">${numOr(w.avgHR) ? Math.round(w.avgHR) : '–'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}${foot}`;
    if ($('#shWeek')) { const pts = s.weeks.map(w => [numOr(w[0]), (numOr(w[1]) || 0) / U(), numOr(w[2]) || 0]).filter(p => p[0]);
      plot($('#shWeek'), { label: 'Weekly distance', zero: true, xMin: pts[0][0] - 3.5 * DAY, xMax: pts[pts.length - 1][0] + 3.5 * DAY, series: [{ name: 'Distance', kind: 'bars', bw: 7 * DAY, color: css('--accent'), pts, fmt: (v, p) => `${v.toFixed(1)} ${uName()} · ${p[2]} run${p[2] === 1 ? '' : 's'}` }], tipX: t => 'Week of ' + fmtDate(t - 3.5 * DAY) }); }
  } else box.innerHTML = '<p class="empty">Unknown shared item.</p>';
}

/* ---------- save account online ---------- */
function saveOnlineDlg() {
  const cfg = fbConfig(), u = st.user;
  if (!cfg) { openDlg('<h2>Online accounts aren’t set up</h2><p>This copy of the app has no Firebase project yet. Add one under Profile → Storage → Online account setup.</p>'); return; }
  const ready = FirebaseBackend.init(cfg).catch(e => e); // load the SDK now so Google’s popup opens straight from the click
  let mode = 'up';
  const draw = () => {
    const up = mode === 'up';
    openDlg(`<h2>Save account online</h2>
      <p>Copies “${esc(u.name)}”, its settings and ${st.runs.length} workout${st.runs.length === 1 ? '' : 's'} to a private online account. Sign in on any device; nobody else can see it. The copy on this device stays.</p>
      <div class="seg seg-wide" role="tablist"><button type="button" role="tab" id="soUp" aria-selected="${up}">Create account</button><button type="button" role="tab" id="soIn" aria-selected="${!up}">I have an account</button></div>
      <form id="soF" class="form1" style="margin-top:12px">
        ${up ? `<label for="soName">Name<input id="soName" autocomplete="name" value="${esc(u.name)}"></label>` : ''}
        <label for="soEmail">Email<input id="soEmail" type="email" required autocomplete="email" value="${esc(u.email || '')}"></label>
        <label for="soPass">Password<input id="soPass" type="password" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}"></label>
        <p class="form-err" id="soErr" hidden></p>
        <button class="primary wide" type="submit" id="soGo">${up ? 'Create account and upload' : 'Sign in and upload'}</button>
      </form>
      <button type="button" class="wide" id="soG" style="margin-top:8px">Continue with Google</button>`);
    $('#soUp').onclick = () => { mode = 'up'; draw(); }; $('#soIn').onclick = () => { mode = 'in'; draw(); };
    $('#soF').onsubmit = ev => { ev.preventDefault(); go({ name: $('#soName') ? $('#soName').value.trim() : '', email: $('#soEmail').value.trim(), password: $('#soPass').value }); };
    $('#soG').onclick = () => go({ google: true });
  };
  const go = async c => {
    const err = $('#soErr'), btns = $$('#dlgBody button'); err.hidden = true; btns.forEach(b => b.disabled = true);
    const say = t => { err.textContent = t; err.hidden = false; err.style.color = 'var(--ink2)'; };
    try {
      const r0 = await ready; if (r0 instanceof Error) throw r0;
      const settings = Object.assign({}, DEFAULT_SETTINGS, u.settings || {});
      if (c.google) await FirebaseBackend.signIn({ google: true });
      else if (mode === 'up') await FirebaseBackend.signUp({ name: c.name || u.name, email: c.email, password: c.password, settings });
      else await FirebaseBackend.signIn({ email: c.email, password: c.password });
      if (mode !== 'up' || c.google) { const has = await FirebaseBackend._col().limit(1).get(); if (has.empty) await FirebaseBackend.updateProfile({ settings, name: FirebaseBackend.profile.name || u.name }); }
      const list = st.runs.slice();
      for (let i = 0; i < list.length; i += 20) { say(`Uploading workouts… ${i} of ${list.length}`); await FirebaseBackend.putWorkouts(list.slice(i, i + 20)); }
      lsSet('pp-backend', { kind: 'firebase' }); st.backend = FirebaseBackend; closeDlg();
      await enterUser(FirebaseBackend.user());
      setStatus(`Account saved online. ${list.length} workout${list.length === 1 ? '' : 's'} uploaded.`);
    } catch (e) { err.style.color = ''; err.textContent = fireMsg(e); err.hidden = false; btns.forEach(b => b.disabled = false); }
  };
  draw();
}
async function useBackend(kind) {
  lsSet('pp-backend', { kind });
  st.backend = await openBackend(); st.user = null;
  showAuth(st.backend.fallbackError || undefined);
}

/* ---------- feed ---------- */
async function loadPublished() {
  st.published = new Set();
  if (!online()) return;
  try { (await st.backend.listFeed('mine')).forEach(p => st.published.add(p.wid)); if (st.view === 'workout') renderView(); } catch (e) { console.warn(e); }
}
function publishDlg(r, e) {
  const on = st.published && st.published.has(r.id);
  openDlg(`<h2>${on ? 'Update feed post' : 'Publish to feed'}</h2>
    <p>Signed-in runners will see this workout in the feed with your name. Your profile and other workouts stay private.</p>
    <label class="chk"><input type="checkbox" checked disabled> Name, date, distance, time and pace</label>
    <label class="chk"><input type="checkbox" id="pbHr" ${e.avgHR ? 'checked' : 'disabled'}> Average and max heart rate</label>
    <label class="chk"><input type="checkbox" id="pbRoute" ${r.hasGPS ? 'checked' : 'disabled'}> GPS route map <span class="opt">(shows where you started)</span></label>
    <p class="form-err" id="pbErr" hidden></p>
    <div class="btns" style="margin-top:8px"><button type="button" class="primary" id="pbGo">${on ? 'Update post' : 'Publish'}</button>${on ? '<button type="button" class="danger" id="pbDel">Remove from feed</button>' : ''}</div>`);
  const fail = x => { $('#pbErr').textContent = fireMsg(x); $('#pbErr').hidden = false; };
  $('#pbGo').onclick = async () => {
    $('#pbGo').disabled = true;
    const post = { wid: r.id, name: r.name, start: r.start, dist: e.dist, mov: e.mov, pace: e.pace, ascent: e.ascent };
    if ($('#pbHr').checked) { post.avgHR = e.avgHR; post.maxHR = e.maxHR; }
    if ($('#pbRoute').checked) post.route = routeFlat(r, 300);
    try { await st.backend.publish(clean(post)); st.published.add(r.id); closeDlg(); setStatus(`“${r.name}” is in the feed.`); renderView(); }
    catch (x) { $('#pbGo').disabled = false; fail(x); }
  };
  if ($('#pbDel')) $('#pbDel').onclick = async () => {
    try { await st.backend.unpublish(r.id); st.published.delete(r.id); closeDlg(); setStatus(`“${r.name}” removed from the feed.`); renderView(); } catch (x) { fail(x); }
  };
}
async function renderFeed() {
  st.feedMode = st.feedMode || 'all';
  $$('#feedMode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === st.feedMode)));
  $('#feedMode').hidden = !online();
  const box = $('#feedList');
  if (!online()) {
    box.innerHTML = `<div class="card"><h3 style="margin-bottom:8px">Join the feed</h3><p class="muted" style="margin-bottom:14px">The feed shows workouts that runners publish — name, time, distance, heart rate and route. It needs an online account; your profile itself stays private.</p>
      ${st.user && fbConfig() ? '<button type="button" class="primary" id="fdSave">Save account online</button>' : fbConfig() ? '<button type="button" class="primary" id="fdIn">Sign in or create an online account</button>' : '<p class="fine">Online accounts are not set up in this copy of the app.</p>'}</div>`;
    if ($('#fdSave')) $('#fdSave').onclick = saveOnlineDlg;
    if ($('#fdIn')) $('#fdIn').onclick = () => useBackend('firebase');
    return;
  }
  const mode = st.feedMode; box.innerHTML = '<p class="empty">Loading feed…</p>';
  let posts;
  try { posts = await st.backend.listFeed(mode); } catch (e) { box.innerHTML = `<p class="empty">Could not load the feed. ${esc(fireMsg(e))}</p>`; return; }
  if (st.view !== 'feed' || st.feedMode !== mode) return;
  const me = st.user.id, fol = new Set(st.user.following || []);
  if (!posts.length) {
    box.innerHTML = `<p class="empty">${mode === 'following' ? 'Follow runners from the Everyone tab to see their workouts here.' : mode === 'mine' ? 'Nothing published yet. Open a workout and choose “Publish to feed”.' : 'No workouts published yet. Be the first: open a workout and choose “Publish to feed”.'}</p>`;
    return;
  }
  box.innerHTML = posts.map((p, k) => {
    const mine = p.uid === me;
    return `<article class="card post"><div class="post-h"><span class="avatar">${esc(initials(p.author))}</span><div class="who"><b>${esc(p.author || 'Runner')}${mine ? ' <span class="opt">(you)</span>' : ''}</b>
      <span>${numOr(p.start) ? new Date(+p.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
      ${mine ? `<button type="button" class="ghost danger" data-del="${esc(p.wid)}">Remove</button>` : `<button type="button" class="${fol.has(p.uid) ? 'ghost' : 'primary'}" data-fol="${esc(p.uid)}">${fol.has(p.uid) ? 'Following' : 'Follow'}</button>`}</div>
      <h3>${mine && p.wid ? `<a href="#w-${esc(p.wid)}" style="color:inherit">${esc(p.name)}</a>` : esc(p.name)}</h3>
      <div class="post-stats"><div><span>Distance</span><b>${fmtDist(numOr(p.dist))} <small>${uName()}</small></b></div><div><span>Time</span><b>${fmtDur(numOr(p.mov))}</b></div><div><span>Pace</span><b>${fmtPace(numOr(p.pace))} <small>/${uName()}</small></b></div>
      ${numOr(p.avgHR) ? `<div><span>Avg HR</span><b>${Math.round(p.avgHR)} <small>bpm</small></b></div>` : ''}${numOr(p.ascent) ? `<div><span>Ascent</span><b>${Math.round(p.ascent)} <small>m</small></b></div>` : ''}</div>
      ${Array.isArray(p.route) ? `<div class="smap" data-k="${k}"></div>` : ''}</article>`;
  }).join('');
  $$('#feedList .smap').forEach(el => staticMap(el, posts[+el.dataset.k].route));
  $$('#feedList [data-fol]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { st.user = await st.backend.follow(b.dataset.fol, !fol.has(b.dataset.fol)); renderFeed(); } catch (e) { setStatus(fireMsg(e)); b.disabled = false; }
  });
  $$('#feedList [data-del]').forEach(b => b.onclick = async () => {
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again'; return; }
    try { await st.backend.unpublish(b.dataset.del); st.published && st.published.delete(b.dataset.del); renderFeed(); } catch (e) { setStatus(fireMsg(e)); }
  });
}
function initSocial() {
  const d = $('#dlg');
  d.addEventListener('click', ev => { if (ev.target !== d) return; const r = d.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) d.close(); });
  $$('#feedMode button').forEach(b => b.onclick = () => { st.feedMode = b.dataset.f; renderFeed(); });
  $('#goOnline').onclick = () => useBackend('firebase');
  $('#goLocal').onclick = () => useBackend('local');
}
// ===== END ONLINE =====
