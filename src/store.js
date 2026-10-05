// ===== STORAGE & AUTH =====
// Every backend implements the same interface, so the UI never knows where data lives:
//   init() · user() · accounts() · signIn(cred) · signUp(info) · signOut()
//   updateProfile(patch) · deleteAccount()
//   listWorkouts() · putWorkouts(list) · deleteWorkout(id) · clearWorkouts()
// Paste your Firebase web-app config here (Firebase console → Project settings → Your apps →
// SDK setup and configuration → Config) to offer online accounts, sharing and the feed.
// On-device profiles stay the default; users opt in with "Save account online".
const FIREBASE_CONFIG = null; // e.g. { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

const DEFAULT_SETTINGS = { hrMax: null, hrRest: 55, age: null, sex: 'm', units: 'km', weight: null, height: null };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Local: profiles in localStorage, workouts in IndexedDB ---------- */
const LocalBackend = {
  kind: 'local', label: 'This device', secure: false,
  db: null, mem: new Map(),
  async init() {
    try {
      this.db = await new Promise((res, rej) => {
        const rq = indexedDB.open('pace-pulse', 2);
        rq.onupgradeneeded = ev => {
          const db = rq.result, tx = rq.transaction;
          const ws = db.objectStoreNames.contains('workouts') ? tx.objectStore('workouts') : db.createObjectStore('workouts', { keyPath: 'key' });
          if (!ws.indexNames.contains('pid')) ws.createIndex('pid', 'pid');
          if (ev.oldVersion === 1 && db.objectStoreNames.contains('runs')) { // migrate v1 data into a profile
            const g = tx.objectStore('runs').getAll();
            g.onsuccess = () => {
              if (g.result.length) {
                g.result.forEach(r => ws.put(Object.assign(r, { pid: 'p-legacy', key: 'p-legacy|' + r.id })));
                const profs = lsGet('pp-profiles', []);
                if (!profs.some(p => p.id === 'p-legacy')) {
                  profs.push({ id: 'p-legacy', name: 'My profile', email: '', createdAt: Date.now(), settings: Object.assign({}, DEFAULT_SETTINGS, lsGet('pp-settings', {})) });
                  lsSet('pp-profiles', profs); lsSet('pp-session', 'p-legacy');
                }
              }
              db.deleteObjectStore('runs');
            };
          }
        };
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      });
    } catch (e) { this.db = null; }
  },
  accounts() { return lsGet('pp-profiles', []); },
  user() { const id = lsGet('pp-session', null); return this.accounts().find(p => p.id === id) || null; },
  async signIn({ id }) { if (!this.accounts().some(p => p.id === id)) throw new Error('Profile not found'); lsSet('pp-session', id); return this.user(); },
  async signUp({ name, email, settings }) {
    if (!name || !name.trim()) throw new Error('Enter a name for the profile.');
    const p = { id: uid(), name: name.trim(), email: (email || '').trim(), createdAt: Date.now(), settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}) };
    lsSet('pp-profiles', [...this.accounts(), p]); lsSet('pp-session', p.id); return p;
  },
  async signOut() { lsSet('pp-session', null); },
  async updateProfile(patch) {
    const u = this.user(); if (!u) return;
    const all = this.accounts().map(p => p.id === u.id ? Object.assign({}, p, patch, { settings: Object.assign({}, p.settings, patch.settings || {}) }) : p);
    lsSet('pp-profiles', all); return this.user();
  },
  async deleteAccount() { const u = this.user(); if (!u) return; await this.clearWorkouts(); lsSet('pp-profiles', this.accounts().filter(p => p.id !== u.id)); lsSet('pp-session', null); },
  _tx(mode, fn) {
    return new Promise((res, rej) => { const tx = this.db.transaction('workouts', mode); const out = fn(tx.objectStore('workouts')); tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out); tx.onerror = () => rej(tx.error); });
  },
  async listWorkouts() {
    const u = this.user(); if (!u) return [];
    if (!this.db) return [...this.mem.values()].filter(r => r.pid === u.id);
    return await this._tx('readonly', os => os.index('pid').getAll(u.id));
  },
  async putWorkouts(list) {
    const u = this.user(); if (!u) throw new Error('Sign in first');
    const rows = list.map(r => Object.assign({}, r, { pid: u.id, key: u.id + '|' + r.id }));
    if (!this.db) { rows.forEach(r => this.mem.set(r.key, r)); return; }
    await this._tx('readwrite', os => { rows.forEach(r => os.put(r)); });
  },
  async deleteWorkout(id) { const u = this.user(); if (!u) return; const k = u.id + '|' + id; if (!this.db) { this.mem.delete(k); return; } await this._tx('readwrite', os => { os.delete(k); }); },
  async clearWorkouts() { const list = await this.listWorkouts(); for (const r of list) await this.deleteWorkout(r.id); },
};

/* ---------- Firebase: Auth + Firestore (users/{uid}, users/{uid}/workouts/{id}) ---------- */
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
const TYPED = { Float32Array, Float64Array, Uint8Array };
const FirebaseBackend = {
  kind: 'firebase', label: 'Firebase cloud', secure: true,
  profile: null,
  async init(config) {
    if (this.auth) return;
    if (!window.firebase) for (const m of ['app', 'auth', 'firestore']) await loadScript(FIREBASE_SDK + 'firebase-' + m + '-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(config);
    this.auth = firebase.auth(); this.fs = firebase.firestore();
    await new Promise(res => { const un = this.auth.onAuthStateChanged(() => { un(); res(); }); });
    if (this.auth.currentUser) await this._loadProfile();
  },
  async _loadProfile() {
    const u = this.auth.currentUser, ref = this.fs.collection('users').doc(u.uid), snap = await ref.get();
    this.profile = snap.exists ? snap.data() : { name: u.displayName || (u.email || '').split('@')[0], email: u.email || '', createdAt: Date.now(), settings: Object.assign({}, DEFAULT_SETTINGS) };
    if (!snap.exists) await ref.set(this.profile);
  },
  accounts() { return []; },
  user() { const u = this.auth && this.auth.currentUser; return u && this.profile ? Object.assign({ id: u.uid }, this.profile, { email: u.email || this.profile.email }) : null; },
  async signIn({ email, password, google }) {
    if (google) await this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    else await this.auth.signInWithEmailAndPassword(email, password);
    await this._loadProfile(); return this.user();
  },
  async signUp({ name, email, password, settings }) {
    const cred = await this.auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    this.profile = { name, email, createdAt: Date.now(), settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}) };
    await this.fs.collection('users').doc(cred.user.uid).set(this.profile); return this.user();
  },
  async signOut() { await this.auth.signOut(); this.profile = null; },
  async updateProfile(patch) {
    this.profile = Object.assign({}, this.profile, patch, { settings: Object.assign({}, this.profile.settings, patch.settings || {}) });
    await this.fs.collection('users').doc(this.auth.currentUser.uid).set(this.profile, { merge: true }); return this.user();
  },
  async deleteAccount() {
    const me = this.auth.currentUser.uid;
    for (const c of ['feed', 'shares']) { const qs = await this.fs.collection(c).where('uid', '==', me).get(); for (const d of qs.docs) await d.ref.delete(); }
    await this.clearWorkouts(); await this.fs.collection('users').doc(this.auth.currentUser.uid).delete(); await this.auth.currentUser.delete(); this.profile = null; },
  _col() { return this.fs.collection('users').doc(this.auth.currentUser.uid).collection('workouts'); },
  _enc(r) { const o = {}; for (const [k, v] of Object.entries(r)) { if (v == null || k === 'pid' || k === 'key') continue; o[k] = ArrayBuffer.isView(v) ? { __t: v.constructor.name, b: firebase.firestore.Blob.fromUint8Array(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) } : v; } return o; },
  _dec(o) { const r = {}; for (const [k, v] of Object.entries(o)) { if (v && v.__t && TYPED[v.__t]) { const u8 = v.b.toUint8Array(); r[k] = new TYPED[v.__t](u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); } else r[k] = v; } return r; },
  async listWorkouts() { if (!this.auth.currentUser) return []; const qs = await this._col().get(); return qs.docs.map(d => this._dec(d.data())); },
  async putWorkouts(list) {
    for (let i = 0; i < list.length; i += 20) { // small batches keep each commit well under Firestore's 10 MB request cap
      const b = this.fs.batch(); list.slice(i, i + 20).forEach(r => b.set(this._col().doc(r.id), this._enc(r))); await b.commit();
    }
  },
  async deleteWorkout(id) { await this._col().doc(id).delete(); },
  async clearWorkouts() { const qs = await this._col().get(); for (let i = 0; i < qs.docs.length; i += 400) { const b = this.fs.batch(); qs.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); } },
  // ---- sharing: shares/{id} is readable by anyone holding the link (get only, never listed) ----
  _me() { const u = this.auth.currentUser; if (!u) throw new Error('Sign in to your online account first.'); return u.uid; },
  async createShare(data) { const ref = this.fs.collection('shares').doc(); await ref.set(Object.assign({}, data, { uid: this._me(), createdAt: Date.now() })); return ref.id; },
  async getShare(id) { const s = await this.fs.collection('shares').doc(id).get(); return s.exists ? s.data() : null; },
  async deleteShare(id) { await this.fs.collection('shares').doc(id).delete(); },
  // ---- feed: feed/{uid_workoutId}, readable by signed-in users only ----
  async publish(post) { const me = this._me(); await this.fs.collection('feed').doc(me + '_' + post.wid).set(Object.assign({}, post, { uid: me, author: this.profile.name || 'Runner', createdAt: Date.now() })); },
  async unpublish(wid) { await this.fs.collection('feed').doc(this._me() + '_' + wid).delete(); },
  async listFeed(mode) {
    const col = this.fs.collection('feed'), me = this._me(); let qs;
    if (mode === 'mine') qs = await col.where('uid', '==', me).get();
    else if (mode === 'following') { const f = (this.profile.following || []).slice(0, 30); if (!f.length) return []; qs = await col.where('uid', 'in', f).limit(200).get(); }
    else qs = await col.orderBy('start', 'desc').limit(60).get();
    return qs.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => b.start - a.start);
  },
  async follow(uid, on) { const f = new Set(this.profile.following || []); if (on) f.add(uid); else f.delete(uid); return this.updateProfile({ following: [...f] }); },
};

/* ---------- backend selection ---------- */
// On-device storage is always the default. 'pp-backend' = { kind: 'firebase' } once a user moves online.
function fbConfig() { const c = lsGet('pp-backend', null); return FIREBASE_CONFIG || lsGet('pp-fbconfig', null) || (c && c.config) || null; }
function storageChoice() { const c = lsGet('pp-backend', null); return c && c.kind === 'firebase' && fbConfig() ? { kind: 'firebase', config: fbConfig() } : { kind: 'local' }; }
async function openBackend() {
  const c = storageChoice(); LocalBackend.fallbackError = null;
  if (c.kind === 'firebase') {
    try { await FirebaseBackend.init(c.config); return FirebaseBackend; }
    catch (e) { console.warn(e); await LocalBackend.init(); LocalBackend.fallbackError = 'Could not reach the online account, so this session uses on-device storage. ' + (e.message || ''); return LocalBackend; }
  }
  await LocalBackend.init(); return LocalBackend;
}
// ===== END STORAGE =====
