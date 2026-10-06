# Pace & Pulse — notes for Claude

Browser-only running analytics for Garmin Connect exports (FIT/TCX/GPX/ZIP/CSV). Must work on all screen sizes, especially desktop and phone.

## Layout
- `index.html` — the shipped app (GitHub Pages serves it). Single file, no build tools.
- `manifest.webmanifest`, `sw.js`, `icons/` — installable web app (home-screen icon on iOS/Android, Chrome install, offline copy). Icons are rendered from the logo; the <head> tags are written by build.sh. Bump CACHE in sw.js only if the cached file list changes.
- `src/` — the same app in parts. Edit these, then rebuild index.html with `./build.sh` (bumps VERSION and stamps the build time shown at the bottom of every page).
- core.js: parsers, 2 s resampling grid (with GPS offsets), analyze() and buildTimeline() orchestration, splits, sample athlete (generated with the same physiology as VO2alg3 (ACSM cost, Swain %HRmax)).
- src/algo/: one file per measurement, each registered with a versioned id via algo({...}) in registry.js:
  VO2alg3 vo2max.js · RATEalg3 rating.js · HRMAXalg4 hrmax.js · LOADalg2 load.js · ZONEalg2 zones.js · FFalg1 fitness.js · ACWRalg2 acwr.js · TSalg1 status.js ·
  ENDalg2 endurance.js · DRIFTalg2 drift.js · BESTalg2 efforts.js · RACEalg2 race.js · EFalg1 efficiency.js · GAPalg1 gap.js.
  Each entry carries summary/steps/formula/inputs/limits/history; the UI shows it in a modal (ui_algo.js).
- ui_algo.js: al(key, text) makes any label open that algorithm's explanation; Profile lists all algorithms.
- store.js: storage/auth interface; LocalBackend (localStorage profiles + IndexedDB) and FirebaseBackend (Auth + Firestore, plus `shares/` links and `feed/` posts). On-device is always the default; `FIREBASE_CONFIG` (or a config pasted in Profile → Storage) makes "Save account online" available.
- ui_social.js: save-account-online flow, share links (#s-<id>) for profiles/workouts/chart images, the feed (publish, follow). Loaded before ui_main.js; no top-level use of ui_main helpers.
- theme.js: appearance (themes Volt/Ember/Glacier/Ultraviolet/Daylight/auto, font style, text size) per device in localStorage 'pp-ui'. Colour tokens live in head.html; chart series use --c1/--c2 (validated colourblind-safe per theme), zones/ramps --z1..--z5.
- ai.js: Gemini AI coach (key + model in localStorage 'pp-ai', never synced); overview card + per-workout opinion, ≤4–5 lines.
- ui_metric.js: per-metric trend pages (#m-vo2, end, ff, race, dist, load, zones, ef) with 7 days / 4 weeks / Year (default 7 days); overview cards link to them via DASH_GO in ui_dash.js.
- ui_image.js: "Share image" for a workout — canvas card (map / route / none, 4:5 or 9:16) with switchable stats and laps.
- ui_dash.js: customizable overview widgets (WIDGETS registry, layout saved in settings.dash as "id:S|M|L") and chart builders shared with Trends.
- ui_shared.js / ui_main.js: formatting, SVG charts (plot: adaptive tick decimals, minSpan, clipping), tabs/router, map, views.
- Font sizes in CSS are rem so the text-size setting scales them; don't add px font sizes.

## Rules
- Every update: add an entry at the top of change.log (version = VERSION + 1, date, a first line "  In short: …" — one short sentence the app shows in its update message — then what changed and why) before running ./build.sh.
- Changing how a measurement is calculated = a new algorithm version: bump its id (e.g. VO2alg2 → VO2alg3) and `since`, add a history line with the reason, and name both ids in change.log. Pure refactors must keep numbers identical.
- Any new place that shows a measurement wraps its label in al('<key>', text).
- Workout dates always come from the file, never the import time. Workout id = 'a' + start minute.
- Keep everything dependency-free; no bundler.
- Profiles are private. Only explicit share links and published feed posts are visible to others; Firestore rules are in ui_main.js (RULES).
- After changes: commit, push to main; GitHub Pages redeploys automatically.
