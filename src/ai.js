// ===== AI COACH (Google Gemini) — the API key stays on this device; data is sent only when the runner asks =====
const AI_DEFAULT_MODEL = 'gemini-2.5-flash';
const AI_API = 'https://generativelanguage.googleapis.com/v1beta/';
function aiCfg() { return Object.assign({ key: '', model: AI_DEFAULT_MODEL }, lsGet('pp-ai', {})); }
const aiPid = () => st.user ? st.user.id : 'guest';
function aiCache() { const c = lsGet('pp-ai-cache', {}); return c[aiPid()] || { overview: null, w: {} }; }
function aiCacheSet(fn) { const all = lsGet('pp-ai-cache', {}), c = all[aiPid()] || { overview: null, w: {} }; fn(c);
  const ids = Object.keys(c.w); if (ids.length > 40) ids.sort((a, b) => c.w[a].at - c.w[b].at).slice(0, ids.length - 40).forEach(k => delete c.w[k]);
  all[aiPid()] = c; lsSet('pp-ai-cache', all); }

async function gemini(prompt, system) {
  const c = aiCfg(); if (!c.key) throw new Error('Add a Gemini API key in Profile → AI coach first.');
  const model = c.model.replace(/^models\//, '');
  const gen = { temperature: 0.4, maxOutputTokens: 2048 };
  if (/^gemini-2\.5-flash/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 }; // short answers don't need thinking tokens
  const r = await fetch(AI_API + 'models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: gen }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Gemini answered with error ' + r.status + '.');
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const text = parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!text) throw new Error(j.promptFeedback && j.promptFeedback.blockReason ? 'Gemini declined to answer (' + j.promptFeedback.blockReason + ').' : 'Gemini returned no text. Try again.');
  return text;
}
async function geminiModels(key) {
  const r = await fetch(AI_API + 'models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Key check failed (' + r.status + ').');
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/.test(m.name) && !/embed|tts|image|audio|live|vision/.test(m.name))
    .map(m => m.name.replace(/^models\//, '')).sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || b.localeCompare(a));
}

/* ---------- what the coach sees: numbers the app already computed ---------- */
function aiSystem(lines) {
  let lang = navigator.language || 'en'; try { lang = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) || lang; } catch (e) { }
  return `You are a concise, encouraging running coach. You review numbers that the app "Pace & Pulse" computed from the runner's Garmin files.
Reply with ${lines} short lines at most (use 5 only if there is a lot that matters). Each line: one emoji, then one plain sentence of at most 110 characters.
Cover what they did well, what is missing or risky, and one concrete next step. Quote the numbers that matter. No heading, no preamble, no markdown, no medical diagnosis.
VO2max is on Daniels' VDOT scale. Load is Banister TRIMP. Write in ${lang}.`;
}
function aiAthlete() {
  const S = st.S, u = uName();
  return `Athlete: ${S.sex === 'f' ? 'female' : 'male'}${S.age ? ', age ' + S.age : ''}, max HR ${Math.round(S.hrMaxEff)} (${S.hrMax ? 'entered' : 'auto'}), resting HR ${S.hrRest}${S.weight ? ', ' + S.weight + ' kg' : ''}. Units: ${u}. Today: ${new Date(st.asOf).toDateString()}.`;
}
function aiRunLine(r, e) {
  return `${new Date(r.start).toDateString()} | ${r.name} | ${fmtDist(e.dist)} ${uName()} | ${fmtDur(e.mov)} | pace ${fmtPace(e.pace)} | GAP ${fmtPace(e.gapPace)} | avgHR ${e.avgHR ? Math.round(e.avgHR) : '-'} | maxHR ${e.maxHR ? Math.round(e.maxHR) : '-'} | load ${Math.round(e.load || 0)} | VO2 est ${e.est ? e.est.toFixed(1) : '-'} | HR drift ${e.dec != null ? e.dec.toFixed(1) + '%' : '-'} | ascent ${e.ascent != null ? Math.round(e.ascent) + ' m' : '-'}`;
}
function aiOverviewPrompt() {
  const D = lastDay(), a4 = dayAt(D.t - 28 * DAY), a12 = dayAt(D.t - 84 * DAY), T = dayStart(st.asOf) + DAY;
  let a7 = 0, c28 = 0; const z = [0, 0, 0, 0, 0];
  st.runs.forEach((r, i) => { const e = st.res[i]; if (r.start >= T - 7 * DAY) a7 += e.load || 0; if (r.start >= T - 28 * DAY) { c28 += e.load || 0; if (e.zones) e.zones.forEach((s, k) => z[k] += s); } });
  const zt = z.reduce((x, y) => x + y, 0), pc = x => zt ? Math.round(x / zt * 100) + '%' : '-';
  const wk = weekly().slice(-8).map(w => `${fmtDate(w[0] - 3.5 * DAY)}: ${w[1].toFixed(1)} (${w[2]} runs)`).join('; ');
  const recent = st.runs.map((r, i) => [r, st.res[i]]).slice(-12).reverse().map(([r, e]) => aiRunLine(r, e)).join('\n');
  const best = {}; st.runs.forEach((r, i) => { for (const e of st.res[i].efforts) if (e.label !== 'Run' && (!best[e.label] || e.sec < best[e.label].sec)) best[e.label] = { sec: e.sec, t: r.start }; });
  return `${aiAthlete()}
Current: VO2max ${D.vo2 ? D.vo2.toFixed(1) : 'unknown'} (4 weeks ago ${a4 && a4.vo2 ? a4.vo2.toFixed(1) : '-'}, 12 weeks ago ${a12 && a12.vo2 ? a12.vo2.toFixed(1) : '-'}; HR model ${D.vo2hr ? D.vo2hr.toFixed(1) : '-'}, race efforts ${D.vo2perf ? D.vo2perf.toFixed(1) : '-'}).
Endurance score ${D.end ? Math.round(D.end) + ' (' + tierOf(D.end) + ')' : '-'}. Fitness CTL ${Math.round(D.ctl)}, fatigue ATL ${Math.round(D.atl)}, form ${Math.round(D.tsb)}. Weekly running time ${fmtDur(D.H * 3600)} (42-day avg). Longest run in 6 weeks ${Math.round(D.L)} min. HR drift on 60+ min runs ${D.hasDec ? D.D.toFixed(1) + '%' : 'no data'}.
Load: last 7 days ${Math.round(a7)} vs weekly average of last 4 weeks ${Math.round(c28 / 4)}.
Intensity, last 4 weeks (time in HR zones): easy Z1-2 ${pc(z[0] + z[1])}, moderate Z3 ${pc(z[2])}, hard Z4-5 ${pc(z[3] + z[4])}.
Weekly distance (${uName()}), oldest first: ${wk}.
Race predictions: ${D.vo2 ? racePreds(D).map(([n, t]) => n + ' ' + fmtDur(t)).join(', ') : '-'}.
Best efforts: ${Object.entries(best).map(([l, b]) => `${l} ${fmtDur(b.sec)} (${new Date(b.t).toDateString()})`).join(', ') || '-'}.
Recent workouts, newest first:
${recent}

Give your read on this runner's training.`;
}
function aiWorkoutPrompt(r, e) {
  const sp = r.summary ? [] : splitsOf(r, U()), D = dayAt(r.start);
  const splits = sp.map((s, k) => `${k + 1}: ${fmtPace(s.sec / (s.len / 1000))}${s.hr ? ' @' + Math.round(s.hr) : ''}${s.elev != null ? ' ' + (s.elev >= 0 ? '+' : '') + Math.round(s.elev) + 'm' : ''}`).join(', ');
  const zt = e.zones ? e.zones.reduce((a, b) => a + b, 0) : 0;
  return `${aiAthlete()}
Fitness that day: VO2max ${D && D.vo2 ? D.vo2.toFixed(1) : '-'}, CTL ${D ? Math.round(D.ctl) : '-'}, form ${D ? Math.round(D.tsb) : '-'}.
Workout: ${aiRunLine(r, e)}
${e.zones ? 'Time in zones Z1-Z5: ' + e.zones.map(s => Math.round(s / zt * 100) + '%').join(' / ') : 'No heart rate.'}
${splits ? 'Splits per ' + uName() + ' (pace @HR, elevation): ' + splits : ''}
${e.efforts.length ? 'Best efforts in this run: ' + e.efforts.map(x => x.label + ' ' + fmtDur(x.sec)).join(', ') : ''}
Recent workouts before it:
${st.runs.map((x, i) => [x, st.res[i]]).filter(([x]) => x.start < r.start && x.start > r.start - 21 * DAY).slice(-6).reverse().map(([x, y]) => aiRunLine(x, y)).join('\n') || 'none'}

Give your read on this one workout: execution, pacing, effort and what it means for training.`;
}
function aiLines(text, max = 5) {
  return text.split(/\n+/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*|__|`/g, '').replace(/^#+\s*/, '').trim()).filter(Boolean).slice(0, max);
}
function aiList(text) {
  return `<ul class="ai-lines">${aiLines(text).map(l => { const m = l.match(/^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.*)$/u);
    return `<li><span aria-hidden="true">${m ? m[1] : '•'}</span><span>${esc(m ? m[2] : l)}</span></li>`; }).join('')}</ul>`;
}
const aiAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : fmtDate(t, { day: 'numeric', month: 'short' }); };
const aiSig = () => st.runs.length + ':' + (st.runs.length ? st.runs[st.runs.length - 1].id : '') + ':' + st.S.hrMaxEff + ':' + st.S.hrRest;

/* ---------- overview card ---------- */
function renderAICard(el, busy, err) {
  const c = aiCfg(), cache = aiCache().overview;
  const hd = head('AI coach', c.key ? `<span class="muted sm">Google Gemini</span>` : '');
  if (!c.key) {
    el.innerHTML = hd + `<p class="sub" style="margin:0 0 12px">Get a short read on your training — what you do well, what you’re missing and what to do next — from Google Gemini.</p><div class="btns"><button type="button" class="primary" data-ai="setup">Set up AI coach</button></div>`;
  } else if (!st.runs.length) {
    el.innerHTML = hd + '<p class="empty">Import workouts to get a read on your training.</p>';
  } else {
    const stale = cache && cache.sig !== aiSig();
    el.innerHTML = hd + (busy ? `<p class="sub"><span class="ai-busy"></span> Reading your training…</p>` : cache ? aiList(cache.text) : `<p class="sub" style="margin:0">Ask for a short read on your last weeks of training.</p>`)
      + (err ? `<p class="form-err" style="margin-top:10px">${esc(err)}</p>` : '')
      + `<div class="foot" style="justify-content:space-between;margin-top:12px"><span class="ai-meta">${cache ? `Updated ${aiAgo(cache.at)} · ${esc(cache.model)}${stale ? ' · new data since' : ''}` : 'Your stats and recent workouts are sent to Google when you ask.'}</span>
        <button type="button" class="${cache && !stale ? '' : 'primary'}" data-ai="ask"${busy ? ' disabled' : ''}>${cache ? 'Ask again' : 'Ask coach'}</button></div>`;
  }
  const s = el.querySelector('[data-ai="setup"]'); if (s) s.onclick = gotoAISettings;
  const a = el.querySelector('[data-ai="ask"]'); if (a) a.onclick = async () => {
    renderAICard(el, true);
    try { const text = await gemini(aiOverviewPrompt(), aiSystem(4)); aiCacheSet(x => x.overview = { text, at: Date.now(), sig: aiSig(), model: aiCfg().model }); renderAICard(el); }
    catch (e) { renderAICard(el, false, e.message); }
  };
}
function gotoAISettings() { location.hash = '#profile'; setTimeout(() => { const c = $('#aiCard'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const k = $('#aiKey'); if (k) k.focus({ preventScroll: true }); } }, 120); }

/* ---------- per-workout opinion ---------- */
function renderWorkoutAI(box, r, e, run) {
  const c = aiCfg(), cached = aiCache().w[r.id];
  if (!c.key) { if (!run) { box.hidden = true; return; } box.hidden = false; box.innerHTML = head('AI opinion') + `<p class="sub" style="margin:0 0 12px">Add a Gemini API key to get a short opinion on this workout.</p><button type="button" class="primary" id="wAiSet">Set up AI coach</button>`; $('#wAiSet').onclick = gotoAISettings; return; }
  if (!run && !cached) { box.hidden = true; return; }
  box.hidden = false;
  const draw = (busy, err) => {
    const cc = aiCache().w[r.id];
    box.innerHTML = head('AI opinion', '<span class="muted sm">Google Gemini</span>') + (busy ? '<p class="sub"><span class="ai-busy"></span> Looking at this run…</p>' : cc ? aiList(cc.text) : '')
      + (err ? `<p class="form-err" style="margin-top:10px">${esc(err)}</p>` : '')
      + (cc && !busy ? `<div class="foot" style="justify-content:space-between;margin-top:10px"><span class="ai-meta">${aiAgo(cc.at)} · ${esc(cc.model)}</span><button type="button" id="wAiAgain">Ask again</button></div>` : '');
    const ag = $('#wAiAgain'); if (ag) ag.onclick = ask;
  };
  const ask = async () => {
    draw(true);
    try { const text = await gemini(aiWorkoutPrompt(r, e), aiSystem(4)); aiCacheSet(x => x.w[r.id] = { text, at: Date.now(), model: aiCfg().model }); draw(); }
    catch (err) { draw(false, err.message); }
  };
  if (run && !cached) ask(); else draw();
}

/* ---------- settings card ---------- */
function renderAISettings() {
  const c = aiCfg(), el = $('#aiCard');
  el.innerHTML = `<div class="ch"><h3>AI coach</h3><span class="chip ${c.key ? 'good' : ''}"><i></i>${c.key ? 'Gemini key saved' : 'Not set up'}</span></div>
    <p class="sub" style="margin:0 0 12px">Uses Google Gemini. Create a free API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and paste it here.</p>
    <form class="form1" id="aiForm" autocomplete="off">
      <label for="aiKey">Gemini API key<div class="linkrow"><input id="aiKey" type="password" spellcheck="false" placeholder="AIza…" value="${esc(c.key)}"><button type="button" id="aiShow">Show</button></div></label>
      <label for="aiModel">Model<select id="aiModel">${[...new Set([c.model, AI_DEFAULT_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.5-pro'])].map(m => `<option${m === c.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select><span class="hint">“Check key” lists the models your key can use. Flash models are fast and free-tier friendly.</span></label>
      <p class="form-err" id="aiErr" hidden></p>
      <div class="btns"><button type="submit" class="primary">Save</button><button type="button" id="aiCheck">Check key</button>${c.key ? '<button type="button" class="danger" id="aiDel">Remove key</button>' : ''}</div>
    </form>
    <p class="fine" style="margin-top:12px">The key is stored only in this browser. When you ask for an opinion, your settings, computed stats and recent workout summaries (no GPS routes) are sent to Google.</p>`;
  const msg = (t, ok) => { const e = $('#aiErr'); e.textContent = t; e.hidden = !t; e.style.color = ok ? 'var(--good-ink)' : ''; };
  $('#aiShow').onclick = () => { const k = $('#aiKey'); k.type = k.type === 'password' ? 'text' : 'password'; $('#aiShow').textContent = k.type === 'password' ? 'Show' : 'Hide'; };
  $('#aiForm').onsubmit = ev => { ev.preventDefault(); lsSet('pp-ai', { key: $('#aiKey').value.trim(), model: $('#aiModel').value }); renderAISettings(); msg('Saved.', true); };
  $('#aiCheck').onclick = async () => {
    const key = $('#aiKey').value.trim(); if (!key) { msg('Paste a key first.'); return; }
    msg('Checking…', true);
    try { const ms = await geminiModels(key); if (!ms.length) throw new Error('This key has no Gemini text models.');
      const cur = $('#aiModel').value, pick = ms.includes(cur) ? cur : ms.find(m => /^gemini-[\d.]+-flash$/.test(m)) || ms[0];
      $('#aiModel').innerHTML = ms.map(m => `<option${m === pick ? ' selected' : ''}>${esc(m)}</option>`).join('');
      lsSet('pp-ai', { key, model: pick }); msg(`Key works. ${ms.length} models available; using ${pick}.`, true);
    } catch (e) { msg(e.message); }
  };
  if ($('#aiDel')) $('#aiDel').onclick = () => { lsSet('pp-ai', { key: '', model: aiCfg().model }); renderAISettings(); };
}
// ===== END AI COACH =====
