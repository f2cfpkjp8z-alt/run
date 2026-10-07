// ===== CORE: parsing + physiology (no DOM except DOMParser for XML) =====
const DAY = 86400000;
const DT = 2; // analysis grid, seconds
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z in unix seconds

/* ---------- FIT ---------- */
const FIT_SIZE = {0:1,1:1,2:1,3:2,4:2,5:4,6:4,7:1,8:4,9:8,10:1,11:2,12:4,13:1,14:8,15:8,16:8};
function parseFIT(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 14) throw new Error('File too small to be FIT');
  const hs = dv.getUint8(0);
  const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
  if (sig !== '.FIT') throw new Error('Not a FIT file');
  const dataSize = dv.getUint32(4, true);
  const end = Math.min(hs + dataSize, buf.byteLength - 0);
  let p = hs, lastTs = 0;
  const defs = {}, pts = [];
  let sport = null, session = null, created = null;

  function readMsg(def) {
    const m = {};
    for (const [num, size, bt] of def.fields) {
      const base = bt & 0x1f, ts = FIT_SIZE[base];
      if (p + size > buf.byteLength) { p = buf.byteLength; return m; }
      if (ts && size === ts && ts <= 4 && base !== 7) {
        let v;
        if (base === 8) v = dv.getFloat32(p, def.le);
        else if (size === 1) v = (base === 1) ? dv.getInt8(p) : dv.getUint8(p);
        else if (size === 2) v = (base === 3) ? dv.getInt16(p, def.le) : dv.getUint16(p, def.le);
        else v = (base === 5) ? dv.getInt32(p, def.le) : dv.getUint32(p, def.le);
        const inval =
          (base === 0 || base === 2 || base === 13) ? v === 0xff :
          base === 1 ? v === 0x7f : base === 3 ? v === 0x7fff : base === 4 ? v === 0xffff :
          base === 5 ? v === 0x7fffffff : base === 6 ? v === 0xffffffff :
          (base === 10 || base === 11 || base === 12) ? v === 0 : base === 8 ? !isFinite(v) : false;
        if (!inval) m[num] = v;
      }
      p += size;
    }
    p += def.devSize;
    return m;
  }
  function handle(g, m) {
    if (g === 20) {
      if (m[253] == null) return;
      const spd = m[73] != null ? m[73] / 1000 : m[6] != null ? m[6] / 1000 : null;
      const alt = m[78] != null ? m[78] / 5 - 500 : m[2] != null ? m[2] / 5 - 500 : null;
      let cad = m[4] != null ? m[4] + (m[53] != null ? m[53] / 128 : 0) : null;
      pts.push({ ts: m[253], d: m[5] != null ? m[5] / 100 : null, hr: m[3] ?? null, alt, cad, v: spd,
        lat: m[0] != null ? m[0] * (180 / 2147483648) : null, lon: m[1] != null ? m[1] * (180 / 2147483648) : null });
    } else if (g === 18) {
      session = m; if (m[5] != null) sport = m[5];
    } else if (g === 12) {
      if (m[0] != null && sport == null) sport = m[0];
    } else if (g === 0) {
      if (m[4] != null) created = m[4];
    }
  }
  while (p < end) {
    const h = dv.getUint8(p++);
    if (h & 0x80) {
      const def = defs[(h >> 5) & 3]; if (!def) throw new Error('Corrupt FIT (compressed header)');
      const off = h & 31; let ts = (lastTs & ~31) + off; if (off < (lastTs & 31)) ts += 32; lastTs = ts;
      const m = readMsg(def); m[253] = ts; handle(def.g, m); continue;
    }
    const lt = h & 15;
    if (h & 0x40) {
      p++; const le = dv.getUint8(p++) === 0; const g = dv.getUint16(p, le); p += 2;
      const n = dv.getUint8(p++); const fields = [];
      for (let i = 0; i < n; i++) { fields.push([dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2)]); p += 3; }
      let devSize = 0;
      if (h & 0x20) { const nd = dv.getUint8(p++); for (let i = 0; i < nd; i++) { devSize += dv.getUint8(p + 1); p += 3; } }
      defs[lt] = { g, le, fields, devSize };
    } else {
      const def = defs[lt]; if (!def) throw new Error('Corrupt FIT (missing definition)');
      const m = readMsg(def); if (m[253] != null) lastTs = m[253]; handle(def.g, m);
    }
  }
  if (!pts.length) return null;
  const isRun = sport == null || sport === 1;
  const t0 = pts[0].ts;
  // workout date/time comes from the file: session start_time, else first record, else file creation time
  const startTs = (session && session[2] != null) ? session[2] : (t0 || created);
  return {
    sport: isRun ? 'running' : 'other:' + sport,
    start: (startTs + FIT_EPOCH) * 1000,
    pts: pts.map(q => ({ t: q.ts - startTs, d: q.d, hr: q.hr, alt: q.alt, cad: q.cad, v: q.v, lat: q.lat, lon: q.lon })),
  };
}

/* ---------- XML (TCX / GPX) ---------- */
const tag = (el, name) => el.getElementsByTagNameNS('*', name);
const txt = (el, name) => { const e = tag(el, name)[0]; return e ? e.textContent.trim() : null; };
const num = s => (s == null || s === '' ? null : (isFinite(+s) ? +s : null));

function parseTCX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (tag(doc, 'parsererror').length) throw new Error('Unreadable TCX');
  const act = tag(doc, 'Activity')[0];
  const sp = (act && act.getAttribute('Sport')) || 'Running';
  const tps = tag(doc, 'Trackpoint'); const pts = []; let t0 = null;
  for (const tp of tps) {
    const time = txt(tp, 'Time'); if (!time) continue;
    const ms = Date.parse(time); if (t0 == null) t0 = ms;
    const hrEl = tag(tp, 'HeartRateBpm')[0];
    pts.push({ t: (ms - t0) / 1000, d: num(txt(tp, 'DistanceMeters')), alt: num(txt(tp, 'AltitudeMeters')),
      hr: hrEl ? num(txt(hrEl, 'Value')) : null, cad: num(txt(tp, 'RunCadence')) ?? num(txt(tp, 'Cadence')),
      v: num(txt(tp, 'Speed')), lat: num(txt(tp, 'LatitudeDegrees')), lon: num(txt(tp, 'LongitudeDegrees')) });
  }
  if (!pts.length) return null;
  const name = act ? txt(act, 'Notes') : null;
  const idT = act ? Date.parse(txt(act, 'Id') || '') : NaN;
  const start = isFinite(idT) && Math.abs(idT - t0) < 6 * 3600e3 ? idT : t0;
  if (start !== t0) pts.forEach(q => q.t += (t0 - start) / 1000);
  return { sport: /run/i.test(sp) ? 'running' : 'other:' + sp, start, pts, name };
}

function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (tag(doc, 'parsererror').length) throw new Error('Unreadable GPX');
  const trk = tag(doc, 'trk')[0];
  const type = trk ? txt(trk, 'type') : null;
  const name = trk ? txt(trk, 'name') : null;
  const pts = []; let t0 = null;
  for (const p of tag(doc, 'trkpt')) {
    const time = txt(p, 'time'); if (!time) continue;
    const ms = Date.parse(time); if (t0 == null) t0 = ms;
    pts.push({ t: (ms - t0) / 1000, d: null, lat: +p.getAttribute('lat'), lon: +p.getAttribute('lon'),
      alt: num(txt(p, 'ele')), hr: num(txt(p, 'hr')), cad: num(txt(p, 'cad')), v: null });
  }
  if (!pts.length) return null;
  const isRun = !type || /run/i.test(type);
  return { sport: isRun ? 'running' : 'other:' + type, start: t0, pts, name: name && name.trim() };
}

/* ---------- CSV (Garmin Connect activity list) ---------- */
function splitCSV(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
const hms = s => { if (!s) return null; const parts = s.split(':').map(Number); if (parts.some(isNaN)) return null; return parts.reduce((a, b) => a * 60 + b, 0); };
const csvNum = s => { if (s == null) return null; s = String(s).replace(/,/g, '').trim(); return s === '' || s === '--' || isNaN(+s) ? null : +s; };

function parseCSV(text, units) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const head = splitCSV(lines[0]).map(h => h.trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const cType = col('activity type'), cDate = col('date'), cTitle = col('title'), cDist = col('distance'),
    cTime = col('time', 'moving time', 'elapsed time'), cAvg = col('avg hr', 'average heart rate'), cMax = col('max hr', 'maximum heart rate'),
    cAsc = col('total ascent', 'elev gain'), cCad = col('avg run cadence', 'average run cadence');
  if (cDate < 0 || cDist < 0 || cTime < 0) throw new Error('CSV is missing Date, Distance or Time columns');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const r = splitCSV(lines[i]);
    const type = cType >= 0 ? r[cType] : 'Running';
    if (!/run/i.test(type || '')) continue;
    const start = Date.parse((r[cDate] || '').replace(' ', 'T'));
    let dist = csvNum(r[cDist]); const dur = hms(r[cTime]);
    if (!isFinite(start) || !dist || !dur) continue;
    dist *= units === 'mi' ? 1609.344 : 1000;
    let asc = cAsc >= 0 ? csvNum(r[cAsc]) : null; if (asc != null && units === 'mi') asc *= 0.3048;
    out.push({ summary: true, id: 'a' + Math.round(start / 60000), start, name: (cTitle >= 0 && r[cTitle]) || 'Run',
      src: 'CSV', dist, dur, avgHR: cAvg >= 0 ? csvNum(r[cAvg]) : null, maxHR: cMax >= 0 ? csvNum(r[cMax]) : null,
      ascent: asc, cad: cCad >= 0 ? csvNum(r[cCad]) : null, hrPeak: cMax >= 0 ? csvNum(r[cMax]) : null });
  }
  return out;
}

/* ---------- ZIP (native DecompressionStream) ---------- */
function zipEntries(buf) {
  const dv = new DataView(buf); let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Unreadable ZIP archive');
  const cnt = dv.getUint16(e + 10, true); let off = dv.getUint32(e + 16, true); const out = [];
  for (let k = 0; k < cnt; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true),
      nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true),
      loff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, off + 46, nlen));
    off += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const ds = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
    out.push({ name, method, data: new Uint8Array(buf, ds, csize) });
  }
  return out;
}
async function inflateEntry(en) {
  if (en.method === 0) return en.data.slice().buffer;
  if (en.method !== 8) throw new Error('Unsupported compression in ' + en.name);
  const s = new Blob([en.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(s).arrayBuffer();
}

/* ---------- Raw track -> uniform 2 s grid ---------- */
function hav(a, b, c, d) {
  const R = 6371008, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
  return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
}
function buildGrid(raw, meta) {
  let pts = raw.pts.filter(q => isFinite(q.t) && q.t >= -5).sort((a, b) => a.t - b.t);
  pts.forEach(q => { if (q.t < 0) q.t = 0; if (q.lat === 0 && q.lon === 0) q.lat = q.lon = null; if (q.lat != null && (!isFinite(q.lat) || Math.abs(q.lat) > 90)) q.lat = q.lon = null; });
  pts = pts.filter((q, i) => i === 0 || q.t > pts[i - 1].t);
  if (pts.length < 30) return null;
  // distance: prefer device distance, else integrate speed, else GPS
  const hasD = pts.filter(q => q.d != null).length > pts.length * 0.8;
  if (!hasD) {
    let acc = 0;
    const hasV = pts.filter(q => q.v != null).length > pts.length * 0.8;
    pts.forEach((q, i) => {
      if (i) {
        const pr = pts[i - 1], dt = q.t - pr.t;
        if (hasV) acc += (q.v ?? pr.v ?? 0) * Math.min(dt, 10);
        else if (q.lat != null && pr.lat != null) acc += hav(pr.lat, pr.lon, q.lat, q.lon);
      }
      q.d = acc;
    });
  } else { let last = 0; pts.forEach(q => { if (q.d == null || q.d < last) q.d = last; last = q.d; }); }
  const T = pts[pts.length - 1].t, n = Math.floor(T / DT) + 1;
  if (n < 60) return null;
  const d = new Float32Array(n), hr = new Float32Array(n).fill(NaN), alt = new Float32Array(n).fill(NaN),
    cad = new Float32Array(n).fill(NaN), mv = new Uint8Array(n);
  const g0 = pts.find(q => q.lat != null && q.lon != null);
  const lat0 = g0 ? g0.lat : null, lon0 = g0 ? g0.lon : null;
  const dla = g0 ? new Float32Array(n).fill(NaN) : null, dlo = g0 ? new Float32Array(n).fill(NaN) : null;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    while (j < pts.length - 2 && pts[j + 1].t < t) j++;
    const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
    const span = b.t - a.t, f = span > 0 ? clamp((t - a.t) / span, 0, 1) : 0;
    const lerp = (x, y) => x == null ? y : y == null ? x : x + (y - x) * f;
    d[i] = lerp(a.d, b.d);
    const gap = span > 12;
    if (!gap) {
      const h = lerp(a.hr, b.hr); if (h != null && h > 30 && h < 240) hr[i] = h;
      const c = lerp(a.cad, b.cad); if (c != null && c > 0) cad[i] = c;
      mv[i] = 1;
    }
    const al = lerp(a.alt, b.alt); if (al != null) alt[i] = al;
    if (g0) { const la = lerp(a.lat, b.lat), lo = lerp(a.lon, b.lon); if (la != null && lo != null) { dla[i] = la - lat0; dlo[i] = lo - lon0; } }
  }
  // cadence: Garmin stores strides/min; convert to steps/min
  let cs = 0, cn = 0; for (let i = 0; i < n; i++) if (cad[i] > 0) { cs += cad[i]; cn++; }
  if (cn && cs / cn < 120) for (let i = 0; i < n; i++) cad[i] *= 2;
  const hasHR = hr.some(x => x > 0), hasAlt = alt.some(x => !isNaN(x));
  // fill alt gaps
  if (hasAlt) { let last = NaN; for (let i = 0; i < n; i++) { if (isNaN(alt[i])) alt[i] = last; else last = alt[i]; } let first = alt.find(x => !isNaN(x)); for (let i = 0; i < n && isNaN(alt[i]); i++) alt[i] = first; }
  // peak HR (30 s rolling mean max) for HRmax detection
  let hrPeak = null;
  if (hasHR) { const W = 15; for (let i = 0; i + W <= n; i++) { let s = 0, c = 0; for (let k = i; k < i + W; k++) if (hr[k] > 0) { s += hr[k]; c++; } if (c === W) hrPeak = Math.max(hrPeak || 0, s / W); } }
  const start = raw.start;
  const hasGPS = !!g0 && dla.filter(x => !isNaN(x)).length > n * 0.3;
  return Object.assign({ ver: 2, id: 'a' + Math.round(start / 60000), start, n, d, hr, alt, cad, mv, hasHR, hasAlt, hrPeak,
    hasGPS, lat0: hasGPS ? lat0 : null, lon0: hasGPS ? lon0 : null, dla: hasGPS ? dla : null, dlo: hasGPS ? dlo : null,
    name: raw.name || defaultName(start) }, meta || {});
}
/* ---------- Duplicate detection: the same workout must never be stored twice ---------- */
// Same workout = same start minute (the id), or starts within 2 minutes with distance within 5%
// (the same activity exported as .fit and .gpx, or re-exported, can start a few seconds apart).
const runDist = r => r.summary ? r.dist : r.d[r.n - 1] - r.d[0];
function sameWorkout(a, b) {
  if (a.id === b.id) return true;
  if (Math.abs(a.start - b.start) > 120000) return false;
  const da = runDist(a), db = runDist(b);
  return Math.abs(da - db) <= 0.05 * Math.max(da, db, 1);
}
// A copy is only worth storing when it adds detail: a full file over an activity-list CSV row,
// or a newer file format version (e.g. one with the GPS route) over an old one.
const betterCopy = (n, old) => (old.summary && !n.summary) || (!old.summary && !n.summary && (n.ver || 1) > (old.ver || 1));
function defaultName(ms) { const h = new Date(ms).getHours(); return (h < 11 ? 'Morning' : h < 14 ? 'Lunch' : h < 18 ? 'Afternoon' : 'Evening') + ' Run'; }

/* ---------- Per-run analysis: orchestrates the versioned algorithms in src/algo/ ---------- */
function smooth(a, w) {
  const n = a.length, o = new Float32Array(n), h = w >> 1; let s = 0, c = 0;
  for (let i = 0; i < Math.min(n, h); i++) if (!isNaN(a[i])) { s += a[i]; c++; }
  for (let i = 0; i < n; i++) {
    const add = i + h, rem = i - h - 1;
    if (add < n && !isNaN(a[add])) { s += a[add]; c++; }
    if (rem >= 0 && !isNaN(a[rem])) { s -= a[rem]; c--; }
    o[i] = c ? s / c : NaN;
  }
  return o;
}
function analyze(r, S, vo2ref) {
  const hrMax = S.hrMaxEff, hrRest = S.hrRest;
  const hrrOf = h => (h - hrRest) / (hrMax - hrRest);
  if (r.summary) {
    const v = r.dist / r.dur, out = { dist: r.dist, mov: r.dur, avgHR: r.avgHR, maxHR: r.maxHR, ascent: r.ascent, cad: r.cad,
      pace: r.dur / (r.dist / 1000), gapPace: r.dur / (r.dist / 1000), efforts: [], zones: null, dec: null, windows: [], est: null, conf: 0 };
    if (r.avgHR) {
      const q = clamp(hrrOf(r.avgHR), 0, 1);
      out.load = LOAD.trimp(r.dur, q, S.sex);
      out.ef = EF.of(v, r.avgHR);
      Object.assign(out, VO2.fromSummary(v, r.avgHR, hrMax));
      const e = BEST.summaryEffort(r, hrMax); if (e) out.efforts.push(e);
    } else out.load = LOAD.noHR(r.dur, v, vo2ref, S.sex);
    return out;
  }
  const n = r.n, d = r.d, hr = r.hr, mv = r.mv;
  const v = new Float32Array(n), veq = new Float32Array(n), K = 3;
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - K), b = Math.min(n - 1, i + K); v[i] = b > a ? (d[b] - d[a]) / ((b - a) * DT) : 0; }
  const altS = r.hasAlt ? smooth(r.alt, 15) : null, g = GAP.grades(d, altS, n);
  const moving = i => mv[i] && v[i] > 0.8;
  let mov = 0, hs = 0, hn = 0, load = 0, gapS = 0, cs = 0, cn = 0, maxHR = 0, asc = 0, desc = 0;
  const zones = [0, 0, 0, 0, 0], zload = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    veq[i] = v[i] * GAP.ratio(g[i]); // grade-adjusted (flat-equivalent) speed
    if (!moving(i)) continue;
    mov += DT; gapS += veq[i] * DT;
    if (r.cad[i] > 0) { cs += r.cad[i]; cn++; }
    if (hr[i] > 0) {
      hs += hr[i]; hn++; maxHR = Math.max(maxHR, hr[i]);
      const q = clamp(hrrOf(hr[i]), 0, 1), tl = LOAD.trimp(DT, q, S.sex), z = ZONE.of(hr[i] / hrMax); load += tl; zones[z] += DT; zload[z] += tl;
    }
  }
  // ascent / descent: smoothed altitude with 3 m hysteresis
  if (altS) { let ref = altS[0]; for (let i = 1; i < n; i++) { if (altS[i] - ref > 3) { asc += altS[i] - ref; ref = altS[i]; } else if (ref - altS[i] > 3) { desc += ref - altS[i]; ref = altS[i]; } } }
  const dist = d[n - 1] - d[0];
  const gapV = mov ? gapS / mov : 0;
  const out = { dist, mov, elapsed: (n - 1) * DT, avgHR: hn ? hs / hn : null, maxHR: hn ? maxHR : null,
    ascent: altS ? asc : null, descent: altS ? desc : null, cad: cn ? cs / cn : null, pace: dist > 0 ? mov / (dist / 1000) : null,
    gapPace: gapV ? 1000 / gapV : null, zones: hn ? zones : null, zoneLoad: hn ? zload : null };
  out.load = hn > n * 0.5 ? load : LOAD.noHR(mov, gapV, vo2ref, S.sex);
  out.ef = EF.of(gapV, out.avgHR);
  Object.assign(out, VO2.fromRun({ n, hr, v, veq, g, moving, hrMax, hasHR: r.hasHR }));
  out.dec = DRIFT.of({ n, hr, veq, moving, mov, hasHR: r.hasHR });
  out.efforts = BEST.efforts(d, hr, n, dist, hrMax);
  return out;
}

/* ---------- Timeline: fitness, VO2max fusion, endurance (FFalg1, VO2alg2, ENDalg1) ---------- */
function dayStart(ms) { const x = new Date(ms); x.setHours(0, 0, 0, 0); return x.getTime(); }

function buildTimeline(runs, res, asOf) {
  // runs sorted by start; res[i] analysis
  const items = runs.map((r, i) => ({ t: r.start, est: res[i].est, conf: res[i].conf, vdots: res[i].efforts.filter(e => e.vdot).map(e => VO2.fromRace(e.D, e.sec)) })); // race-like efforts on the VO2alg3 scale
  const d0 = dayStart(runs[0].start), dEnd = dayStart(asOf);
  const byDay = new Map();
  runs.forEach((r, i) => { const k = dayStart(r.start); const o = byDay.get(k) || { load: 0, sec: 0 }; o.load += res[i].load || 0; o.sec += res[i].mov || 0; byDay.set(k, o); });
  let sl = 0, ss = 0; for (const [k, o] of byDay) if (k < d0 + 28 * DAY) { sl += o.load; ss += o.sec; }
  const span = Math.max(7, Math.min(28, (dEnd - d0) / DAY + 1));
  let ctl = sl / span, atl = ctl, hrs = ss / 3600 / span * 7; const days = [];
  for (let t = d0; t <= dEnd; t = dayStart(t + DAY * 1.5)) {
    const o = byDay.get(t) || { load: 0, sec: 0 };
    ctl += (o.load - ctl) * FF.kC; atl += (o.load - atl) * FF.kA; hrs += (o.sec / 3600 * 7 - hrs) * FF.kC;
    days.push({ t, ctl, atl, tsb: ctl - atl, H: hrs, load: o.load });
  }
  // per-day VO2 & endurance
  let lo = 0;
  for (const day of days) {
    const T = day.t + DAY - 1;
    while (lo < runs.length && runs[lo].start < T - 42 * DAY) lo++;
    let L = 0, ds = 0, dw = 0;
    for (let i = lo; i < runs.length && runs[i].start <= T; i++) {
      L = Math.max(L, (res[i].mov || 0) / 60);
      if (res[i].dec != null && res[i].mov >= 3600) { ds += clamp(res[i].dec, -5, 20) * res[i].mov; dw += res[i].mov; }
    }
    const D = dw ? ds / dw : 7;
    const f = VO2.fuse(items, T);
    day.vo2 = f ? f.v : null; day.vo2hr = f ? f.hr : null; day.vo2perf = f ? f.perf : null;
    day.L = L; day.D = D; day.hasDec = dw > 0;
    day.end = END.score(day.vo2, day.H, L, D);
  }
  return days;
}

/* ---------- Synthetic sample athlete (deterministic) ---------- */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeSample(today) {
  const rnd = mulberry(42), gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return u - 3; };
  const HRMAX = 189, HRREST = 50, end = dayStart(today) - DAY, weeks = 20, start = end - weeks * 7 * DAY;
  const runs = [];
  const plan = [ // [dow offset, kind]
    [1, 'easy'], [3, 'tempo'], [5, 'easy'], [6, 'long']];
  for (let w = 0; w < weeks; w++) {
    const recov = w % 4 === 3;
    for (const [dow, kind0] of plan) {
      let kind = kind0;
      if (w === 9 && dow === 5) kind = 'race5';
      if (w === 18 && dow === 5) kind = 'race10';
      const day = start + (w * 7 + dow) * DAY;
      if (day > end) continue;
      if (rnd() < 0.08) continue; // missed session
      const frac = (day - start) / (end - start);
      const VO2 = 46.5 + 5 * frac;
      const p = { easy: 0.6, tempo: 0.62, long: 0.58, race5: 0.97, race10: 0.93 }[kind];
      let mins = { easy: 42, tempo: 55, long: 70 + 55 * frac, race5: 20, race10: 41 }[kind] * (recov ? 0.7 : 1) * (0.92 + 0.16 * rnd());
      const hilly = rnd() < 0.5, hour = kind === 'long' ? 8 : 18;
      const runStart = day + hour * 3600000 + Math.floor(rnd() * 40) * 60000;
      const n = Math.floor((mins + (kind.startsWith('race') ? 15 : 0)) * 60 / DT);
      const d = new Float32Array(n), hr = new Float32Array(n), alt = new Float32Array(n), cad = new Float32Array(n), mv = new Uint8Array(n).fill(1);
      const route = [{ len: 3200, R: 480, ph: 0.4, sq: 1.5, lat: 47.37 }, { len: 4100, R: 600, ph: 2.1, sq: 0.8, lat: 47.37 }, { len: 2400, R: 360, ph: 1.2, sq: 1.2, lat: 47.37 }][Math.floor(rnd() * 3)];
      const dla = new Float32Array(n), dlo = new Float32Array(n);
      let dist = 0, h = 70, drift = 0;
      for (let i = 0; i < n; i++) {
        const tm = i * DT / 60;
        let q = p;
        if (kind === 'tempo') { const b = tm - 12; q = (b > 0 && b < 34 && (b % 12) < 10) ? 0.86 : 0.6; }
        if (kind.startsWith('race')) q = tm < 12 ? 0.55 : p;
        if (tm < 3) q *= 0.85;
        const terrain = hilly ? 18 * Math.sin(dist / 700) + 8 * Math.sin(dist / 210) : 2 * Math.sin(dist / 500);
        const slope = hilly ? (18 / 700 * Math.cos(dist / 700) + 8 / 210 * Math.cos(dist / 210)) : 0;
        const rat = costRatio(slope);
        const vel = Math.max(1.2, vAt(q * VO2) / Math.pow(rat, 0.6) * (1 + 0.02 * gauss()));
        if (tm > 25) drift += DT / 60 * 0.045 * (kind === 'long' ? 1 : 0.6) * (1 - 0.6 * frac);
        const target = HRMAX * (0.37 + 0.64 * clamp(acsmCost(vel * rat) / VO2, 0, 1.05)) + drift; // Swain, as VO2alg3 assumes
        h += (target - h) * (1 - Math.exp(-DT / 28)) + 0.8 * gauss();
        dist += vel * DT; d[i] = dist;
        { const L = route.len, th = 2 * Math.PI * ((dist % L) / L), rr = route.R * (1 + 0.18 * Math.sin(3 * th + route.ph) + 0.07 * Math.sin(7 * th));
          dla[i] = rr * Math.sin(th) / 111320; dlo[i] = rr * Math.cos(th) * route.sq / (111320 * Math.cos(route.lat * Math.PI / 180)); } hr[i] = Math.round(Math.min(HRMAX + 1, h)); alt[i] = 120 + terrain; cad[i] = Math.round(158 + 9 * (vel - 2.5) + gauss());
      }
      const names = { easy: 'Easy Run', tempo: 'Tempo 3×10 min', long: 'Long Run', race5: 'Park 5K Race', race10: '10K Race' };
      // shift so the trace starts at the origin offset
      const a0 = dla[0], o0 = dlo[0]; for (let i = 0; i < n; i++) { dla[i] -= a0; dlo[i] -= o0; }
      runs.push({ ver: 2, id: 's' + runs.length, start: runStart, n, d, hr, alt, cad, mv, hasHR: true, hasAlt: true,
        hasGPS: true, lat0: 47.37 + 0.004, lon0: 8.54 - 0.01, dla, dlo,
        hrPeak: null, name: names[kind], src: 'Sample', sample: true });
    }
  }
  runs.forEach(r => { let pk = 0; for (let i = 15; i < r.n; i++) { let s = 0; for (let k = i - 15; k < i; k++) s += r.hr[k]; pk = Math.max(pk, s / 15); } r.hrPeak = pk; });
  return { runs, settings: { hrRest: HRREST, hrMax: HRMAX, age: 34, sex: 'm' } };
}
// ===== END CORE =====

/* ---------- splits per km / mile ---------- */
function splitsOf(r, unitM) {
  const out = [], n = r.n, d = r.d; let i0 = 0, target = unitM;
  const altS = r.hasAlt ? smooth(r.alt, 15) : null;
  const seg = (a, b, len) => {
    let mt = 0, hs = 0, hc = 0, gs = 0, cs = 0, cc = 0;
    for (let i = a + 1; i <= b; i++) {
      const v = (d[i] - d[i - 1]) / DT; if (!r.mv[i] || v < 0.8) continue; mt += DT;
      if (r.hr[i] > 0) { hs += r.hr[i]; hc++; } if (r.cad[i] > 0) { cs += r.cad[i]; cc++; }
      if (altS && i > 8 && i < n - 8) { const dd = d[i + 8] - d[i - 8]; gs += dd > 20 ? costRatio(clamp((altS[i + 8] - altS[i - 8]) / dd, -0.3, 0.3)) * DT : DT; } else gs += DT;
    }
    return { len, sec: mt, hr: hc ? hs / hc : null, cad: cc ? cs / cc : null, elev: altS ? altS[b] - altS[a] : null, gap: mt ? mt / (gs / mt) : null };
  };
  for (let i = 1; i < n; i++) if (d[i] - d[0] >= target) { out.push(seg(i0, i, unitM)); i0 = i; target += unitM; }
  const rest = d[n - 1] - d[i0]; if (rest > unitM * 0.1) out.push(seg(i0, n - 1, rest));
  return out;
}

/* ---------- All-day data: users/{uid}/daily/{YYYY-MM-DD}, written by the Garmin export job ---------- */
// Tolerant of field-name variants and series shapes (numbers, [time, value] pairs or {t, v} objects) so a renamed field never breaks the app.
function normDaily(id, o) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id); if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3]).getTime(); o = o || {};
  const pick = (...ks) => { for (const k of ks) { const v = o[k]; if (v != null && v !== '' && isFinite(+v)) return +v; } return null; };
  const vals = (...ks) => { for (const k of ks) { const a = o[k]; if (Array.isArray(a) && a.length) return a.map(p => Array.isArray(p) ? +p[1] : p && typeof p === 'object' ? +(p.v != null ? p.v : p.value) : +p).filter(x => isFinite(x)); } return []; };
  const hr = vals('hrSeries', 'hr_series', 'heartRate', 'hr'), stress = vals('stressSeries', 'stress_series', 'stressValues', 'stress').filter(x => x >= 0), bb = vals('bodyBatterySeries', 'body_battery_series', 'bodyBattery', 'body_battery').filter(x => x >= 0);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const rhr = pick('restingHR', 'restingHr', 'resting_hr', 'restingHeartRate');
  return { id, t, steps: pick('steps', 'totalSteps'), rhr: rhr || (hr.some(x => x > 30) ? Math.min(...hr.filter(x => x > 30)) : null),
    maxHR: pick('maxHR', 'maxHr', 'max_hr', 'maxHeartRate') || (hr.length ? Math.max(...hr) : null),
    stress: pick('stressAvg', 'avgStress', 'averageStress', 'stress_avg') != null ? pick('stressAvg', 'avgStress', 'averageStress', 'stress_avg') : (typeof o.stress === 'number' ? o.stress : avg(stress)),
    stressMax: pick('stressMax', 'maxStress', 'stress_max') != null ? pick('stressMax', 'maxStress', 'stress_max') : (stress.length ? Math.max(...stress) : null),
    bbHigh: pick('bodyBatteryHigh', 'bbHigh', 'body_battery_high', 'bodyBatteryMax') != null ? pick('bodyBatteryHigh', 'bbHigh', 'body_battery_high', 'bodyBatteryMax') : (bb.length ? Math.max(...bb) : null),
    bbLow: pick('bodyBatteryLow', 'bbLow', 'body_battery_low', 'bodyBatteryMin') != null ? pick('bodyBatteryLow', 'bbLow', 'body_battery_low', 'bodyBatteryMin') : (bb.length ? Math.min(...bb) : null),
    sleepScore: pick('sleepScore', 'sleep_score') != null ? pick('sleepScore', 'sleep_score') : (o.sleep && isFinite(+o.sleep.score) ? +o.sleep.score : null),
    hr, stressS: stress, bbS: bb };
}
