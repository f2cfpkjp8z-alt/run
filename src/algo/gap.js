// ===== GAPalg1 — grade-adjusted pace (flat-equivalent speed) =====
const GAP = algo({
  key: 'gap', id: 'GAPalg1', name: 'Grade-adjusted pace', since: 1,
  summary: 'The flat-ground pace that would cost the same energy as your pace on hills.',
  steps: [
    'Altitude is smoothed over 30 s; gradient = rise / distance over ±16 s (only when that distance exceeds 20 m), limited to ±30%.',
    'Minetti’s measured energy cost of running on a slope is divided by its flat value (3.6 J/kg/m) to get a cost ratio.',
    'Speed × cost ratio = flat-equivalent speed. Grade-adjusted pace is moving time over the flat-equivalent distance.',
  ],
  formula: 'C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6   (J/kg/m, i = gradient)\nratio = max(0.45, C(i) / 3.6)\nv_flat = v · ratio',
  inputs: 'Distance and altitude from the file.',
  limits: 'GPS-only altitude is noisy; barometric altitude gives better grades. Very steep downhills are capped.',
  history: [['GAPalg1', 1, 'Minetti et al. (2002) polynomial, ratio floor 0.45.']],
  ratio(i) { i = clamp(i, -0.3, 0.3); return Math.max(0.45, (155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6) / 3.6); },
  grades(d, altS, n) {
    const g = new Float32Array(n); if (!altS) return g;
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 8), b = Math.min(n - 1, i + 8), dd = d[b] - d[a]; g[i] = dd > 20 ? clamp((altS[b] - altS[a]) / dd, -0.3, 0.3) : 0; }
    return g;
  },
});
const costRatio = i => GAP.ratio(i);
