#!/usr/bin/env python3
"""Garmin Connect -> Pace & Pulse Firestore.

Writes, for the signed-in Pace & Pulse account (same Firebase project and web config the app uses):
  users/{uid}/workouts/a<start minute>   full running records (2 s grid, same shape as the app builds)
  users/{uid}/daily/<YYYY-MM-DD>         all-day data: steps, HR, stress, body battery, sleep

Safe to run repeatedly: documents have deterministic ids and are overwritten / field-merged, never appended.

Environment (nothing is stored in the repo):
  GARMIN_EMAIL, GARMIN_PASSWORD   Garmin Connect login
  PP_EMAIL, PP_PASSWORD           the Pace & Pulse (Firebase email+password) account
  GARMINTOKENS                    optional dir to cache the Garmin session (default ~/.garminconnect)
  GARMIN_OUT_DIR                  optional, same as --out
"""
import argparse, base64, io, json, math, os, sys, zipfile
from datetime import date, datetime, timedelta, timezone

import numpy as np
import requests

# Public web config of the app (src/store.js FIREBASE_CONFIG); access is enforced by the Firestore rules.
API_KEY = 'AIzaSyDNcmETNQKDUWeF6sLxQM7CoJiIgD5BcJE'
PROJECT = 'pacepulse-585f6'
FS = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
DT = 2  # seconds, analysis grid (core.js)


# ---------------------------------------------------------------- Firestore REST
class Firestore:
    def __init__(self, email, password):
        self.s = requests.Session()
        r = self.s.post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
                        params={'key': API_KEY}, json={'email': email, 'password': password, 'returnSecureToken': True}, timeout=30)
        if r.status_code != 200:
            raise SystemExit('Pace & Pulse sign-in failed: ' + r.json().get('error', {}).get('message', r.text))
        j = r.json(); self.uid, self.token, self.refresh = j['localId'], j['idToken'], j['refreshToken']
        self.base = f'{FS}/users/{self.uid}'

    def _req(self, method, url, **kw):
        for attempt in (0, 1):
            r = self.s.request(method, url, headers={'Authorization': 'Bearer ' + self.token}, timeout=120, **kw)
            if r.status_code == 401 and not attempt:
                t = self.s.post('https://securetoken.googleapis.com/v1/token', params={'key': API_KEY},
                                data={'grant_type': 'refresh_token', 'refresh_token': self.refresh}, timeout=30).json()
                self.token = t['id_token']; continue
            if r.status_code >= 300:
                raise RuntimeError(f'Firestore {r.status_code}: {r.text[:300]}')
            return r.json()

    def existing_workouts(self):
        """id -> {start, summary, ver} for stored workouts (only small fields are fetched)."""
        out, tok = {}, None
        while True:
            params = [('pageSize', 300), ('mask.fieldPaths', 'start'), ('mask.fieldPaths', 'summary'), ('mask.fieldPaths', 'ver')]
            if tok: params.append(('pageToken', tok))
            j = self._req('GET', self.base + '/workouts', params=params)
            for d in j.get('documents', []):
                f = d['fields']; out[d['name'].rsplit('/', 1)[1]] = {
                    'start': int(f.get('start', {}).get('integerValue', f.get('start', {}).get('doubleValue', 0))),
                    'summary': f.get('summary', {}).get('booleanValue', False), 'ver': int(f.get('ver', {}).get('integerValue', 1))}
            tok = j.get('nextPageToken')
            if not tok: return out

    def write(self, path, data, merge=False):
        """Upsert one document. merge=True only touches the given top-level fields."""
        fields = {k: enc(v) for k, v in data.items() if v is not None}
        w = {'update': {'name': f'projects/{PROJECT}/databases/(default)/documents/users/{self.uid}/{path}', 'fields': fields}}
        if merge: w['updateMask'] = {'fieldPaths': ['`%s`' % k if not k.isidentifier() else k for k in fields]}
        self._req('POST', f'{FS}:commit', json={'writes': [w]})


def enc(v):
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, (int, np.integer)): return {'integerValue': str(int(v))}
    if isinstance(v, (float, np.floating)): return {'doubleValue': float(v)}
    if isinstance(v, str): return {'stringValue': v}
    if isinstance(v, np.ndarray):  # typed arrays are stored like the app does: {__t, b: bytes}
        t = {'float32': 'Float32Array', 'uint8': 'Uint8Array'}[str(v.dtype)]
        return {'mapValue': {'fields': {'__t': {'stringValue': t}, 'b': {'bytesValue': base64.b64encode(v.astype('<' + v.dtype.str[1:]).tobytes()).decode()}}}}
    if isinstance(v, dict): return {'mapValue': {'fields': {k: enc(x) for k, x in v.items() if x is not None}}}
    if isinstance(v, (list, tuple)):  # Firestore forbids nested arrays: [t, v] pairs are stored as {t, v} maps (the app's normDaily reads both)
        return {'arrayValue': {'values': [enc({'t': x[0], 'v': x[1]}) if isinstance(x, (list, tuple)) and len(x) == 2 else enc(x) for x in v]}}
    raise TypeError(type(v))


# ---------------------------------------------------------------- FIT -> app workout record (port of core.js parseFIT/buildGrid)
def parse_fit(blob, any_sport=False):
    import fitdecode
    pts, start, sport = [], None, None
    with fitdecode.FitReader(io.BytesIO(blob)) as fr:
        for fr_ in fr:
            if not isinstance(fr_, fitdecode.FitDataMessage): continue
            if fr_.name == 'session':
                if fr_.has_field('start_time'): start = fr_.get_value('start_time')
                if fr_.has_field('sport'): sport = fr_.get_value('sport')
            elif fr_.name == 'record' and fr_.has_field('timestamp'):
                g = lambda k: fr_.get_value(k) if fr_.has_field(k) else None
                lat, lon = g('position_lat'), g('position_long')
                alt = g('enhanced_altitude'); alt = g('altitude') if alt is None else alt
                v = g('enhanced_speed'); v = g('speed') if v is None else v
                cad = g('cadence'); fc = g('fractional_cadence')
                pts.append({'ts': fr_.get_value('timestamp'), 'd': g('distance'), 'hr': g('heart_rate'), 'alt': alt, 'v': v,
                            'cad': None if cad is None else cad + (fc or 0), 'lat': None if lat is None else lat * 180 / 2 ** 31,
                            'lon': None if lon is None else lon * 180 / 2 ** 31})
    if not pts: return None
    if sport is not None and str(sport) != 'running' and not any_sport: return None
    t0 = start or pts[0]['ts']
    if t0.tzinfo is None: t0 = t0.replace(tzinfo=timezone.utc)
    for p in pts:
        ts = p['ts'] if p['ts'].tzinfo else p['ts'].replace(tzinfo=timezone.utc)
        p['t'] = (ts - t0).total_seconds()
    return {'start': int(round(t0.timestamp() * 1000)), 'pts': pts, 'sport': None if sport is None else str(sport)}


def hav(a, b, c, d):
    R, r = 6371008, math.pi / 180
    x, y = math.sin((c - a) * r / 2), math.sin((d - b) * r / 2)
    return 2 * R * math.asin(math.sqrt(x * x + math.cos(a * r) * math.cos(c * r) * y * y))


def build_grid(raw, name):
    pts = sorted([q for q in raw['pts'] if q['t'] >= -5], key=lambda q: q['t'])
    for q in pts:
        q['t'] = max(q['t'], 0)
        if q['lat'] == 0 and q['lon'] == 0: q['lat'] = q['lon'] = None
        if q['lat'] is not None and abs(q['lat']) > 90: q['lat'] = q['lon'] = None
    pts = [q for i, q in enumerate(pts) if i == 0 or q['t'] > pts[i - 1]['t']]
    if len(pts) < 30: return None
    has_d = sum(q['d'] is not None for q in pts) > len(pts) * 0.8
    if not has_d:
        acc = 0.0; has_v = sum(q['v'] is not None for q in pts) > len(pts) * 0.8
        for i, q in enumerate(pts):
            if i:
                pr, dt = pts[i - 1], q['t'] - pts[i - 1]['t']
                if has_v: acc += (q['v'] if q['v'] is not None else (pr['v'] or 0)) * min(dt, 10)
                elif q['lat'] is not None and pr['lat'] is not None: acc += hav(pr['lat'], pr['lon'], q['lat'], q['lon'])
            q['d'] = acc
    else:
        last = 0
        for q in pts:
            if q['d'] is None or q['d'] < last: q['d'] = last
            last = q['d']
    T = pts[-1]['t']; n = int(T // DT) + 1
    if n < 60: return None
    d = np.zeros(n, 'float32'); hr = np.full(n, np.nan, 'float32'); alt = np.full(n, np.nan, 'float32')
    cad = np.full(n, np.nan, 'float32'); mv = np.zeros(n, 'uint8')
    g0 = next((q for q in pts if q['lat'] is not None and q['lon'] is not None), None)
    dla = np.full(n, np.nan, 'float32') if g0 else None; dlo = np.full(n, np.nan, 'float32') if g0 else None
    j = 0
    for i in range(n):
        t = i * DT
        while j < len(pts) - 2 and pts[j + 1]['t'] < t: j += 1
        a, b = pts[j], pts[min(j + 1, len(pts) - 1)]
        span = b['t'] - a['t']; f = min(max((t - a['t']) / span, 0), 1) if span > 0 else 0
        def lerp(x, y):
            return y if x is None else x if y is None else x + (y - x) * f
        d[i] = lerp(a['d'], b['d'])
        if not span > 12:
            h = lerp(a['hr'], b['hr'])
            if h is not None and 30 < h < 240: hr[i] = h
            c = lerp(a['cad'], b['cad'])
            if c is not None and c > 0: cad[i] = c
            mv[i] = 1
        al = lerp(a['alt'], b['alt'])
        if al is not None: alt[i] = al
        if g0:
            la, lo = lerp(a['lat'], b['lat']), lerp(a['lon'], b['lon'])
            if la is not None and lo is not None: dla[i] = la - g0['lat']; dlo[i] = lo - g0['lon']
    pos = cad[cad > 0]  # Garmin stores strides/min: convert to steps/min
    if len(pos) and pos.mean() < 120: cad = cad * 2
    has_hr = bool((hr > 0).any()); has_alt = bool((~np.isnan(alt)).any())
    if has_alt:  # fill alt gaps
        ok = ~np.isnan(alt); idx = np.where(ok, np.arange(n), 0); np.maximum.accumulate(idx, out=idx); alt = alt[idx]
        alt[:np.argmax(ok)] = alt[np.argmax(ok)]
    hr_peak = None
    if has_hr:  # peak 30 s rolling mean (15 samples), all samples present
        W = 15; v = np.where(hr > 0, hr, np.nan)
        if n >= W:
            win = np.lib.stride_tricks.sliding_window_view(v, W); m = win.mean(axis=1)
            m = m[~np.isnan(m)]; hr_peak = float(m.max()) if len(m) else None
    has_gps = bool(g0) and int((~np.isnan(dla)).sum()) > n * 0.3
    start = raw['start']
    return {'ver': 2, 'id': 'a%d' % round(start / 60000), 'start': start, 'n': n, 'd': d, 'hr': hr, 'alt': alt, 'cad': cad, 'mv': mv,
            'hasHR': has_hr, 'hasAlt': has_alt, 'hrPeak': hr_peak, 'hasGPS': has_gps,
            'lat0': g0['lat'] if has_gps else None, 'lon0': g0['lon'] if has_gps else None,
            'dla': dla if has_gps else None, 'dlo': dlo if has_gps else None, 'name': name, 'src': 'GARMIN', 'sport': raw.get('sport')}


# ---------------------------------------------------------------- Garmin
def garmin_login():
    from garminconnect import Garmin
    tok = os.path.expanduser(os.environ.get('GARMINTOKENS', '~/.garminconnect'))
    g = Garmin(os.environ.get('GARMIN_EMAIL'), os.environ.get('GARMIN_PASSWORD'))
    # One login attempt only: garminconnect >= 0.3 loads the cached tokens from `tok` if present, otherwise logs in with the
    # credentials and saves the tokens there, so later runs skip the Garmin login. (A second fallback login would just hit
    # Garmin's rate limit again.)
    mfa, _ = g.login(tok)
    if mfa: raise SystemExit('Garmin asks for a verification (MFA) code; log in once interactively to create the token cache')
    return g


def save_local(out, kind, name, data):
    """Write one exported document as JSON under <out>/<kind>/<name>.json (arrays -> lists, NaN -> null)."""
    def conv(v):
        if isinstance(v, np.ndarray): return [None if (isinstance(x, float) and math.isnan(x)) else x for x in v.tolist()]
        if isinstance(v, dict): return {k: conv(x) for k, x in v.items()}
        if isinstance(v, (list, tuple)): return [conv(x) for x in v]
        if isinstance(v, (np.integer,)): return int(v)
        if isinstance(v, (float, np.floating)): return None if math.isnan(v) else float(v)
        return v
    d = os.path.join(out, kind); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name + '.json'), 'w', encoding='utf-8') as f: json.dump(conv(data), f, separators=(',', ':'))


def series(pairs, lo=None):
    out = []
    for p in pairs or []:
        if p and len(p) >= 2 and p[1] is not None and (lo is None or p[1] >= lo): out.append([int(p[0]), p[1]])
    return out


def daily_doc(g, day):
    ds = day.isoformat(); doc = {'date': ds, 'syncedAt': int(datetime.now(timezone.utc).timestamp() * 1000)}
    def safe(fn, *a):
        try: return fn(*a)
        except Exception as e: print(f'  {ds}: {fn.__name__} failed: {e}', file=sys.stderr); return None
    s = safe(g.get_user_summary, ds) or {}
    doc['steps'] = s.get('totalSteps'); doc['stepGoal'] = s.get('dailyStepGoal')
    h = safe(g.get_heart_rates, ds) or {}
    doc['restingHR'] = h.get('restingHeartRate'); doc['maxHR'] = h.get('maxHeartRate')
    hs = series(h.get('heartRateValues'), 30)
    if hs: doc['hrSeries'] = hs[::5] if len(hs) > 600 else hs   # 2-min samples -> ~10 min; keeps the doc small
    st = safe(g.get_stress_data, ds) or {}
    doc['stressAvg'] = st.get('avgStressLevel'); doc['stressMax'] = st.get('maxStressLevel')
    ss = series(st.get('stressValuesArray'), 0)
    if ss: doc['stressSeries'] = ss
    bb = safe(g.get_body_battery, ds, ds) or []
    vals = series([p for e in bb for p in (e.get('bodyBatteryValuesArray') or [])], 0)
    if vals:
        doc['bodyBatterySeries'] = vals; v = [p[1] for p in vals]; doc['bodyBatteryHigh'] = max(v); doc['bodyBatteryLow'] = min(v)
    sl = (safe(g.get_sleep_data, ds) or {}).get('dailySleepDTO') or {}
    if sl.get('sleepTimeSeconds'):
        score = ((sl.get('sleepScores') or {}).get('overall') or {}).get('value')
        doc['sleepScore'] = score
        doc['sleep'] = {k: sl.get(k) for k in ('sleepTimeSeconds', 'deepSleepSeconds', 'lightSleepSeconds', 'remSleepSeconds', 'awakeSleepSeconds',
                                                'sleepStartTimestampGMT', 'sleepEndTimestampGMT')}
        if score is not None: doc['sleep']['score'] = score
    return {k: v for k, v in doc.items() if v is not None}


def sync_activities(g, fs, days, dry, out=None, all_sports=False):
    """Runs go to Firestore (+ --out). With all_sports, every other activity type is exported to --out only (workouts_other/),
    so the app's running analytics are not polluted by rides, walks, etc."""
    from garminconnect import Garmin
    have = fs.existing_workouts(); start = (date.today() - timedelta(days=days)).isoformat()
    acts = g.get_activities_by_date(start, date.today().isoformat(), None if all_sports else 'running')
    new = upd = skip = 0
    for a in acts:
        aid = a['activityId']; name = a.get('activityName') or 'Run'
        tkey = ((a.get('activityType') or {}).get('typeKey') or '').lower()
        other = all_sports and 'running' not in tkey   # run variants (trail_running, treadmill_running, ...) stay on the normal path
        if other:
            if not out: skip += 1; continue
            fname = f"{a['startTimeGMT'][:16].replace('-', '').replace(':', '').replace(' ', '_')}_{tkey or 'activity'}_{aid}"
            if os.path.exists(os.path.join(out, 'workouts_other', fname + '.json')): skip += 1; continue
            try:
                z = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
                with zipfile.ZipFile(io.BytesIO(z)) as zf:
                    fit = next(zf.read(n) for n in zf.namelist() if n.lower().endswith('.fit'))
                raw = parse_fit(fit, True); rec = build_grid(raw, name) if raw else None
            except Exception as e:
                print(f'  activity {aid} ({tkey}): skipped ({e})', file=sys.stderr); continue
            if not rec: print(f'  other: {fname} has too little data, skipped'); skip += 1; continue
            rec['type'] = tkey; rec['activityId'] = aid
            print(f"  other ({tkey}): {fname} {name} ({rec['n'] * DT // 60} min)")
            save_local(out, 'workouts_other', fname, rec); new += 1; continue
        st_ms = None
        try:  # "startTimeGMT" = 'YYYY-MM-DD HH:MM:SS' (UTC)
            st_ms = int(datetime.strptime(a['startTimeGMT'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).timestamp() * 1000)
        except Exception: pass
        # cheap duplicate check before downloading: same start minute, or within 2 min of an existing workout
        near = [i for i, w in have.items() if st_ms and abs(w['start'] - st_ms) <= 120000]
        if near and not any(have[i]['summary'] or have[i]['ver'] < 2 for i in near): skip += 1; continue
        try:
            z = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
            with zipfile.ZipFile(io.BytesIO(z)) as zf:
                fit = next(zf.read(n) for n in zf.namelist() if n.lower().endswith('.fit'))
            raw = parse_fit(fit); rec = build_grid(raw, name) if raw else None
        except Exception as e:
            print(f'  activity {aid}: skipped ({e})', file=sys.stderr); continue
        if not rec: skip += 1; continue
        old = have.get(rec['id']) or (have[near[0]] if near else None)
        print(f"  {'update' if old else 'new'}: {rec['id']} {name} ({rec['n'] * DT // 60} min)")
        if out: save_local(out, 'workouts', rec['id'], rec)
        if not dry:
            for i in near:  # an existing summary/older copy of the same run is replaced under its own id
                if i != rec['id']: rec['id'] = i; break
            fs.write('workouts/' + rec['id'], {k: v for k, v in rec.items() if k not in ('id',)} | {'id': rec['id']})
        upd += bool(old); new += not old
    print(f'activities: {new} new, {upd} updated, {skip} already stored/skipped')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--days', type=int, default=14, help='how many days back to (re)sync (default 14)')
    ap.add_argument('--no-activities', action='store_true'); ap.add_argument('--no-daily', action='store_true')
    ap.add_argument('--all-sports', action='store_true', help='also export non-running activities (to <out>/workouts_other/ only, never to Firestore)')
    ap.add_argument('--out', default=os.environ.get('GARMIN_OUT_DIR'), help='also save the exported data as JSON files in this folder')
    ap.add_argument('--dry-run', action='store_true', help='read from Garmin, print what would be written')
    a = ap.parse_args()
    need = ['GARMIN_EMAIL', 'GARMIN_PASSWORD', 'PP_EMAIL', 'PP_PASSWORD']
    miss = [k for k in need if not os.environ.get(k)]
    if miss: sys.exit('Missing environment variables: ' + ', '.join(miss))
    fs = Firestore(os.environ['PP_EMAIL'], os.environ['PP_PASSWORD']); g = garmin_login()
    if not a.no_activities: sync_activities(g, fs, a.days, a.dry_run, a.out, a.all_sports)
    if not a.no_daily:
        for k in range(a.days, -1, -1):
            day = date.today() - timedelta(days=k); doc = daily_doc(g, day)
            if len(doc) > 2:
                print(f'  daily {day}: {", ".join(x for x in doc if x not in ("date", "syncedAt"))}')
                if a.out: save_local(a.out, 'daily', day.isoformat(), doc)
                if not a.dry_run: fs.write('daily/' + day.isoformat(), doc, merge=True)
        print('daily: done')


if __name__ == '__main__':
    main()
