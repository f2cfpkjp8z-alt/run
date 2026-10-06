# Pace & Pulse — notes for Claude

Browser-only running analytics for Garmin Connect exports (FIT/TCX/GPX/ZIP/CSV). Must work on all screen sizes, especially desktop and phone.

## Layout
- `index.html` — the shipped app (GitHub Pages serves it). Single file, no build tools.
- `manifest.webmanifest`, `sw.js`, `icons/` — installable web app (home-screen icon on iOS/Android, Chrome install, offline copy). Icons are rendered from the logo; the <head> tags are written by build.sh. Bump CACHE in sw.js only if the cached file list changes.
- `src/` — the same app in parts. Edit these, then rebuild index.html with `./build.sh` (bumps VERSION and stamps the build time shown at the bottom of every page).
- core.js: parsers, 2 s resampling grid (with GPS offsets), analyze() and buildTimeline() orchestration, splits, sample athlete (generated with the same physiology as VO2alg3 (ACSM cost, Swain %HRmax)).
- src/algo/: one file per measurement, each registered with a versioned id via algo({...}) in registry.js:
  VO2alg3 vo2max.js · RATEalg3 rating.js · HRMAXalg4 hrmax.js · LOADalg2 load.js · ZONEalg2 zones.js · FFalg1 fitness.js · ACWRalg2 acwr.js · TSalg1 status.js · LFalg1 loadfocus.js ·
  ENDalg2 endurance.js · DRIFTalg2 drift.js · BESTalg2 efforts.js · RACEalg2 race.js · EFalg1 efficiency.js · GAPalg1 gap.js.
  Each entry carries summary/steps/formula/inputs/limits/history; the UI shows it in a modal (ui_algo.js).
- ui_algo.js: al(key, text) makes any label open that algorithm's explanation; Profile lists all algorithms.
- store.js: storage/auth interface; FirebaseBackend (Firebase Auth + Firestore users/{uid} with settings, ui, ai key/model, aiCache; users/{uid}/workouts; `shares/` links; `feed/` posts) and LocalBackend (localStorage profiles + IndexedDB). FIREBASE_CONFIG is the app's own project (pacepulse-585f6) and is the default for everyone; users can't paste their own. Local profiles remain only for browsers that already have them or pick "this device only".
- Saved analysis: compute() (ui_main.js) stores each workout's analyze() result as r.an = { k, j } keyed by all algorithm ids + hrMaxEff/hrRest/sex + vo2ref and saves it via backend.saveAnalysis; results are reused on load and recomputed only when that key changes. If analyze() starts reading another setting, add it to anSig.
- ui_social.js: save-account-online flow, share links (#s-<id>) for profiles/workouts/chart images, the feed (publish, follow). Loaded before ui_main.js; no top-level use of ui_main helpers.
- theme.js: appearance (themes Volt/Ember/Glacier/Ultraviolet/Asphalt/Daylight/auto, font style, text size) in localStorage 'pp-ui' for first paint, synced to the online profile (ui) via uiSync. Colour tokens live in head.html; chart series use per-measurement tokens (--pace, --hr, --elev, --vo2, --end, --fit, --fat, --form, --dist, --load, --ef, --race, --drift; they default to --c1/--c2, validated colourblind-safe per theme; Asphalt gives each its own colour), zones/ramps --z1..--z5.
- ai.js: Gemini AI coach (default gemini-3.5-flash-lite; key + model + saved opinions in the online profile, localStorage 'pp-ai' only for on-device profiles); overview card + per-workout opinion, ≤4–5 lines.
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
