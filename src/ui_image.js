// ===== WORKOUT IMAGE: a shareable card (map or route, chosen stats, laps) drawn on a canvas =====
const IMG_FIELDS = [ // [key, label] — each can be switched off
  ['dist', 'Distance'], ['time', 'Moving time'], ['pace', 'Avg pace'], ['hr', 'Avg heart rate'], ['ascent', 'Elevation gain'],
  ['descent', 'Elevation loss'], ['cad', 'Cadence'], ['vo2', 'VO₂max estimate'], ['laps', 'Laps'], ['title', 'Name & date'], ['brand', 'App name'],
];
const tileCache = new Map();
function loadTile(url) {
  if (!tileCache.has(url)) tileCache.set(url, new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; setTimeout(() => res(null), 6000); }));
  return tileCache.get(url);
}
function imgPrefs() { return Object.assign({ bg: 'map', size: 'square', off: [] }, lsGet('pp-img', {})); }

async function drawWorkoutImage(r, e, p) {
  const W = 1080, H = p.size === 'story' ? 1920 : 1350, pad = 64, on = k => !p.off.includes(k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const C = n => css(n), disp = css('--display') || 'sans-serif', body = css('--body') || 'sans-serif', mono = css('--mono') || 'monospace';
  const font = (w, px, f) => `${w} ${px}px ${f}`;
  g.fillStyle = C('--bg'); g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, W * 1.1); glow.addColorStop(0, C('--accent') + '26'); glow.addColorStop(1, 'transparent'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  let y = pad;
  // stats
  const stats = [];
  if (on('dist')) stats.push(['Distance', fmtDist(e.dist), uName()]);
  if (on('time')) stats.push(['Time', fmtDur(e.mov), '']);
  if (on('pace')) stats.push(['Pace', fmtPace(e.pace), '/' + uName()]);
  if (on('hr') && e.avgHR) stats.push(['Avg HR', Math.round(e.avgHR), 'bpm']);
  if (on('ascent') && e.ascent != null) stats.push(['Elev gain', Math.round(e.ascent), 'm']);
  if (on('descent') && e.descent != null) stats.push(['Elev loss', Math.round(e.descent), 'm']);
  if (on('cad') && e.cad) stats.push(['Cadence', Math.round(e.cad), 'spm']);
  if (on('vo2') && e.est) stats.push(['VO₂max', e.est.toFixed(1), '']);
  const noMap = p.bg === 'none' || !r.hasGPS;
  const cols = noMap ? 2 : p.size === 'story' || stats.length <= 6 ? 3 : 4, rowH = noMap ? 190 : cols === 4 ? 118 : 130, vpx = noMap ? 104 : cols === 4 ? 58 : 68, statsH = Math.ceil(stats.length / cols) * rowH;
  const laps = on('laps') && !r.summary ? splitsOf(r, U()) : [], lapsH = laps.length ? (laps.length > 14 ? 220 : Math.min(300, 34 * laps.length + 40)) : 0;
  const headH = (on('brand') ? 56 : 0) + (on('title') ? 132 : 0), foot = 40, mapH = noMap ? 0 : Math.max(260, H - pad - headH - statsH - lapsH - foot - pad - 40 - (lapsH ? 30 : 0));
  // without a map, centre the content vertically
  if (noMap) y = Math.max(pad, (H - headH - statsH - (lapsH ? lapsH + 60 : 0)) / 2);
  // header
  if (on('brand')) { g.fillStyle = C('--accent'); g.fillRect(pad, y + 4, 26, 26); g.fillStyle = C('--ink2'); g.font = font(700, 26, disp); g.fillText('PACE & PULSE', pad + 40, y + 27); y += 56; }
  if (on('title')) {
    g.fillStyle = C('--ink'); g.font = font(700, 64, disp); let t = r.name; while (g.measureText(t).width > W - 2 * pad && t.length > 4) t = t.slice(0, -2); if (t !== r.name) t = t.trim() + '…';
    g.fillText(t, pad, y + 58); g.fillStyle = C('--muted'); g.font = font(500, 28, body);
    g.fillText(new Date(r.start).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), pad, y + 102); y += 132;
  }
  // map / route
  if (mapH) { await drawRouteBox(g, r, pad, y, W - 2 * pad, mapH, p.bg === 'map'); y += mapH + 36; }
  // stats grid
  const cw = (W - 2 * pad) / cols;
  stats.forEach(([l, v, u], k) => {
    const x = pad + (k % cols) * cw, yy = y + Math.floor(k / cols) * rowH;
    const base = yy + 30 + vpx * 0.95;
    g.fillStyle = C('--muted'); g.font = font(700, noMap ? 28 : 24, body); g.fillText(l.toUpperCase(), x, yy + 26);
    g.fillStyle = C('--ink'); g.font = font(700, vpx, disp); g.fillText(String(v), x, base);
    if (u) { const vw = g.measureText(String(v)).width; g.fillStyle = C('--muted'); g.font = font(600, cols === 4 ? 22 : 26, body); g.fillText(u, x + vw + 6, base); }
  });
  y += statsH;
  // laps: one bar per lap, longer = faster
  if (laps.length) {
    y += 20; g.fillStyle = C('--muted'); g.font = font(700, 24, body); g.fillText(`LAPS · PER ${uName().toUpperCase()}`, pad, y + 20); y += 40;
    const paces = laps.map(s => s.sec / (s.len / 1000)), fast = Math.min(...paces), slow = Math.max(...paces), many = laps.length > 14;
    if (many) {
      const bw = (W - 2 * pad) / laps.length, hmax = lapsH - 70;
      laps.forEach((s, k) => { const f = slow > fast ? (slow - paces[k]) / (slow - fast) : 1, h = hmax * (0.3 + 0.7 * f);
        g.fillStyle = paces[k] === fast ? C('--accent') : C('--pace'); roundRect(g, pad + k * bw + 2, y + hmax - h, Math.max(2, bw - 4), h, 4); });
      g.fillStyle = C('--muted'); g.font = font(500, 22, mono); g.fillText(`fastest ${fmtPace(fast)} · slowest ${fmtPace(slow)}`, pad, y + hmax + 34);
    } else {
      const rh = Math.min(34, (lapsH - 40) / laps.length), labW = 70, valW = 230, bwMax = W - 2 * pad - labW - valW;
      laps.forEach((s, k) => { const f = slow > fast ? (slow - paces[k]) / (slow - fast) : 1, yy = y + k * rh;
        g.fillStyle = C('--ink2'); g.font = font(600, Math.min(24, rh - 6), mono); g.fillText(s.len < U() * 0.99 ? (s.len / U()).toFixed(2) : String(k + 1), pad, yy + rh - 8);
        g.fillStyle = paces[k] === fast ? C('--accent') : C('--pace'); roundRect(g, pad + labW, yy + 5, bwMax * (0.35 + 0.65 * f), rh - 10, 4);
        g.fillStyle = C('--ink'); g.fillText(fmtPace(paces[k]) + (s.hr && on('hr') ? `  ${Math.round(s.hr)} bpm` : ''), W - pad - valW + 10, yy + rh - 8); });
    }
  }
  return cv;
}
function roundRect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); }
async function drawRouteBox(g, r, X, Y, BW, BH, tiles) {
  g.save(); g.beginPath(); g.roundRect ? g.roundRect(X, Y, BW, BH, 28) : g.rect(X, Y, BW, BH); g.clip();
  g.fillStyle = css('--surface'); g.fillRect(X, Y, BW, BH);
  const flat = routeFlat(r, 1500), pts = []; for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180; for (const [a, o] of pts) { la0 = Math.min(la0, a); la1 = Math.max(la1, a); lo0 = Math.min(lo0, o); lo1 = Math.max(lo1, o); }
  let z; for (z = 18; z > 2; z--) if (wx(lo1, z) - wx(lo0, z) <= BW - 80 && wy(la0, z) - wy(la1, z) <= BH - 70) break;
  // zoom steps are 2×, so scale the chosen level (1–2×) to make the route fill the box
  const sw = Math.max(1, wx(lo1, z) - wx(lo0, z)), sh = Math.max(1, wy(la0, z) - wy(la1, z)), k = clamp(Math.min((BW - 80) / sw, (BH - 70) / sh), 1, 4);
  const cx = (wx(lo0, z) + wx(lo1, z)) / 2, cy = (wy(la0, z) + wy(la1, z)) / 2, N = 2 ** z;
  const x0 = cx - BW / 2 / k, y0 = cy - BH / 2 / k; // world pixels at the box's top-left
  let drewTiles = false;
  if (tiles) {
    const jobs = [];
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + BW / k) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + BH / k) / 256); ty++) {
      if (ty < 0 || ty >= N) continue;
      jobs.push(loadTile(`https://tile.openstreetmap.org/${z}/${((tx % N) + N) % N}/${ty}.png`).then(im => [im, tx, ty]));
    }
    const done = await Promise.all(jobs);
    if (document.documentElement.dataset.mode === 'dark') g.filter = 'brightness(0.62) contrast(1.1) saturate(0.5)';
    for (const [im, tx, ty] of done) if (im) { g.drawImage(im, X + (tx * 256 - x0) * k, Y + (ty * 256 - y0) * k, 256 * k + 1, 256 * k + 1); drewTiles = true; }
    g.filter = 'none';
  }
  if (!drewTiles) { // route only: faint grid
    g.strokeStyle = css('--line'); g.lineWidth = 1; for (let gx = X; gx < X + BW; gx += 54) { g.beginPath(); g.moveTo(gx, Y); g.lineTo(gx, Y + BH); g.stroke(); } for (let gy = Y; gy < Y + BH; gy += 54) { g.beginPath(); g.moveTo(X, gy); g.lineTo(X + BW, gy); g.stroke(); }
  }
  const P = pts.map(([a, o]) => [X + (wx(o, z) - x0) * k, Y + (wy(a, z) - y0) * k]);
  const path = () => { g.beginPath(); P.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); };
  g.lineJoin = g.lineCap = 'round';
  path(); g.strokeStyle = css('--bg'); g.lineWidth = 16; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
  path(); g.strokeStyle = css('--accent'); g.lineWidth = 9; g.stroke();
  const dot = ([x, y], c) => { g.beginPath(); g.arc(x, y, 13, 0, 7); g.fillStyle = c; g.fill(); g.lineWidth = 5; g.strokeStyle = css('--surface'); g.stroke(); };
  dot(P[P.length - 1], css('--ink')); dot(P[0], css('--good'));
  if (drewTiles) { g.fillStyle = css('--surface') + 'cc'; g.fillRect(X + BW - 250, Y + BH - 34, 250, 34); g.fillStyle = css('--ink2'); g.font = `500 20px ${css('--body')}`; g.fillText('© OpenStreetMap contributors', X + BW - 238, Y + BH - 11); }
  g.restore();
}

function shareImageDlg(r, e) {
  const p = imgPrefs();
  const seg = (name, opts, cur) => `<div class="seg seg-wide" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" data-${name}="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  openDlg(`<h2>Share as image</h2>
    <div class="img-prev"><canvas id="imgPrev"></canvas><span class="ai-busy" id="imgBusy"></span></div>
    <div class="stack" style="margin-top:12px">
      ${r.hasGPS ? seg('bg', [['map', 'Map'], ['route', 'Route only'], ['none', 'No map']], p.bg) : ''}
      ${seg('size', [['square', 'Post 4:5'], ['story', 'Story 9:16']], p.size)}
      <div class="chk-grid">${IMG_FIELDS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-f="${k}"${p.off.includes(k) ? '' : ' checked'}> ${l}</label>`).join('')}</div>
      <div class="btns">${navigator.share ? '<button type="button" class="primary" id="imgShare">Share…</button>' : ''}<button type="button" class="${navigator.share ? '' : 'primary'}" id="imgSave">Download</button></div>
    </div>`);
  let cur = null, seq = 0;
  const redraw = async () => {
    const my = ++seq; $('#imgBusy').hidden = false; const q = imgPrefs();
    const cv = await drawWorkoutImage(r, e, q); if (my !== seq || !$('#imgPrev')) return;
    cur = cv; const pv = $('#imgPrev'); pv.width = cv.width; pv.height = cv.height; pv.getContext('2d').drawImage(cv, 0, 0); $('#imgBusy').hidden = true;
  };
  const save = patch => { lsSet('pp-img', Object.assign(imgPrefs(), patch)); };
  $$('#dlgBody [data-bg]').forEach(b => b.onclick = () => { save({ bg: b.dataset.bg }); $$('#dlgBody [data-bg]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); redraw(); });
  $$('#dlgBody [data-size]').forEach(b => b.onclick = () => { save({ size: b.dataset.size }); $$('#dlgBody [data-size]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); redraw(); });
  $$('#dlgBody [data-f]').forEach(c => c.onchange = () => { save({ off: $$('#dlgBody [data-f]').filter(x => !x.checked).map(x => x.dataset.f) }); redraw(); });
  const blob = () => new Promise((res, rej) => { try { cur.toBlob(b => b ? res(b) : rej(new Error('Could not make the image.')), 'image/png'); } catch (err) { rej(new Error('The map tiles blocked the export — choose “Route only”.')); } });
  const fname = (r.name || 'run').replace(/[^\w-]+/g, '-').toLowerCase() + '.png';
  $('#imgSave').onclick = async () => { try { const u = URL.createObjectURL(await blob()); const a = document.createElement('a'); a.href = u; a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); } catch (err) { setStatus(err.message); } };
  if ($('#imgShare')) $('#imgShare').onclick = async () => {
    try { const f = new File([await blob()], fname, { type: 'image/png' }); if (navigator.canShare && !navigator.canShare({ files: [f] })) { $('#imgSave').click(); return; } await navigator.share({ files: [f], title: r.name }); }
    catch (err) { if (err.name !== 'AbortError') setStatus(err.message); }
  };
  redraw();
}
// ===== END WORKOUT IMAGE =====
