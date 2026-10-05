# Pace & Pulse — notes for Claude

Browser-only running analytics for Garmin Connect exports (FIT/TCX/GPX/ZIP/CSV). Must work on all screen sizes, especially desktop and phone.

## Layout
- `index.html` — the shipped app (GitHub Pages serves it). Single file, no build tools.
- `src/` — the same app in parts. Edit these, then rebuild index.html with `./build.sh` (bumps VERSION and stamps the build time shown at the bottom of every page).
- core.js: parsers, 2 s resampling grid (with GPS offsets), VO2max (grade-adjusted speed regressed on HR, anchored at (HRrest, 0), extrapolated to HRmax = vVO2max, then Daniels cost → VDOT scale; fused with race-like efforts), endurance score, TRIMP/CTL/ATL, splits, sample athlete (generated with the same linear HR–speed model).
- store.js: storage/auth interface; LocalBackend (localStorage profiles + IndexedDB) and FirebaseBackend (Auth + Firestore, plus `shares/` links and `feed/` posts). On-device is always the default; `FIREBASE_CONFIG` (or a config pasted in Profile → Storage) makes "Save account online" available.
- ui_social.js: save-account-online flow, share links (#s-<id>) for profiles/workouts/chart images, the feed (publish, follow). Loaded before ui_main.js; no top-level use of ui_main helpers.
- theme.js: appearance (themes Volt/Ember/Glacier/Ultraviolet/Daylight/auto, font style, text size) per device in localStorage 'pp-ui'. Colour tokens live in head.html; chart series use --c1/--c2 (validated colourblind-safe per theme), zones/ramps --z1..--z5.
- ai.js: Gemini AI coach (key + model in localStorage 'pp-ai', never synced); overview card + per-workout opinion, ≤4–5 lines.
- ui_dash.js: customizable overview widgets (WIDGETS registry, layout saved in settings.dash as "id:S|M|L") and chart builders shared with Trends.
- ui_shared.js / ui_main.js: formatting, SVG charts (plot: adaptive tick decimals, minSpan, clipping), tabs/router, map, views.
- Font sizes in CSS are rem so the text-size setting scales them; don't add px font sizes.

## Rules
- Workout dates always come from the file, never the import time. Workout id = 'a' + start minute.
- Keep everything dependency-free; no bundler.
- Profiles are private. Only explicit share links and published feed posts are visible to others; Firestore rules are in ui_main.js (RULES).
- After changes: commit, push to main; GitHub Pages redeploys automatically.
