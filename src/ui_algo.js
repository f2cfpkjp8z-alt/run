// ===== ALGORITHM INFO: every measurement label is clickable and opens how it's calculated + its version =====
// al('vo2', 'VO₂max') → a label that opens the VO2alg… explanation. Works inside any innerHTML string.
const al = (key, text) => ALGOS[key] ? `<span class="algo-l" role="button" tabindex="0" data-algo="${key}" title="How ${esc(ALGOS[key].name)} is calculated (${ALGOS[key].id})">${text}</span>` : text;
function showAlgo(key) {
  const a = ALGOS[key]; if (!a) return;
  const live = a.live ? a.live() : '';
  openDlg(`<p class="eyebrow">How it’s calculated</p><h2>${esc(a.name)}</h2>
    <div class="btns" style="margin:4px 0 12px"><span class="chip acc"><i></i>Current algorithm ${esc(a.id)}</span><span class="chip">since app version ${a.since}</span></div>
    <p>${esc(a.summary)}</p>${live ? `<p class="sub">${live}</p>` : ''}
    <ol class="algo-steps">${a.steps.map(s => `<li>${linkIds(esc(s))}</li>`).join('')}</ol>
    <div class="formula">${esc(a.formula)}</div>
    <p class="sub" style="margin-top:12px"><b>Uses:</b> ${esc(a.inputs)}</p>${a.notes ? `<ul class="algo-steps">${a.notes.map(n => `<li>${linkIds(esc(n))}</li>`).join('')}</ul>` : ''}
    <p class="sub"><b>Limits:</b> ${esc(a.limits)}</p>
    <details style="margin-top:6px"${a.history.length > 1 ? ' open' : ''}><summary>Version history</summary><ul class="algo-hist">${a.history.slice().reverse().map(([id, v, t]) => `<li><b>${esc(id)}</b> <span class="muted sm">app v${v}${id === a.id ? ' · current' : ''}</span><br>${esc(t)}</li>`).join('')}</ul></details>`);
}
// algorithm ids mentioned inside an explanation become links to that explanation
const linkIds = html => html.replace(/\b([A-Z0-9]+alg\d+)\b/g, (m, id) => { const a = Object.values(ALGOS).find(x => x.id === id); return a ? `<span class="algo-l" role="button" tabindex="0" data-algo="${a.key}">${id}</span>` : m; });
function renderMethods() {
  $('#algoList').innerHTML = Object.values(ALGOS).map(a => `<button type="button" class="algo-card" data-algo="${a.key}"><span><b>${esc(a.name)}</b><span class="chip acc"><i></i>${esc(a.id)}</span></span><span class="sub">${esc(a.summary)}</span></button>`).join('');
}
function initAlgo() {
  document.addEventListener('click', ev => { const t = ev.target.closest('[data-algo]'); if (t) { ev.preventDefault(); ev.stopPropagation(); showAlgo(t.dataset.algo); } }, true);
  document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.algo-l')) { ev.preventDefault(); showAlgo(ev.target.dataset.algo); } });
}
/* ---------- phone: explanations hide behind a “?” on each card ---------- */
// Captions (.cap), hints (.hint), fine print (.fine) and anything marked .help are hidden on phones by CSS;
// each card that has some gets a ? button that shows them (plus “How it’s calculated” when the card has one).
const HELP_SEL = '.cap, .hint, .fine, .help';
function addHelp() {
  $$('.view:not([hidden]) .card, #v-overview .card').forEach(card => {
    if (card.closest('.dlg')) return;
    const items = [...card.querySelectorAll(HELP_SEL)].filter(x => x.textContent.trim());
    let b = card.querySelector(':scope > .help-btn, :scope > .ch > .help-btn');
    if (!items.length) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.className = 'help-btn'; b.textContent = '?'; b.setAttribute('aria-label', 'Explain');
      const row = card.querySelector(':scope > .ch'); if (row) row.appendChild(b); else card.appendChild(b);
    }
    b.onclick = ev => { ev.stopPropagation(); showHelp(card); };
  });
}
function showHelp(card) {
  const t = card.querySelector('h3, .label'), algoEl = card.querySelector('[data-algo]');
  const items = [...card.querySelectorAll(HELP_SEL)].filter(x => x.textContent.trim());
  openDlg(`<h2>${esc(t ? t.textContent : 'About this')}</h2>${items.map(x => `<p>${x.innerHTML}</p>`).join('')}
    ${algoEl ? `<div class="btns"><button type="button" class="primary" data-algo="${algoEl.dataset.algo}">How it’s calculated</button></div>` : ''}`);
}
// ===== END ALGORITHM INFO =====
