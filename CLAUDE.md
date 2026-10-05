# Pace & Pulse — notes for Claude

Browser-only running analytics for Garmin Connect exports (FIT/TCX/GPX/ZIP/CSV). Must work on all screen sizes, especially desktop and phone.

## Layout
- `index.html` — the shipped app (GitHub Pages serves it). Single file, no build tools.
- `src/` — the same app in parts. Edit these, then rebuild index.html with `./build.sh` (bumps VERSION and stamps the build time shown at the bottom of every page).
- core.js: parsers, 2 s resampling grid (with GPS offsets), VO2max (anchored HR–VO2 regression, Daniels cost × Minetti grade), endurance score, TRIMP/CTL/ATL, splits, sample athlete.
- store.js: storage/auth interface; LocalBackend (localStorage profiles + IndexedDB) and FirebaseBackend (Auth + Firestore, plus `shares/` links and `feed/` posts). On-device is always the default; `FIREBASE_CONFIG` (or a config pasted in Profile → Storage) makes "Save account online" available.
- ui_social.js: save-account-online flow, share links (#s-<id>) for profiles/workouts/chart images, the feed (publish, follow). Loaded before ui_main.js; no top-level use of ui_main helpers.
- ui_shared.js / ui_main.js: formatting, SVG charts, tabs/router, map, views.

## Rules
- Workout dates always come from the file, never the import time. Workout id = 'a' + start minute.
- Keep everything dependency-free; no bundler.
- Profiles are private. Only explicit share links and published feed posts are visible to others; Firestore rules are in ui_main.js (RULES).
- After changes: commit, push to main; GitHub Pages redeploys automatically.
