# Garmin → Pace & Pulse sync

`sync.py` pulls running activities and all-day data from Garmin Connect (python-garminconnect) and writes them to the
same Firestore project the app uses (`pacepulse-585f6`), signing in as your Pace & Pulse account with the app's public web config.

| Firestore path | Content |
| --- | --- |
| `users/{uid}/workouts/a<start minute>` | full running record (2 s grid, same shape the app builds from a FIT file) |
| `users/{uid}/daily/<YYYY-MM-DD>` | `steps`, `restingHR`, `maxHR`, `stressAvg`, `stressMax`, `bodyBatteryHigh/Low`, `sleepScore`, `sleep{…}`, `hrSeries`, `stressSeries`, `bodyBatterySeries` |

Re-running never duplicates: workout ids are the app's own (`'a' + start minute`), runs already stored (same id, or a start within 2 minutes) are skipped,
and a stored CSV summary or older record is replaced by the fuller one. Daily docs are keyed by date and field-merged.

## Environment variables (secrets — never commit)
`GARMIN_EMAIL`, `GARMIN_PASSWORD`, `PP_EMAIL`, `PP_PASSWORD` (the app account must use email + password sign-in).
Optional `GARMINTOKENS` (token cache dir, default `~/.garminconnect`).

Add `--out <dir>` (or `GARMIN_OUT_DIR`) to also save the exported data as JSON (`workouts/<id>.json`, `daily/<date>.json`) in that folder.

```
pip install -r garmin_sync/requirements.txt
python garmin_sync/sync.py --dry-run --days 3   # read only, prints what would be written
python garmin_sync/sync.py                      # last 14 days (default)
python garmin_sync/sync.py --days 365           # backfill
```

`.github/workflows/garmin-sync.yml` runs it twice a day; add the four secrets under Settings → Secrets → Actions.
