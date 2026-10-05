# Pace & Pulse — notes for Claude

Browser-only running analytics for Garmin Connect exports (FIT/TCX/GPX/ZIP/CSV). Must work on all screen sizes, especially desktop and phone.

## Layout
- `index.html` — the shipped app (GitHub Pages serves it). Single file, no build tools.
- `src/` — the same app in parts. Edit these, then rebuild index.html:
  ```
  { echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#2a78d6"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html,body{height:100%}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'; cat src/head.html src/body.html; echo '<script>'; cat src/core.js src/store.js src/ui_shared.js src/ui_main.js; echo '</script></body></html>'; } > index.html
  ```
- core.js: parsers, 2 s resampling grid (with GPS offsets), VO2max (anchored HR–VO2 regression, Daniels cost × Minetti grade), endurance score, TRIMP/CTL/ATL, splits, sample athlete.
- store.js: storage/auth interface; LocalBackend (localStorage profiles + IndexedDB) and FirebaseBackend (Auth + Firestore). `FIREBASE_CONFIG` constant enables Firebase by default.
- ui_shared.js / ui_main.js: formatting, SVG charts, tabs/router, map, views.

## Rules
- Workout dates always come from the file, never the import time. Workout id = 'a' + start minute.
- Keep everything dependency-free; no bundler.
- After changes: commit, push to main; GitHub Pages redeploys automatically.
