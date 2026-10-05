/* ---------- formatting ---------- */
const U = () => st.S.units === 'mi' ? 1609.344 : 1000;
const uName = () => st.S.units === 'mi' ? 'mi' : 'km';
const fmtDur = s => { if (s == null || !isFinite(s)) return '–'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtPace = secPerKm => secPerKm == null || !isFinite(secPerKm) ? '–' : fmtDur(secPerKm * U() / 1000);
const fmtDist = m => m == null ? '–' : (m / U()).toFixed(m / U() >= 100 ? 0 : 2);
const fmtDate = (ms, o = { day: 'numeric', month: 'short' }) => new Date(ms).toLocaleDateString(undefined, o);
const f1 = x => x == null || !isFinite(x) ? '–' : x.toFixed(1);
const f0 = x => x == null || !isFinite(x) ? '–' : Math.round(x).toLocaleString();

/* ---------- VO2max norms (approx. Cooper Institute percentiles, as used by most watches) ---------- */
const NORMS = { m: [[20, 41.7, 45.4, 51.1, 55.4], [30, 40.5, 44.0, 48.3, 54.0], [40, 38.5, 42.4, 46.4, 52.5], [50, 35.6, 39.2, 43.4, 48.9], [60, 32.3, 35.5, 39.5, 45.7], [70, 29.4, 32.3, 36.7, 42.1]],
  f: [[20, 36.1, 39.5, 43.9, 49.6], [30, 34.4, 37.8, 42.4, 47.4], [40, 33.0, 36.3, 39.7, 45.3], [50, 30.1, 33.0, 36.7, 41.1], [60, 27.5, 30.0, 33.0, 37.8], [70, 25.9, 28.1, 30.9, 36.7]] };
function vo2Category(v) {
  if (!st.S.age) return null;
  const rows = NORMS[st.S.sex] || NORMS.m; let row = rows[0]; for (const r of rows) if (st.S.age >= r[0]) row = r;
  const names = ['Poor', 'Fair', 'Good', 'Excellent', 'Superior']; let k = 0; for (let i = 1; i <= 4; i++) if (v >= row[i]) k = i;
  return { name: names[k], cls: k >= 3 ? 'good' : k === 2 ? 'acc' : k === 1 ? 'warn' : 'crit' };
}

/* ---------- charts ---------- */
function niceTicks(a, b, n) {
  if (a === b) { a -= 1; b += 1; }
  const raw = (b - a) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  const out = []; for (let v = Math.floor(a / step) * step; v <= b + step * 0.001; v += step) out.push(+v.toFixed(10));
  if (out[out.length - 1] < b) out.push(out[out.length - 1] + step);
  return out;
}
function timeTicks(x0, x1) {
  const span = (x1 - x0) / DAY, out = [];
  if (span > 75) {
    const k = span > 700 ? 3 : span > 300 ? 2 : 1; const d = new Date(x0); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= x1) { if (d.getMonth() % k === 0) out.push(d.getTime()); d.setMonth(d.getMonth() + 1); }
    return { ticks: out, fmt: t => fmtDate(t, span > 400 ? { month: 'short', year: '2-digit' } : { month: 'short' }) };
  }
  const step = span > 40 ? 14 : span > 14 ? 7 : span > 6 ? 2 : 1; const d0 = dayStart(x0);
  for (let t = d0; t <= x1; t += step * DAY) if (t >= x0) out.push(t);
  return { ticks: out, fmt: t => fmtDate(t) };
}
/* series: {name, color, pts:[[x,y,extra]], kind:'line'|'dots'|'bars'|'area', fmt, r(pt)} */
function plot(el, o) {
  el.innerHTML = '';
  const series = o.series.filter(s => s.pts.length);
  if (!series.length) { el.innerHTML = `<p class="empty">${esc(o.empty || 'Not enough data yet.')}</p>`; return; }
  const W = Math.max(260, el.clientWidth || 600), H = o.height || 210, m = { l: o.ml || 42, r: 12, t: 10, b: 24 };
  let x0 = o.xMin ?? Infinity, x1 = o.xMax ?? -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of series) for (const p of s.pts) { if (o.xMin == null) x0 = Math.min(x0, p[0]); if (o.xMax == null) x1 = Math.max(x1, p[0]); if (p[1] != null) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } }
  if (o.zero) y0 = Math.min(0, y0);
  const floorY = o.zero ? 0 : -Infinity;
  if (o.yMin != null) y0 = Math.min(y0, o.yMin); if (o.yMax != null) y1 = Math.max(y1, o.yMax);
  if (x1 === x0) { x0 -= DAY; x1 += DAY; }
  const padY = (y1 - y0) * 0.08 || 1; const yt = niceTicks(Math.max(floorY, o.zero ? y0 : y0 - padY), y1 + padY, o.yTicks || 4);
  y0 = yt[0]; y1 = yt[yt.length - 1];
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const sx = x => m.l + (x - x0) / (x1 - x0) * iw;
  const sy = y => o.invert ? m.t + (y - y0) / (y1 - y0) * ih : m.t + ih - (y - y0) / (y1 - y0) * ih;
  const yf = o.yFmt || (v => String(v));
  let g = '';
  yt.forEach(v => { const y = sy(v); g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="ax" x="${m.l - 6}" y="${y + 4}" text-anchor="end">${esc(yf(v))}</text>`; });
  const xt = o.xTime === false ? { ticks: niceTicks(x0, x1, Math.max(3, Math.floor(iw / 80))).filter(v => v >= x0 && v <= x1), fmt: o.xFmt } : timeTicks(x0, x1);
  const minGap = 46; let lastX = -1e9;
  xt.ticks.forEach(v => { const x = sx(v); if (x - lastX < minGap || x > W - m.r - 10) return; lastX = x; g += `<text class="ax" x="${x}" y="${H - 6}" text-anchor="middle">${esc(xt.fmt(v))}</text>`; });
  g += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${sy(o.invert ? y1 : y0)}" y2="${sy(o.invert ? y1 : y0)}"/>`;
  for (const s of series) {
    if (s.kind === 'bars') {
      const bw = Math.max(2, (s.bw ? s.bw / (x1 - x0) * iw : iw / s.pts.length) - 2);
      for (const p of s.pts) { const x = sx(p[0]) - bw / 2, y = sy(p[1]), yb = sy(Math.max(0, y0)); const h = Math.max(0, yb - y);
        if (h > 0) g += `<path d="M${x},${yb}V${y + Math.min(3, h)}q0,-3 3,-3h${bw - 6}q3,0 3,3V${yb}Z" fill="${s.color}"/>`; }
    } else if (s.kind === 'dots') {
      for (const p of s.pts) g += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="${s.r ? s.r(p) : 4}" fill="${s.color}" fill-opacity="${s.op ?? 0.55}" stroke="var(--surface)" stroke-width="1.5"/>`;
    } else {
      let d = '', pen = false;
      for (const p of s.pts) { if (p[1] == null) { pen = false; continue; } d += (pen ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); pen = true; }
      if (s.kind === 'area') { const yb = sy(o.invert ? y1 : y0); const pts = s.pts.filter(p => p[1] != null); g += `<path d="${d}L${sx(pts[pts.length - 1][0])},${yb}L${sx(pts[0][0])},${yb}Z" fill="${s.color}" fill-opacity=".12"/>`; }
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
      if (s.end !== false) { const lp = [...s.pts].reverse().find(p => p[1] != null); if (lp) g += `<circle cx="${sx(lp[0])}" cy="${sy(lp[1])}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`; }
    }
  }
  if (o.extra) g += o.extra(sx, sy, { x0, x1, y0, y1, W, H, m });
  const leg = series.filter(s => !s.noLegend);
  const legend = leg.length > 1 ? `<div class="legend">${leg.map(s => `<span><i class="${s.kind === 'dots' ? 'dot' : ''}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  el.innerHTML = legend + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || '')}">${g}<line class="xh" id="xh" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/><g class="hl"></g><rect x="${m.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = svg.querySelector('.xh'), hl = svg.querySelector('.hl');
  const scatter = series.every(s => s.kind === 'dots');
  const nearest = (pts, x) => { let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] < x) lo = mid; else hi = mid; } return Math.abs(pts[lo][0] - x) <= Math.abs(pts[hi][0] - x) ? pts[lo] : pts[hi]; };
  const move = ev => {
    const r = svg.getBoundingClientRect(), k = W / r.width, px = (ev.clientX - r.left) * k, py = (ev.clientY - r.top) * k;
    if (px < m.l - 4 || px > W - m.r + 4) return hide();
    const xv = x0 + (px - m.l) / iw * (x1 - x0);
    let rows = [], ax = null, dots = '';
    if (scatter) {
      let best = null, bd = 1e9; for (const s of series) for (const p of s.pts) { const dd = Math.hypot(sx(p[0]) - px, sy(p[1]) - py); if (dd < bd) { bd = dd; best = [s, p]; } }
      if (!best || bd > 40) return hide();
      ax = sx(best[1][0]); rows.push(best[0].tip ? best[0].tip(best[1]) : `<b>${esc(best[0].fmt ? best[0].fmt(best[1][1]) : best[1][1])}</b>`);
      dots += `<circle cx="${ax}" cy="${sy(best[1][1])}" r="6" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
    } else {
      let cands = series.map(s => [s, nearest(s.pts, xv)]);
      const tx = cands.reduce((b, c) => Math.abs(c[1][0] - xv) < Math.abs(b - xv) ? c[1][0] : b, cands[0][1][0]);
      ax = sx(tx); const head = o.tipX ? o.tipX(tx) : fmtDate(tx, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      rows.push(`<div style="opacity:.75">${esc(head)}</div>`);
      for (const [s, p] of cands) {
        if (s.kind === 'dots' && Math.abs(sx(p[0]) - ax) > 8) continue;
        if (s.kind === 'bars' && p[0] !== tx) continue;
        if (p[1] == null) continue;
        rows.push(`<div><span class="sw" style="background:${s.color}"></span>${esc(s.name)} <b>${esc(s.fmt ? s.fmt(p[1], p) : p[1])}</b></div>`);
        if (s.kind !== 'bars') dots += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
      }
      if (rows.length < 2) return hide();
    }
    xh.setAttribute('x1', ax); xh.setAttribute('x2', ax); xh.setAttribute('visibility', scatter ? 'hidden' : 'visible'); hl.innerHTML = dots;
    tip.innerHTML = rows.join(''); tip.hidden = false;
    const tw = tip.offsetWidth, cw = el.clientWidth, left = ax / k;
    tip.style.left = Math.max(0, Math.min(cw - tw, left + 12 + tw > cw ? left - tw - 12 : left + 12)) + 'px';
    tip.style.top = (legend ? el.querySelector('.legend').offsetHeight : 0) + 4 + 'px';
  };
  const hide = () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); hl.innerHTML = ''; };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', hide);
}

