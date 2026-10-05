# Pace & Pulse

Running analytics for Garmin Connect exports: VO₂max, endurance score, training load, route maps, splits, trends and records. Runs fully in the browser.

**Live app:** https://YOUR-USERNAME.github.io/YOUR-REPO/

## Use
Open the app, create a profile, then import `.fit`, `.tcx`, `.gpx`, `.zip` or the activities `.csv` from Garmin Connect.

## Files
- `index.html` — the whole app (single file, this is what GitHub Pages serves)
- `src/` — the same code split into parts, for editing. Rebuild `index.html` by concatenating `head.html`, `body.html` and the scripts in order: core, store, ui_shared, ui_main.

## Optional: Firebase sync
Profile → Storage & sync → paste your Firebase web config. In the Firebase console, add `YOUR-USERNAME.github.io` under Authentication → Settings → Authorized domains.
