/* ---------- formatting ---------- */
const U = () => st.S.units === 'mi' ? 1609.344 : 1000;
const uName = () => st.S.units === 'mi' ? 'mi' : 'km';
const fmtDur = s => { if (s == null || !isFinite(s)) return '–'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtPace = secPerKm => secPerKm == null || !isFinite(secPerKm) ? '–' : fmtDur(secPerKm * U() / 1000);
const fmtDist = m => m == null ? '–' : (m / U()).toFixed(m / U() >= 100 ? 0 : 2);
const fmtDate = (ms, o = { day: 'numeric', month: 'short' }) => new Date(ms).toLocaleDateString(undefined, o);
const f1 = x => x == null || !isFinite(x) ? '–' : x.toFixed(1);
const f0 = x => x == null || !isFinite(x) ? '–' : Math.round(x).toLocaleString();

/* ---------- status badges: one colour language for good / normal / bad everywhere ---------- */
// levels: top (purple) · exc (blue) · good (green) · ok (grey, "normal") · warn (orange) · bad (red) — always with a word
const badge = (lv, label) => `<span class="badge b-${lv}"><i></i>${label}</span>`;
const STATUS = {
  rating: k => ['bad', 'warn', 'good', 'exc', 'top'][k],                         // Poor … Superior
  tier: k => ['bad', 'warn', 'ok', 'good', 'good', 'exc', 'top'][k],             // endurance tiers
  form: t => t > 5 ? 'good' : t > -10 ? 'ok' : t > -25 ? 'ok' : 'bad',            // Fresh · Balanced · Building · Overreaching
  load: r => r == null ? 'ok' : r < 0.8 ? 'warn' : r <= 1.3 ? 'good' : r <= 1.5 ? 'warn' : 'bad',
  drift: d => d < 5 ? ['good', 'Solid'] : d < 8 ? ['ok', 'Normal'] : d < 12 ? ['warn', 'High'] : ['bad', 'Very high'],
  easy: p => p >= 75 ? ['good', 'Balanced 80/20'] : p >= 65 ? ['ok', 'Slightly hard'] : ['warn', 'Too little easy'],
  factor: f => f >= 0.8 ? ['good', 'Strong'] : f >= 0.55 ? ['ok', 'Fair'] : f >= 0.3 ? ['warn', 'Low'] : ['bad', 'Very low'],
};

/* ---------- gauge: Garmin-style arc of bands with an arrow at your value ---------- */
// bands: [[from, to, label, colour]], value; returns SVG markup. Bands outside the current one are dimmed.
function gauge(o) {
  const cx = 120, cy = 116, r = 92, sw = 16, g = 0.014, span = o.max - o.min;
  const ang = v => Math.PI * (1 - (clamp(v, o.min, o.max) - o.min) / span), pt = (a, rr) => (cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy - rr * Math.sin(a)).toFixed(1);
  const cur = o.bands.findIndex(([f, t]) => o.value >= f && o.value < t), ci = cur < 0 ? (o.value < o.bands[0][0] ? 0 : o.bands.length - 1) : cur;
  let s = o.bands.map(([f, t, lab, col], k) => `<path d="M${pt(ang(f) - (k ? g : 0), r)} A${r} ${r} 0 0 1 ${pt(ang(t) + (k < o.bands.length - 1 ? g : 0), r)}" style="stroke:${col}" stroke-width="${sw}" fill="none" opacity="${k === ci ? 1 : 0.4}"><title>${esc(lab)}: ${esc(o.fmt(f))}–${esc(o.fmt(t))}</title></path>`).join('');
  // boundary values outside the arc; the arrow sits just inside it, pointing at your value
  s += o.bands.slice(1).map(([f]) => { const a = ang(f), x = cx + (r + sw / 2 + 9) * Math.cos(a); return `<text class="g-tick" x="${x.toFixed(1)}" y="${(cy - (r + sw / 2 + 9) * Math.sin(a) + 3).toFixed(1)}" text-anchor="${x < cx - 20 ? 'end' : x > cx + 20 ? 'start' : 'middle'}">${esc(o.fmt(f))}</text>`; }).join('');
  const a = ang(o.value);
  s += `<path d="M${pt(a, r - sw / 2 - 1)} L${pt(a - 0.09, r - sw / 2 - 15)} L${pt(a + 0.09, r - sw / 2 - 15)} Z" fill="var(--ink)" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<text class="g-val" x="${cx}" y="${cy - 22}" text-anchor="middle">${esc(o.center)}</text><text class="g-lab" x="${cx}" y="${cy + 4}" text-anchor="middle">${esc(o.bands[ci][2])}</text>`;
  return `<svg class="gauge" viewBox="-14 -6 268 130" role="img" aria-label="${esc(o.label)}: ${esc(o.center)}, ${esc(o.bands[ci][2])}">${s}</svg>`;
}
// Garmin-style rating colours: poor red → fair orange → good green → excellent blue → superior purple
const RATING_COLS = { 5: ['--rt1', '--rt2', '--rt4', '--rt6', '--rt7'], 7: ['--rt1', '--rt2', '--rt3', '--rt4', '--rt5', '--rt6', '--rt7'] };
const ratingCol = (k, n) => `var(${(RATING_COLS[n] || RATING_COLS[7])[k]})`;

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
/* series: {name, color, pts:[[x,y,extra]], kind:'line'|'dots'|'bars'|'area', fmt, r(pt)}
   options: yFmt(v, decimals), minSpan (smallest y-range shown, so noise isn't magnified), zero, invert, xTime, … */
let plotSeq = 0;
const numFmt = (v, dec) => Math.abs(v) >= 1000 && dec === 0 ? v.toLocaleString() : v.toFixed(dec);
function plot(el, o) {
  el.innerHTML = '';
  const series = o.series.filter(s => s.pts.some(p => p[1] != null));
  if (!series.length) { el.innerHTML = `<p class="empty">${esc(o.empty || 'Not enough data yet.')}</p>`; return; }
  const rem = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16; // text-size setting
  const W = Math.max(260, el.clientWidth || 600), H = Math.round((o.height || 210) * Math.min(1.25, Math.max(1, rem)));
  let x0 = o.xMin ?? Infinity, x1 = o.xMax ?? -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of series) for (const p of s.pts) { if (o.xMin == null) x0 = Math.min(x0, p[0]); if (o.xMax == null) x1 = Math.max(x1, p[0]); if (p[1] != null) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } }
  if (o.zero) y0 = Math.min(0, y0);
  if (o.yMin != null) y0 = Math.min(y0, o.yMin); if (o.yMax != null) y1 = Math.max(y1, o.yMax);
  if (o.minSpan && y1 - y0 < o.minSpan) { const c = (y0 + y1) / 2, h = o.minSpan / 2; y0 = c - h; y1 = c + h; if (o.zero && y0 < 0) { y1 -= y0; y0 = 0; } }
  if (x1 === x0) { x0 -= o.xTime === false ? 1 : DAY; x1 += o.xTime === false ? 1 : DAY; }
  const padY = (y1 - y0) * 0.08 || 1;
  const yt = niceTicks(o.zero ? Math.max(0, y0) : y0 - padY, y1 + padY, o.yTicks || 4);
  y0 = yt[0]; y1 = yt[yt.length - 1];
  // decimals from the tick step, so neighbouring labels never print the same number (e.g. 29 · 29 · 29)
  const step = yt.length > 1 ? yt[1] - yt[0] : 1, dec = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)));
  const yf = o.yFmt ? v => o.yFmt(v, dec) : v => numFmt(v, dec);
  const labels = yt.map(v => String(yf(v)));
  const cw = 6.9 * rem, m = { l: Math.max(o.ml || 30, Math.ceil(Math.max(...labels.map(t => t.length)) * cw) + 12), r: 12, t: 10, b: Math.round(24 * rem) };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const sx = x => m.l + (x - x0) / (x1 - x0) * iw;
  const sy = y => o.invert ? m.t + (y - y0) / (y1 - y0) * ih : m.t + ih - (y - y0) / (y1 - y0) * ih;
  const cid = 'pc' + (++plotSeq);
  let g = `<defs><clipPath id="${cid}"><rect x="${m.l - 6}" y="${m.t - 6}" width="${iw + 12}" height="${ih + 12}"/></clipPath></defs>`;
  yt.forEach((v, k) => { const y = sy(v); g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="ax" x="${m.l - 6}" y="${y + 4 * rem}" text-anchor="end">${esc(labels[k])}</text>`; });
  const xt = o.xTime === false ? { ticks: niceTicks(x0, x1, Math.max(3, Math.floor(iw / 80))).filter(v => v >= x0 && v <= x1), fmt: o.xFmt || (v => String(v)) } : timeTicks(x0, x1);
  const minGap = 46 * rem; let lastX = -1e9;
  xt.ticks.forEach(v => { const x = sx(v); if (x - lastX < minGap || x > W - m.r - 10) return; lastX = x; g += `<text class="ax" x="${x}" y="${H - 6}" text-anchor="middle">${esc(xt.fmt(v))}</text>`; });
  const yBase = sy(o.invert ? y1 : y0);
  g += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${yBase}" y2="${yBase}"/><g clip-path="url(#${cid})">`;
  for (const s of series) {
    if (s.kind === 'bars') {
      const slot = s.bw ? s.bw / (x1 - x0) * iw : iw / s.pts.length, bw = Math.max(2, Math.min(24, slot - 2));
      for (const p of s.pts) { if (p[1] == null) continue;
        const x = sx(p[0]) - bw / 2, y = sy(p[1]), yb = sy(Math.max(0, y0)), h = Math.max(0, yb - y), r = Math.min(4, bw / 2, h);
        if (h > 0) g += `<path d="M${x},${yb}V${y + r}q0,${-r} ${r},${-r}h${bw - 2 * r}q${r},0 ${r},${r}V${yb}Z" fill="${s.color}"/>`; }
    } else if (s.kind === 'dots') {
      for (const p of s.pts) if (p[1] != null) g += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="${s.r ? s.r(p) : 4}" fill="${s.color}" fill-opacity="${s.op ?? 0.55}" stroke="var(--surface)" stroke-width="1.5"/>`;
    } else {
      // contiguous runs of non-null points; areas are filled per run so gaps stay empty
      const runs = []; let cur = null;
      for (const p of s.pts) { if (p[1] == null) { cur = null; continue; } if (!cur) runs.push(cur = []); cur.push(p); }
      const path = rp => rp.map((p, k) => (k ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join('');
      if (s.kind === 'area') for (const rp of runs) g += `<path d="${path(rp)}L${sx(rp[rp.length - 1][0]).toFixed(1)},${yBase}L${sx(rp[0][0]).toFixed(1)},${yBase}Z" fill="${s.color}" fill-opacity=".1"/>`;
      g += `<path d="${runs.map(path).join('')}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
      if (s.end !== false) { const lp = [...s.pts].reverse().find(p => p[1] != null); if (lp) g += `<circle cx="${sx(lp[0])}" cy="${sy(lp[1])}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`; }
    }
  }
  g += '</g>';
  if (o.extra) g += o.extra(sx, sy, { x0, x1, y0, y1, W, H, m });
  const leg = series.filter(s => !s.noLegend);
  const legend = leg.length > 1 ? `<div class="legend">${leg.map(s => `<span><i class="${s.kind === 'dots' ? 'dot' : ''}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  el.innerHTML = legend + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || '')}">${g}<line class="xh" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/><g class="hl"></g><rect x="${m.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><div class="tip" hidden></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = svg.querySelector('.xh'), hl = svg.querySelector('.hl');
  const scatter = series.every(s => s.kind === 'dots');
  const nearest = (pts, x) => { let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] < x) lo = mid; else hi = mid; } return Math.abs(pts[lo][0] - x) <= Math.abs(pts[hi][0] - x) ? pts[lo] : pts[hi]; };
  const move = ev => {
    const r = svg.getBoundingClientRect(), k = W / r.width, px = (ev.clientX - r.left) * k, py = (ev.clientY - r.top) * k;
    if (px < m.l - 4 || px > W - m.r + 4) return hide();
    const xv = x0 + (px - m.l) / iw * (x1 - x0);
    let rows = [], ax = null, dots = '';
    if (scatter) {
      let best = null, bd = 1e9; for (const s of series) for (const p of s.pts) { if (p[1] == null) continue; const dd = Math.hypot(sx(p[0]) - px, sy(p[1]) - py); if (dd < bd) { bd = dd; best = [s, p]; } }
      if (!best || bd > 40) return hide();
      ax = sx(best[1][0]); rows.push(best[0].tip ? best[0].tip(best[1]) : `<b>${esc(best[0].fmt ? best[0].fmt(best[1][1], best[1]) : best[1][1])}</b>`);
      dots += `<circle cx="${ax}" cy="${sy(best[1][1])}" r="6" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
    } else {
      const cands = series.map(s => [s, nearest(s.pts, xv)]);
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
    const tw = tip.offsetWidth, cw2 = el.clientWidth, left = ax / k;
    tip.style.left = Math.max(0, Math.min(cw2 - tw, left + 12 + tw > cw2 ? left - tw - 12 : left + 12)) + 'px';
    tip.style.top = (legend ? el.querySelector('.legend').offsetHeight : 0) + 4 + 'px';
  };
  const hide = () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); hl.innerHTML = ''; };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', hide);
}
