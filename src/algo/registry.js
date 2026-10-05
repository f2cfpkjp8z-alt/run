// ===== ALGORITHMS — one file per measurement, each with a versioned id (e.g. VO2alg3) =====
// Every file registers { key, id, name, summary, steps, formula, inputs, limits, history, live? } so the UI can
// explain any number (tap its label) and show which algorithm version produced it.
// To improve an algorithm: copy its logic into a new version, bump the id (VO2alg2 → VO2alg3), add a history
// line saying what changed and why, and log it in change.log.
const ALGOS = {};
function algo(def) { ALGOS[def.key] = def; return def; }
