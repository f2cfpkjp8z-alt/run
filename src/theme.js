// ===== APPEARANCE: theme, font style, text size — stored per device, applied before first paint =====
// [id, name, mode, page background, accent] — colour tokens live in head.html under :root[data-theme=…]
const THEMES = [
  ['volt', 'Volt', 'dark', '#0b0f13', '#c6f24e'],
  ['ember', 'Ember', 'dark', '#110c0a', '#ff8f3f'],
  ['glacier', 'Glacier', 'dark', '#08111c', '#4fd1f0'],
  ['uv', 'Ultraviolet', 'dark', '#0d0a15', '#b197ff'],
  ['daylight', 'Daylight', 'light', '#f3f5f0', '#3b7d16'],
  ['auto', 'Match device', 'auto', null, null],
];
// font stacks live in head.html under :root[data-font=…]; this only loads the web fonts on demand
const FONTS = {
  sport: ['Sport', 'family=Saira+Condensed:wght@500;600;700&family=Manrope:wght@400;500;600;700'],
  classic: ['Classic', 'family=Barlow+Condensed:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700'],
  rounded: ['Rounded', 'family=Nunito:wght@400;600;700;800'],
  tech: ['Technical', 'family=Space+Grotesk:wght@400;500;600;700'],
  readable: ['Easy to read', 'family=Atkinson+Hyperlegible:wght@400;700'],
  system: ['System', null],
};
const SIZES = [['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Extra large']];
function uiPrefs() { return Object.assign({ theme: 'volt', font: 'sport', size: 'm' }, lsGet('pp-ui', {})); }
function applyUI(p = uiPrefs()) {
  const root = document.documentElement;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  let t = THEMES.find(x => x[0] === p.theme) || THEMES[0];
  if (t[0] === 'auto') t = dark ? THEMES[0] : THEMES[4];
  const font = FONTS[p.font] ? p.font : 'sport', size = SIZES.some(x => x[0] === p.size) ? p.size : 'm';
  if (FONTS[font][1] && !document.getElementById('font-' + font)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'font-' + font;
    l.href = 'https://fonts.googleapis.com/css2?' + FONTS[font][1] + '&display=swap'; document.head.appendChild(l);
  }
  Object.assign(root.dataset, { theme: t[0], mode: t[2], font, size });
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = t[3];
}
function setUI(patch) { const p = Object.assign(uiPrefs(), patch); lsSet('pp-ui', p); applyUI(p); }
applyUI();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (uiPrefs().theme === 'auto') applyUI(); });
// ===== END APPEARANCE =====
