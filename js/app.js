// Hostel Management – static app on GitHub Pages; data lives as JSON in a private GitHub repo.
//   hostels.json        -> { hostels: [{id, name}] }
//   hostels/<id>.json   -> { floors, rooms:[{id,floorId,name,beds:[{id,label,occupant}]}], expenses, history }
// Sign-in: users.json (in this public repo) holds each login's GitHub token, AES-GCM encrypted with its password.
const CURRENCY = 'PKR';
const DEFAULT_HOSTEL = 'HOSTEL DE KHAS';
const EXPENSE_CATEGORIES = ['Electricity', 'Internet', 'Water', 'Gas', 'Salaries', 'Maintenance', 'Food', 'Rent', 'Cleaning', 'Other'];
const ALL = '__all__';
const UNASSIGNED = '__unassigned__';
const AUTH_KEY = 'hms_auth';

const $app = document.getElementById('app');
const state = {
  auth: null, meta: null, metaSha: null, data: {}, shas: {},
  hostel: null, tab: 'dashboard', month: null, search: '', roomFilter: 'all', showPast: false,
};

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${CURRENCY} ${Math.round(n || 0).toLocaleString('en-PK')}`;
const compact = (n) => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)); };
const uid = () => Math.random().toString(36).slice(2, 9);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const thisMonth = () => today().slice(0, 7);
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const monthLabel = (m, long) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' }); };
const fmtDate = (s) => (s ? new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const initials = (s) => s.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
state.month = thisMonth();

function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), isErr ? 6000 : 2600);
}

const ICONS = {
  dashboard: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  rooms: '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M3 18v2M21 18v2M7 9V6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3"/>',
  residents: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.7.7 3 2.5 3.5 5.2"/>',
  expenses: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  data: '<path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/>',
  setup: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

// ---------- auth ----------
const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function unlock(rec, password, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64bytes(rec.salt), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64bytes(rec.iv) }, key, b64bytes(rec.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
function loadAuth() {
  for (const store of [sessionStorage, localStorage]) {
    try { const a = JSON.parse(store.getItem(AUTH_KEY)); if (a && a.token) return a; } catch { /* ignore */ }
  }
  return null;
}
function logout() {
  try { localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY); } catch { /* ignore */ }
  location.reload();
}

function renderLogin(error = '') {
  const dots = Array.from({ length: 32 }, (_, i) => `<i class="${[0, 1, 2, 4, 5, 8, 9, 10, 11, 13, 16, 17, 19, 20, 21, 24, 26, 27, 28, 30].includes(i) ? 'on' : ''}"></i>`).join('');
  $app.innerHTML = `
    <div class="login-wrap">
      <div class="login-art">
        <div class="logo"><div class="logo-mark" style="background:#fff;color:#111">HK</div><div class="logo-text" style="color:#fff">${DEFAULT_HOSTEL}<span style="color:#9a9a9a">Hostel management</span></div></div>
        <div><div class="grid-dots">${dots}</div><h1>Every bed, every rupee,<br>in one place.</h1>
        <p>Occupancy, residents, rent and expenses for your hostels — updated by your managers, visible to you from anywhere.</p></div>
        <p class="small" style="color:#6f6f6f">Private system · authorised users only</p>
      </div>
      <div class="login-form">
        <form id="loginForm" autocomplete="on">
          <h2>Sign in</h2>
          <p class="muted" style="margin:0 0 .6rem">Use the username and password you were given.</p>
          ${error ? `<div class="error">${esc(error)}</div>` : ''}
          <label>Username <input name="username" required autocomplete="username" autocapitalize="none"></label>
          <label>Password <input name="password" type="password" required autocomplete="current-password"></label>
          <label class="check" style="margin:.9rem 0"><input type="checkbox" name="remember" checked> Keep me signed in on this device</label>
          <button class="btn primary" style="width:100%;justify-content:center;padding:.65rem" id="loginBtn">Sign in</button>
        </form>
      </div>
    </div>`;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), btn = document.getElementById('loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await fetch('users.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Logins have not been set up yet. Run tools/create_logins.py first.');
      const db = await res.json();
      const username = f.get('username').trim().toLowerCase();
      const rec = db.users.find((u) => u.username.toLowerCase() === username);
      let payload;
      try { if (!rec) throw 0; payload = await unlock(rec, f.get('password'), db.iterations); }
      catch { throw new Error('Incorrect username or password.'); }
      const auth = { username: rec.username, role: rec.role, ...payload };
      GH.configure(auth);
      auth.canWrite = (await GH.check()).canWrite;
      try { (f.get('remember') ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(auth)); } catch { /* private mode */ }
      state.auth = auth;
      await boot();
    } catch (err) { renderLogin(/expired|Invalid token/i.test(err.message) ? 'This login\'s access has expired. Ask the owner to renew it.' : err.message); }
  };
}

// ---------- data ----------
function normalise(d) {
  d.floors = d.floors || []; d.rooms = d.rooms || []; d.expenses = d.expenses || []; d.history = d.history || [];
  const valid = (r) => r.floorId && d.floors.some((f) => f.id === r.floorId);
  if (d.rooms.some((r) => !valid(r))) {
    if (!d.floors.some((f) => f.id === UNASSIGNED)) d.floors.push({ id: UNASSIGNED, name: 'Unassigned' });
    d.rooms.forEach((r) => { if (!valid(r)) r.floorId = UNASSIGNED; });
  }
  return d;
}

async function boot() {
  $app.innerHTML = '<div class="center muted" style="padding-top:30vh">Loading your hostel data…</div>';
  try {
    GH.configure(state.auth);
    let m = await GH.read('hostels.json');
    if (!m) {
      const meta = { hostels: [{ id: 'hostel-de-khas', name: DEFAULT_HOSTEL }] };
      m = { data: meta, sha: await GH.write('hostels.json', meta, null, `[${state.auth.username}] Initialise hostels`) };
    }
    state.meta = m.data; state.metaSha = m.sha;
    await Promise.all(state.meta.hostels.map(loadHostel));
    const ids = state.meta.hostels.map((h) => h.id);
    if (!(state.hostel === ALL && ids.length > 1) && !ids.includes(state.hostel)) state.hostel = ids[0];
    render();
  } catch (err) {
    if (/401|Invalid token/i.test(err.message)) return renderLogin('This login\'s access has expired. Ask the owner to renew it.');
    $app.innerHTML = `<div class="center"><p class="error" style="display:inline-block">${esc(err.message)}</p><br><button class="btn" onclick="boot()">Try again</button> <button class="btn" onclick="logout()">Sign out</button></div>`;
  }
}

async function loadHostel(h) {
  const r = await GH.read(`hostels/${h.id}.json`);
  state.data[h.id] = normalise(r ? r.data : {});
  state.shas[h.id] = r ? r.sha : null;
}

async function saveHostel(id, message) {
  try {
    state.shas[id] = await GH.write(`hostels/${id}.json`, state.data[id], state.shas[id], `[${state.auth.username}] ${message}`);
    toast('Saved');
  } catch (err) {
    toast(err.message, true);
    await loadHostel({ id }); render();
    throw err;
  }
}

// ---------- calculations ----------
const hostelName = (id) => (state.meta.hostels.find((h) => h.id === id) || {}).name || id;
const selectedIds = () => (state.hostel === ALL ? state.meta.hostels.map((h) => h.id) : [state.hostel]);
const sortedRooms = (d, floorId) => d.rooms.filter((r) => r.floorId === floorId).sort((a, b) => natural(a.name, b.name));
const floorName = (d, id) => (d.floors.find((f) => f.id === id) || {}).name || '—';
function monthsBack(month, n) {
  const [y, m] = month.split('-').map(Number), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
  return out;
}
function incomeFor(id, month) {
  const d = state.data[id]; let t = 0;
  d.rooms.forEach((r) => r.beds.forEach((b) => { if (b.occupant && (b.occupant.since || '').slice(0, 7) <= month) t += Number(b.occupant.fee) || 0; }));
  d.history.forEach((h) => { if ((h.from || '').slice(0, 7) <= month && (h.to || '').slice(0, 7) >= month) t += Number(h.fee) || 0; });
  return t;
}
const occupiedIn = (id, month) => {
  const d = state.data[id]; let n = 0;
  d.rooms.forEach((r) => r.beds.forEach((b) => { if (b.occupant && (b.occupant.since || '').slice(0, 7) <= month) n++; }));
  d.history.forEach((h) => { if ((h.from || '').slice(0, 7) <= month && (h.to || '').slice(0, 7) >= month) n++; });
  return n;
};
const expensesFor = (id, month) => state.data[id].expenses.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + Number(e.amount), 0);

function stats(ids, month) {
  const t = { beds: 0, occupied: 0, rooms: 0, floors: 0, rent: 0, expenses: 0, byCat: {}, groups: [], fullRooms: 0, emptyRooms: 0 };
  ids.forEach((id) => {
    const d = state.data[id];
    t.rooms += d.rooms.length; t.floors += d.floors.filter((f) => d.rooms.some((r) => r.floorId === f.id)).length;
    const g = { name: hostelName(id), beds: 0, occupied: 0, rent: 0 };
    const fl = {};
    d.rooms.forEach((r) => {
      const o = r.beds.filter((b) => b.occupant).length;
      if (r.beds.length && o === r.beds.length) t.fullRooms++;
      if (o === 0) t.emptyRooms++;
      const f = (fl[r.floorId] = fl[r.floorId] || { name: floorName(d, r.floorId), beds: 0, occupied: 0, order: d.floors.findIndex((x) => x.id === r.floorId) });
      r.beds.forEach((b) => {
        t.beds++; g.beds++; f.beds++;
        if (b.occupant) { t.occupied++; g.occupied++; f.occupied++; const fee = Number(b.occupant.fee) || 0; t.rent += fee; g.rent += fee; }
      });
    });
    d.expenses.filter((e) => e.date.startsWith(month)).forEach((e) => { t.expenses += Number(e.amount); t.byCat[e.category] = (t.byCat[e.category] || 0) + Number(e.amount); });
    g.floors = Object.values(fl).sort((a, b) => a.order - b.order);
    t.groups.push(g);
  });
  t.available = t.beds - t.occupied;
  t.pct = t.beds ? Math.round((t.occupied / t.beds) * 100) : 0;
  t.avg = t.occupied ? t.rent / t.occupied : 0;
  t.lost = t.avg * t.available;
  t.net = t.rent - t.expenses;
  return t;
}

// ---------- charts ----------
let charts = [];
const killCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
function mkChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  Chart.defaults.color = css('--muted');
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.borderColor = css('--line');
  cfg.options = { responsive: true, maintainAspectRatio: false, ...cfg.options };
  cfg.options.plugins = { legend: { display: false }, ...cfg.options.plugins,
    tooltip: { backgroundColor: '#111', padding: 10, cornerRadius: 8, titleFont: { weight: '600' }, boxPadding: 4, ...(cfg.options.plugins || {}).tooltip } };
  charts.push(new Chart(el, cfg));
}
const tableOf = (heads, rows) => `<table><thead><tr>${heads.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const dataTable = (heads, rows) => `<details class="tbl"><summary>View as table</summary><div class="tablewrap">${tableOf(heads, rows)}</div></details>`;
const legend = (items) => `<div class="legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;

// ---------- shell ----------
const TABS = [['dashboard', 'Dashboard'], ['rooms', 'Rooms & Beds'], ['residents', 'Residents'], ['expenses', 'Expenses'], ['data', 'Import / Export'], ['setup', 'Setup']];
function render() {
  killCharts();
  const a = state.auth, multi = state.meta.hostels.length > 1;
  const title = TABS.find((t) => t[0] === state.tab)[1];
  $app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="logo"><div class="logo-mark">HK</div><div class="logo-text">${esc(state.hostel === ALL ? 'All hostels' : hostelName(state.hostel))}<span>Hostel management</span></div></div>
        <nav class="nav">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${icon(k)}${l}</button>`).join('')}</nav>
        <div class="side-foot">
          <div class="user"><div class="avatar">${esc(initials(a.username))}</div><div><b>${esc(a.username)}</b><div class="small muted">${cap(a.role)}${a.canWrite ? '' : ' · view only'}</div></div></div>
        </div>
      </aside>
      <div class="content">
        <div class="topbar">
          <div><h1>${title}</h1><div class="sub">${esc(state.hostel === ALL ? 'All hostels combined' : hostelName(state.hostel))}</div></div>
          <div class="top-actions">
            ${multi ? `<select id="hostelSel" style="width:auto"><option value="${ALL}">All hostels (combined)</option>${state.meta.hostels.map((h) => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('')}</select>` : ''}
            <button class="btn" id="refresh" title="Load the latest data">${icon('refresh')}Refresh</button>
            <button class="btn" id="logout" title="Sign out">${icon('logout')}<span>Sign out</span></button>
          </div>
        </div>
        <main id="main"></main>
      </div>
    </div>`;
  const sel = document.getElementById('hostelSel');
  if (sel) { sel.value = state.hostel; sel.onchange = (e) => { state.hostel = e.target.value; render(); }; }
  document.getElementById('refresh').onclick = async () => { await boot(); toast('Up to date'); };
  document.getElementById('logout').onclick = logout;
  document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
  const main = document.getElementById('main');
  ({ dashboard: renderDashboard, rooms: renderRooms, residents: renderResidents, expenses: renderExpenses, data: renderData, setup: renderSetup })[state.tab](main);
}
const W = () => state.auth.canWrite;
const needSingle = (main, what) => (main.innerHTML = `<div class="card empty"><b>Choose a hostel</b>Select a single hostel at the top to ${what}.</div>`);
const monthPicker = () => `<input type="month" id="monthSel" value="${state.month}" max="${thisMonth()}" style="width:auto">`;
function bindMonth() { const el = document.getElementById('monthSel'); if (el) el.onchange = (e) => { state.month = e.target.value || state.month; render(); }; }

// ---------- Dashboard ----------
function renderDashboard(main) {
  const ids = selectedIds(), t = stats(ids, state.month), multi = ids.length > 1;
  if (!t.beds) {
    main.innerHTML = `<div class="card empty"><b>No rooms set up yet</b>Add floors, rooms and beds in Setup (or bulk-import them from Excel), and the analytics will appear here.<br><br>
      <button class="btn primary" data-go="setup">Go to Setup</button> <button class="btn" data-go="data">Import from Excel</button></div>`;
    main.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.go; render(); }));
    return;
  }
  const months = monthsBack(state.month, 12);
  const inc = months.map((m) => ids.reduce((s, id) => s + incomeFor(id, m), 0));
  const exp = months.map((m) => ids.reduce((s, id) => s + expensesFor(id, m), 0));
  const net = inc.map((v, i) => v - exp[i]);
  const occ = months.map((m) => { const o = ids.reduce((s, id) => s + occupiedIn(id, m), 0); return t.beds ? Math.min(100, Math.round((o / t.beds) * 100)) : 0; });
  const prevExp = exp[exp.length - 2] || 0;
  const expDelta = prevExp ? Math.round(((t.expenses - prevExp) / prevExp) * 100) : null;
  const margin = t.rent ? Math.round((t.net / t.rent) * 100) : 0;
  const cats = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  const ink = css('--ink'), ink2 = css('--ink-2'), empty = css('--empty'), blue = css('--blue'), surface = css('--card');

  main.innerHTML = `
    <div class="section-h"><div><h2>Overview</h2><p>${monthLabel(state.month, true)}${state.month === thisMonth() ? ' · this month' : ''}</p></div>${monthPicker()}</div>
    <div class="stack">
      <div class="kpis">
        <div class="card kpi"><div class="k-label">Occupancy</div><div class="k-value">${t.pct}%</div><div class="k-foot">${t.occupied} of ${t.beds} beds booked</div><div class="meter"><i style="width:${t.pct}%"></i></div></div>
        <div class="card kpi"><div class="k-label">Available beds</div><div class="k-value">${t.available}</div><div class="k-foot">${t.emptyRooms} empty room${t.emptyRooms === 1 ? '' : 's'} · ${t.fullRooms} full</div></div>
        <div class="card kpi"><div class="k-label">Monthly rent roll</div><div class="k-value">${money(t.rent)}</div><div class="k-foot">Avg ${money(t.avg)} per resident</div></div>
        <div class="card kpi"><div class="k-label">Net this month <span class="badge ${t.net >= 0 ? 'good' : 'bad'}">${t.net >= 0 ? '▲' : '▼'} ${margin}% margin</span></div><div class="k-value">${money(t.net)}</div><div class="k-foot">Rent − ${money(t.expenses)} expenses</div></div>
      </div>
      <div class="minis">
        <div class="card mini"><div class="k-label">Residents</div><div class="k-value">${t.occupied}</div></div>
        <div class="card mini"><div class="k-label">Rooms</div><div class="k-value">${t.rooms}</div></div>
        <div class="card mini"><div class="k-label">Floors</div><div class="k-value">${t.floors}</div></div>
        <div class="card mini"><div class="k-label">Expenses</div><div class="k-value">${money(t.expenses)}</div></div>
        <div class="card mini"><div class="k-label">vs last month</div><div class="k-value">${expDelta === null ? '—' : (expDelta > 0 ? '+' : '') + expDelta + '%'}</div></div>
        <div class="card mini"><div class="k-label">Lost to empty beds</div><div class="k-value">${money(t.lost)}</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-h"><h3>Rent vs expenses <span class="sub">· last 12 months</span></h3>${legend([[ink, 'Rent'], [ink2, 'Expenses'], [blue, 'Net']])}</div>
          <div class="chartbox"><canvas id="cTrend"></canvas></div>
          ${dataTable(['Month', 'Rent', 'Expenses', 'Net'], months.map((m, i) => [monthLabel(m), money(inc[i]), money(exp[i]), money(net[i])]))}</div>
        <div class="card"><div class="card-h"><h3>Bed status</h3>${legend([[ink, 'Booked'], [empty, 'Available']])}</div>
          <div class="chartbox donut-wrap"><canvas id="cBeds"></canvas><div class="donut-center"><div><b>${t.pct}%</b><span>occupied</span></div></div></div>
          ${dataTable(['Status', 'Beds'], [['Booked', t.occupied], ['Available', t.available]])}</div>
      </div>
      <div class="grid-3">
        <div class="card"><div class="card-h"><h3>Occupancy trend</h3><span class="sub">% of beds booked</span></div><div class="chartbox sm"><canvas id="cOccTrend"></canvas></div>
          ${dataTable(['Month', 'Occupancy'], months.map((m, i) => [monthLabel(m), occ[i] + '%']))}</div>
        <div class="card"><div class="card-h"><h3>${multi ? 'Occupancy by hostel' : 'Occupancy by floor'}</h3>${legend([[ink, 'Booked'], [empty, 'Free']])}</div><div class="chartbox sm"><canvas id="cFloors"></canvas></div><div id="floorsTbl"></div></div>
        <div class="card"><div class="card-h"><h3>Expenses by category</h3><span class="sub">${monthLabel(state.month)}</span></div>
          <div class="chartbox sm">${cats.length ? '<canvas id="cCats"></canvas>' : '<div class="empty">No expenses recorded this month.</div>'}</div>
          ${dataTable(['Category', 'Amount'], cats.map((c) => [c[0], money(c[1])]))}</div>
      </div>
      ${multi ? hostelCompare(ids) : bedMapCard(ids[0])}
      <div class="grid-half">
        <div class="card"><div class="card-h"><h3>Recent activity</h3><span class="sub">move-ins & move-outs</span></div>${activityList(ids)}</div>
        <div class="card"><div class="card-h"><h3>Vacant beds</h3><span class="sub">${t.available} available</span></div>${vacantList(ids)}</div>
      </div>
      <p class="small faint">Rent figures are the monthly rent agreed with each resident; past months use move-in / move-out dates. They are not payments received.</p>
    </div>`;
  bindMonth();
  main.querySelectorAll('[data-bed]').forEach((b) => (b.onclick = () => bedDialog(b.dataset.h, b.dataset.room, b.dataset.bed)));

  const bar = { borderColor: surface, borderWidth: { top: 0, left: 0, right: 0, bottom: 0 }, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26 };
  const money_tip = { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y ?? c.parsed.x)}` } };
  const noGrid = { grid: { display: false }, border: { display: false } };
  const yAxis = { border: { display: false }, grid: { color: css('--line') }, ticks: { callback: compact, maxTicksLimit: 5 } };

  mkChart('cTrend', { type: 'bar', data: { labels: months.map((m) => monthLabel(m)), datasets: [
    { label: 'Rent', data: inc, backgroundColor: ink, ...bar, order: 2 },
    { label: 'Expenses', data: exp, backgroundColor: ink2, ...bar, order: 2 },
    { type: 'line', label: 'Net', data: net, borderColor: blue, backgroundColor: blue, borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 5, pointBorderColor: surface, pointBorderWidth: 2, tension: 0, order: 1 }] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: noGrid, y: yAxis }, plugins: { tooltip: money_tip } } });

  mkChart('cBeds', { type: 'doughnut', data: { labels: ['Booked', 'Available'], datasets: [{ data: [t.occupied, t.available], backgroundColor: [ink, empty], borderColor: surface, borderWidth: 3, hoverOffset: 4 }] },
    options: { cutout: '72%', plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} beds` } } } } });

  mkChart('cOccTrend', { type: 'line', data: { labels: months.map((m) => monthLabel(m)), datasets: [{ label: 'Occupancy', data: occ, borderColor: ink, backgroundColor: 'rgba(17,17,17,.06)', fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.3 }] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { ...noGrid, ticks: { maxTicksLimit: 6 } }, y: { ...yAxis, min: 0, max: 100, ticks: { callback: (v) => v + '%', maxTicksLimit: 5 } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.y}% booked` } } } } });

  const groups = multi ? t.groups : t.groups[0].floors;
  mkChart('cFloors', { type: 'bar', data: { labels: groups.map((g) => g.name), datasets: [
    { label: 'Booked', data: groups.map((g) => g.occupied), backgroundColor: ink, borderRadius: 4, borderSkipped: false, maxBarThickness: 22 },
    { label: 'Free', data: groups.map((g) => g.beds - g.occupied), backgroundColor: empty, borderRadius: 4, borderSkipped: false, maxBarThickness: 22 }] },
    options: { indexAxis: 'y', interaction: { mode: 'index', intersect: false }, scales: { x: { stacked: true, ...yAxis, ticks: { precision: 0, maxTicksLimit: 5 } }, y: { stacked: true, ...noGrid } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.x} beds` } } } } });
  document.getElementById('floorsTbl').innerHTML = dataTable([multi ? 'Hostel' : 'Floor', 'Beds', 'Booked', 'Free'], groups.map((g) => [g.name, g.beds, g.occupied, g.beds - g.occupied]));

  if (cats.length) mkChart('cCats', { type: 'bar', data: { labels: cats.map((c) => c[0]), datasets: [{ label: 'Spent', data: cats.map((c) => c[1]), backgroundColor: ink, ...bar, maxBarThickness: 18 }] },
    options: { indexAxis: 'y', scales: { x: { ...yAxis }, y: noGrid }, plugins: { tooltip: money_tip } } });
}

function bedMapCard(id) {
  const d = state.data[id];
  return `<div class="card"><div class="card-h"><h3>Bed map</h3>${legend([[css('--ink'), 'Booked'], ['#fff;border:1.5px solid #c9c9c5', 'Available']])}</div>
    ${d.floors.map((f) => { const rooms = sortedRooms(d, f.id); return rooms.length ? `
      <div class="floor-h"><h3 class="small muted" style="text-transform:uppercase;letter-spacing:.05em">${esc(f.name)}</h3></div>
      <div class="mapmini">${rooms.map((r) => `<div class="mm"><div class="mm-h"><span>${esc(r.name)}</span><span class="muted">${r.beds.filter((b) => b.occupant).length}/${r.beds.length}</span></div>
        <div class="dots">${r.beds.map((b) => `<button class="dot ${b.occupant ? 'on' : ''}" title="Bed ${esc(b.label)} – ${esc(b.occupant ? b.occupant.name : 'Available')}" data-h="${id}" data-room="${r.id}" data-bed="${b.id}"></button>`).join('')}</div></div>`).join('')}</div>` : ''; }).join('')}
  </div>`;
}
function hostelCompare(ids) {
  return `<div class="card"><div class="card-h"><h3>Hostels compared</h3><span class="sub">${monthLabel(state.month)}</span></div><div class="tablewrap"><table>
    <thead><tr><th>Hostel</th><th class="num">Beds</th><th class="num">Booked</th><th class="num">Occupancy</th><th class="num">Rent</th><th class="num">Expenses</th><th class="num">Net</th></tr></thead><tbody>
    ${ids.map((id) => { const s = stats([id], state.month); return `<tr><td><b>${esc(hostelName(id))}</b></td><td class="num">${s.beds}</td><td class="num">${s.occupied}</td><td class="num">${s.pct}%</td><td class="num">${money(s.rent)}</td><td class="num">${money(s.expenses)}</td><td class="num">${money(s.net)}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}
function activityList(ids) {
  const ev = [];
  ids.forEach((id) => {
    const d = state.data[id], multi = ids.length > 1, h = multi ? ` · ${hostelName(id)}` : '';
    d.rooms.forEach((r) => r.beds.forEach((b) => { if (b.occupant) ev.push({ date: b.occupant.since, in: true, name: b.occupant.name, where: `Room ${r.name}, bed ${b.label}${h}` }); }));
    d.history.forEach((x) => { ev.push({ date: x.to, in: false, name: x.name, where: `Room ${x.room}, bed ${x.bed}${h}` }); });
  });
  ev.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!ev.length) return '<div class="empty">No activity yet.</div>';
  return `<div class="list">${ev.slice(0, 7).map((e) => `<div class="li"><div class="li-main"><span class="ico ${e.in ? 'in' : 'out'}">${e.in ? '↓' : '↑'}</span><div><b>${esc(e.name)}</b> <span class="muted">${e.in ? 'moved in' : 'moved out'}</span><div class="small muted">${esc(e.where)}</div></div></div><span class="small muted">${fmtDate(e.date)}</span></div>`).join('')}</div>`;
}
function vacantList(ids) {
  const rows = [];
  ids.forEach((id) => { const d = state.data[id]; d.floors.forEach((f) => sortedRooms(d, f.id).forEach((r) => { const free = r.beds.filter((b) => !b.occupant); if (free.length) rows.push({ id, f, r, free }); })); });
  if (!rows.length) return '<div class="empty"><b>Fully booked</b>Every bed is taken.</div>';
  return `<div class="list">${rows.slice(0, 8).map((x) => `<div class="li"><div><b>Room ${esc(x.r.name)}</b> <span class="small muted">${esc(x.f.name)}${ids.length > 1 ? ' · ' + esc(hostelName(x.id)) : ''}</span><div class="small muted">Bed ${x.free.map((b) => esc(b.label)).join(', ')}</div></div><span class="badge">${x.free.length} free</span></div>`).join('')}</div>${rows.length > 8 ? `<p class="small muted">+ ${rows.length - 8} more rooms with free beds</p>` : ''}`;
}

// ---------- Modal ----------
function modal(html, onSubmit) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<form class="card" novalidate>${html}</form>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); close(); }));
  const form = el.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const sub = e.submitter;
    if (!(sub && sub.hasAttribute('formnovalidate')) && !form.reportValidity()) return;
    form.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try { await onSubmit(new FormData(form), close, sub); } catch { /* toast shown */ }
    form.querySelectorAll('button').forEach((b) => (b.disabled = false));
  };
  const first = form.querySelector('input:not([type=hidden]),select');
  if (first) first.focus();
}

function bedLabelsFromSpec(spec, used = new Set()) {
  spec = String(spec || '').trim();
  if (!spec) return [];
  if (/^\d+$/.test(spec)) {
    const n = Math.min(Number(spec), 60), out = []; let i = 1;
    while (out.length < n) { const l = String(i++); if (!used.has(l.toLowerCase())) out.push(l); }
    return out;
  }
  return spec.split(',').map((s) => s.trim()).filter(Boolean);
}
const dupe = (arr) => arr.find((x, i) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) !== i);
const floorOptions = (d, sel) => d.floors.map((f) => `<option value="${esc(f.id)}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');

// ---------- Rooms & Beds ----------
function renderRooms(main) {
  if (state.hostel === ALL) return needSingle(main, 'manage its rooms');
  const id = state.hostel, d = state.data[id], w = W();
  const f = state.roomFilter;
  const total = d.rooms.reduce((s, r) => s + r.beds.length, 0), booked = d.rooms.reduce((s, r) => s + r.beds.filter((b) => b.occupant).length, 0);
  main.innerHTML = `
    <div class="section-h"><div><h2>${d.rooms.length} rooms · ${total} beds</h2><p>${booked} booked, ${total - booked} available. Click a bed to add or edit its resident.</p></div>
      <div class="top-actions"><div class="seg">${[['all', 'All'], ['free', 'Has free beds'], ['full', 'Full']].map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${w ? `<button class="btn primary" id="addRoom">${icon('plus')}Add room</button>` : ''}</div></div>
    ${d.rooms.length ? '' : '<div class="card empty"><b>No rooms yet</b>Use Setup to add floors and generate rooms, or import them from Excel.</div>'}
    ${d.floors.map((fl) => {
      const rooms = sortedRooms(d, fl.id).filter((r) => { const o = r.beds.filter((b) => b.occupant).length; return f === 'all' || (f === 'free' ? o < r.beds.length : o === r.beds.length); });
      if (!rooms.length) return '';
      const beds = rooms.reduce((s, r) => s + r.beds.length, 0), occ = rooms.reduce((s, r) => s + r.beds.filter((b) => b.occupant).length, 0);
      return `<div class="floor-h"><h3>${esc(fl.name)}</h3><span class="small muted">${occ}/${beds} beds booked</span></div>
      <div class="rooms">${rooms.map((r) => `<div class="card room">
        <div class="room-h"><div><strong>Room ${esc(r.name)}</strong> <span class="small muted">· ${r.beds.filter((b) => b.occupant).length}/${r.beds.length}</span></div>
          ${w ? `<button class="btn sm" data-editroom="${r.id}">Edit</button>` : ''}</div>
        <div class="beds">${r.beds.map((b) => `
          <button class="bed ${b.occupant ? 'taken' : ''}" data-room="${r.id}" data-bed="${b.id}">
            <span class="bl">Bed ${esc(b.label)}</span>
            <span class="bn">${b.occupant ? esc(b.occupant.name) : 'Available'}</span>
            ${b.occupant ? `<span class="bf">${money(b.occupant.fee)}</span>` : ''}
          </button>`).join('')}</div>
      </div>`).join('')}</div>`;
    }).join('')}`;
  main.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.roomFilter = b.dataset.f; render(); }));
  if (w) {
    document.getElementById('addRoom').onclick = () => addRoomDialog();
    main.querySelectorAll('[data-editroom]').forEach((b) => (b.onclick = () => editRoomDialog(b.dataset.editroom)));
  }
  main.querySelectorAll('.bed').forEach((b) => (b.onclick = () => bedDialog(id, b.dataset.room, b.dataset.bed)));
}

function addRoomDialog() {
  const hid = state.hostel, d = state.data[hid];
  if (!d.floors.length) { toast('Add a floor first in Setup', true); return; }
  modal(`<h3>Add room</h3><p class="small muted">Beds can be a count (4) or your own IDs separated by commas (A, B, C, D).</p>
    <label>Floor <select name="floor">${floorOptions(d)}</select></label>
    <div class="field-row"><label>Room name / ID <input name="name" required placeholder="e.g. 101"></label>
    <label>Beds <input name="beds" required value="4"></label></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary">Add room</button></div>`,
  async (f, close) => {
    const name = f.get('name').trim();
    if (d.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) return toast('A room with that name already exists', true);
    const labels = bedLabelsFromSpec(f.get('beds'));
    if (!labels.length) return toast('Enter at least one bed', true);
    if (dupe(labels)) return toast(`Duplicate bed ID: ${dupe(labels)}`, true);
    d.rooms.push({ id: uid(), floorId: f.get('floor'), name, beds: labels.map((l) => ({ id: uid(), label: l, occupant: null })) });
    await saveHostel(hid, `Add room ${name}`); close(); render();
  });
}

function editRoomDialog(roomId) {
  const hid = state.hostel, d = state.data[hid], room = d.rooms.find((r) => r.id === roomId);
  modal(`<h3>Edit room ${esc(room.name)}</h3><p class="small muted">Rename the room or its beds, move it to another floor, add beds, or remove empty ones.</p>
    <div class="field-row"><label>Room name / ID <input name="name" required value="${esc(room.name)}"></label>
    <label>Floor <select name="floor">${floorOptions(d, room.floorId)}</select></label></div>
    ${room.beds.map((b) => `<div class="bedrow"><label>Bed ID <input name="bed_${b.id}" required value="${esc(b.label)}"></label>
      ${b.occupant ? `<span class="small muted" style="padding-bottom:.6rem">${esc(b.occupant.name)}</span>` : `<label class="check" style="padding-bottom:.5rem"><input type="checkbox" name="rm_${b.id}"> Remove</label>`}</div>`).join('')}
    <label>Add beds <input name="add" placeholder="a number, or IDs like E, F"></label>
    <div class="modal-actions"><button class="btn danger left" value="delete" formnovalidate>Delete room</button><button class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>`,
  async (f, close, sub) => {
    if (sub && sub.value === 'delete') {
      if (room.beds.some((b) => b.occupant)) return toast('Move out all residents before deleting this room', true);
      if (!confirm(`Delete room ${room.name}?`)) return;
      d.rooms = d.rooms.filter((r) => r.id !== roomId);
      await saveHostel(hid, `Delete room ${room.name}`); close(); render(); return;
    }
    const name = f.get('name').trim();
    if (d.rooms.some((r) => r.id !== roomId && r.name.toLowerCase() === name.toLowerCase())) return toast('A room with that name already exists', true);
    const kept = room.beds.filter((b) => !f.get('rm_' + b.id));
    const labels = kept.map((b) => f.get('bed_' + b.id).trim());
    const extra = bedLabelsFromSpec(f.get('add'), new Set(labels.map((l) => l.toLowerCase())));
    const all = [...labels, ...extra];
    if (!all.length) return toast('A room needs at least one bed (or delete the room)', true);
    if (all.some((l) => !l)) return toast('Bed IDs cannot be empty', true);
    if (dupe(all)) return toast(`Duplicate bed ID: ${dupe(all)}`, true);
    kept.forEach((b, i) => (b.label = labels[i]));
    room.beds = [...kept, ...extra.map((l) => ({ id: uid(), label: l, occupant: null }))];
    room.name = name; room.floorId = f.get('floor');
    await saveHostel(hid, `Edit room ${name}`); close(); render();
  });
}

function bedDialog(hid, roomId, bedId) {
  const d = state.data[hid], w = W();
  const room = d.rooms.find((r) => r.id === roomId), bed = room.beds.find((b) => b.id === bedId), o = bed.occupant;
  const title = `Room ${esc(room.name)} · Bed ${esc(bed.label)}`, sub = `${esc(floorName(d, room.floorId))}${state.meta.hostels.length > 1 ? ' · ' + esc(hostelName(hid)) : ''}`;
  if (!w) {
    return modal(`<h3>${title}</h3><p class="small muted">${sub}</p>${o ? `<table>
      <tr><td class="muted">Resident</td><td><b>${esc(o.name)}</b></td></tr><tr><td class="muted">Phone</td><td>${esc(o.phone)}</td></tr>
      <tr><td class="muted">CNIC</td><td>${esc(o.cnic)}</td></tr><tr><td class="muted">Monthly rent</td><td>${money(o.fee)}</td></tr>
      <tr><td class="muted">Moved in</td><td>${fmtDate(o.since)}</td></tr><tr><td class="muted">Notes</td><td>${esc(o.notes)}</td></tr></table>` : '<p>This bed is available.</p>'}
      <div class="modal-actions"><button class="btn" data-close>Close</button></div>`, async () => {});
  }
  modal(`<h3>${title}</h3><p class="small muted">${sub} · ${o ? 'Occupied' : 'Available'}</p>
    <label>Resident name <input name="name" required value="${esc(o?.name || '')}"></label>
    <div class="field-row"><label>Phone <input name="phone" type="tel" value="${esc(o?.phone || '')}"></label>
    <label>CNIC <input name="cnic" value="${esc(o?.cnic || '')}" placeholder="optional"></label></div>
    <div class="field-row"><label>Monthly rent (${CURRENCY}) <input name="fee" type="number" min="0" step="1" required value="${esc(o?.fee ?? '')}"></label>
    <label>Move-in date <input name="since" type="date" required value="${esc(o?.since || today())}"></label></div>
    <label>Notes <input name="notes" value="${esc(o?.notes || '')}" placeholder="optional"></label>
    ${o ? '<label>Move-out date (for moving out) <input name="out" type="date" value="' + today() + '"></label>' : ''}
    <div class="modal-actions">${o ? '<button class="btn danger left" value="vacate" formnovalidate>Move out</button>' : ''}
      <button class="btn" data-close>Cancel</button><button class="btn primary" value="save">${o ? 'Save changes' : 'Assign bed'}</button></div>`,
  async (f, close, sub) => {
    if (sub && sub.value === 'vacate') {
      if (!confirm(`Move out ${o.name}?`)) return;
      d.history.push({ name: o.name, phone: o.phone, cnic: o.cnic, room: room.name, bed: bed.label, fee: o.fee, from: o.since, to: f.get('out') || today() });
      bed.occupant = null;
      await saveHostel(hid, `Move out ${o.name} (room ${room.name}, bed ${bed.label})`);
    } else {
      bed.occupant = { name: f.get('name').trim(), phone: f.get('phone').trim(), cnic: f.get('cnic').trim(), fee: Number(f.get('fee')), since: f.get('since'), notes: f.get('notes').trim() };
      await saveHostel(hid, `${o ? 'Update' : 'Assign'} ${bed.occupant.name} (room ${room.name}, bed ${bed.label})`);
    }
    close(); render();
  });
}

// ---------- Residents ----------
function residentRows(ids) {
  const rows = [];
  ids.forEach((id) => { const d = state.data[id]; d.floors.forEach((f) => sortedRooms(d, f.id).forEach((r) => r.beds.forEach((b) => { if (b.occupant) rows.push({ h: id, hostel: hostelName(id), floor: f.name, room: r.name, roomId: r.id, bedId: b.id, bed: b.label, ...b.occupant }); }))); });
  return rows;
}
function renderResidents(main) {
  const ids = selectedIds(), multi = ids.length > 1, rows = residentRows(ids);
  const past = []; ids.forEach((id) => state.data[id].history.forEach((x) => past.push({ hostel: hostelName(id), ...x })));
  past.sort((a, b) => (b.to || '').localeCompare(a.to || ''));
  const totalRent = rows.reduce((s, r) => s + (Number(r.fee) || 0), 0);
  main.innerHTML = `
    <div class="section-h"><div><h2>${state.showPast ? past.length + ' past residents' : rows.length + ' current residents'}</h2><p>${state.showPast ? 'People who have moved out.' : 'Monthly rent roll ' + money(totalRent) + '.'}</p></div>
      <div class="top-actions"><div class="seg"><button data-p="0" class="${state.showPast ? '' : 'on'}">Current</button><button data-p="1" class="${state.showPast ? 'on' : ''}">Past</button></div>
      <input id="search" placeholder="Search name, phone, room…" value="${esc(state.search)}" style="width:220px">
      ${W() && !multi && !state.showPast ? `<button class="btn primary" id="addRes">${icon('plus')}Add resident</button>` : ''}</div></div>
    <div class="card" style="padding-top:.4rem;padding-bottom:.4rem"><div class="tablewrap"><table id="resTable"></table></div></div>`;
  const draw = () => {
    const q = state.search.toLowerCase();
    const match = (r) => !q || [r.name, r.phone, r.cnic, r.room, r.bed, r.floor, r.hostel].join(' ').toLowerCase().includes(q);
    const tb = document.getElementById('resTable');
    if (state.showPast) {
      const list = past.filter(match);
      tb.innerHTML = `<thead><tr>${multi ? '<th>Hostel</th>' : ''}<th>Name</th><th>Phone</th><th>Room</th><th>Bed</th><th class="num">Rent</th><th>Moved in</th><th>Moved out</th></tr></thead><tbody>` +
        (list.map((r) => `<tr>${multi ? `<td>${esc(r.hostel)}</td>` : ''}<td><b>${esc(r.name)}</b></td><td>${esc(r.phone)}</td><td>${esc(r.room)}</td><td>${esc(r.bed)}</td><td class="num">${money(r.fee)}</td><td>${fmtDate(r.from)}</td><td>${fmtDate(r.to)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No past residents.</td></tr>') + '</tbody>';
      return;
    }
    const list = rows.filter(match);
    tb.innerHTML = `<thead><tr>${multi ? '<th>Hostel</th>' : ''}<th>Name</th><th>Phone</th><th>CNIC</th><th>Floor</th><th>Room</th><th>Bed</th><th class="num">Monthly rent</th><th>Moved in</th></tr></thead><tbody>` +
      (list.map((r, i) => `<tr class="clickable" data-i="${rows.indexOf(r)}">${multi ? `<td>${esc(r.hostel)}</td>` : ''}<td><b>${esc(r.name)}</b></td><td>${esc(r.phone)}</td><td>${esc(r.cnic)}</td><td>${esc(r.floor)}</td><td>${esc(r.room)}</td><td>${esc(r.bed)}</td><td class="num">${money(r.fee)}</td><td>${fmtDate(r.since)}</td></tr>`).join('') ||
        `<tr><td colspan="9" class="empty">${rows.length ? 'No matches.' : 'No residents yet. Click a bed in Rooms & Beds, or import from Excel.'}</td></tr>`) + '</tbody>';
    tb.querySelectorAll('[data-i]').forEach((tr) => (tr.onclick = () => { const r = rows[tr.dataset.i]; bedDialog(r.h, r.roomId, r.bedId); }));
  };
  draw();
  document.getElementById('search').oninput = (e) => { state.search = e.target.value; draw(); };
  main.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { state.showPast = b.dataset.p === '1'; render(); }));
  const add = document.getElementById('addRes');
  if (add) add.onclick = () => {
    const d = state.data[state.hostel], free = [];
    d.floors.forEach((f) => sortedRooms(d, f.id).forEach((r) => r.beds.forEach((b) => { if (!b.occupant) free.push({ r, b, f }); })));
    if (!free.length) return toast('No available beds', true);
    modal(`<h3>Add resident</h3><p class="small muted">Choose an available bed first.</p>
      <label>Bed <select name="bed">${free.map((x, i) => `<option value="${i}">${esc(x.f.name)} · Room ${esc(x.r.name)} · Bed ${esc(x.b.label)}</option>`).join('')}</select></label>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary">Next</button></div>`,
    async (f, close) => { const x = free[Number(f.get('bed'))]; close(); bedDialog(state.hostel, x.r.id, x.b.id); });
  };
}

// ---------- Expenses ----------
function renderExpenses(main) {
  if (state.hostel === ALL) return needSingle(main, 'see and record its expenses');
  const id = state.hostel, d = state.data[id], w = W();
  const list = d.expenses.filter((e) => e.date.startsWith(state.month)).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = {}; list.forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount)));
  main.innerHTML = `
    <div class="section-h"><div><h2>${money(total)}</h2><p>Spent in ${monthLabel(state.month, true)} · ${list.length} entr${list.length === 1 ? 'y' : 'ies'}</p></div>${monthPicker()}</div>
    <div class="stack">
    ${w ? `<form id="expForm" class="card"><div class="card-h"><h3>Record an expense</h3></div><div class="field-row">
      <label>Date <input name="date" type="date" required value="${today()}"></label>
      <label>Category <select name="category">${EXPENSE_CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label>Amount (${CURRENCY}) <input name="amount" type="number" min="1" step="1" required></label>
      <label>Note <input name="note" placeholder="e.g. LESCO bill"></label>
      <button class="btn primary" style="justify-content:center">${icon('plus')}Add</button></div></form>` : ''}
    ${Object.keys(byCat).length ? `<div class="minis">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="card mini"><div class="k-label">${esc(c)}</div><div class="k-value">${money(v)}</div></div>`).join('')}</div>` : ''}
    <div class="card" style="padding-top:.4rem;padding-bottom:.4rem"><div class="tablewrap"><table>
      <thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th>${w ? '<th></th>' : ''}</tr></thead><tbody>
      ${list.map((e) => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.note)}</td><td class="num">${money(e.amount)}</td>${w ? `<td class="num"><button class="btn sm danger" data-del="${e.id}">Delete</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="5" class="empty">No expenses recorded for ${monthLabel(state.month, true)}.</td></tr>`}
      ${list.length ? `<tr class="total"><td colspan="3">Total</td><td class="num">${money(total)}</td>${w ? '<td></td>' : ''}</tr>` : ''}
    </tbody></table></div></div></div>`;
  bindMonth();
  if (!w) return;
  document.getElementById('expForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    d.expenses.push({ id: uid(), date: f.get('date'), category: f.get('category'), amount: Number(f.get('amount')), note: f.get('note').trim() });
    try { await saveHostel(id, `Expense: ${f.get('category')} ${f.get('amount')}`); } catch { return; }
    state.month = f.get('date').slice(0, 7); render();
  };
  main.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this expense?')) return;
    d.expenses = d.expenses.filter((x) => x.id !== b.dataset.del);
    await saveHostel(id, 'Delete expense').catch(() => {}); render();
  }));
}

// ---------- Import / Export ----------
function renderData(main) {
  const single = state.hostel !== ALL, w = W();
  main.innerHTML = `
    <div class="stack">
      <div class="card"><div class="card-h"><h3>Export to Excel</h3></div>
        <p class="muted" style="margin-top:0">Download everything — residents, every bed, expenses and past residents — as one Excel workbook. Good for backups and accountants.</p>
        <button class="btn primary" id="exportBtn">${icon('data')}Download Excel backup</button></div>
      ${w ? (single ? `
      <div class="grid-half">
        <div class="card"><div class="card-h"><h3>Bulk import rooms & residents</h3></div>
          <p class="small muted" style="margin-top:0">One row per bed: <b>Floor, Room, Bed</b>, and optionally the resident's name, phone, CNIC, monthly rent and move-in date. Missing floors, rooms and beds are created; leave the name blank for an empty bed.</p>
          <div class="row" style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn" data-tpl="residents">Download template</button><label class="btn" style="margin:0;color:var(--text)">Choose file…<input type="file" accept=".xlsx,.xls,.csv" data-imp="residents" hidden></label></div>
          <div id="prev-residents"></div></div>
        <div class="card"><div class="card-h"><h3>Bulk import expenses</h3></div>
          <p class="small muted" style="margin-top:0">One row per expense: <b>Date, Category, Amount</b>, and an optional note.</p>
          <div class="row" style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn" data-tpl="expenses">Download template</button><label class="btn" style="margin:0;color:var(--text)">Choose file…<input type="file" accept=".xlsx,.xls,.csv" data-imp="expenses" hidden></label></div>
          <div id="prev-expenses"></div></div>
      </div>` : '<div class="card empty"><b>Choose a hostel</b>Select a single hostel at the top to import data into it.</div>') : ''}
    </div>`;
  document.getElementById('exportBtn').onclick = () => exportExcel().catch((e) => toast(e.message, true));
  main.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => Excel.template(b.dataset.tpl).catch((e) => toast(e.message, true))));
  main.querySelectorAll('[data-imp]').forEach((inp) => (inp.onchange = async () => {
    const file = inp.files[0]; inp.value = '';
    if (!file) return;
    try { const rows = await Excel.readRows(file); (inp.dataset.imp === 'residents' ? previewResidents : previewExpenses)(rows, file.name); }
    catch (e) { toast(e.message || 'Could not read that file', true); }
  }));
}

async function exportExcel() {
  await Excel.load();
  const ids = state.meta.hostels.map((h) => h.id), beds = [['Hostel', 'Floor', 'Room', 'Bed', 'Status', 'Resident Name', 'Phone', 'CNIC', 'Monthly Rent (PKR)', 'Move-in Date', 'Notes']], exps = [['Hostel', 'Date', 'Category', 'Amount (PKR)', 'Note']], past = [['Hostel', 'Name', 'Phone', 'Room', 'Bed', 'Monthly Rent (PKR)', 'Moved in', 'Moved out']];
  const summary = [['Hostel', 'Floors', 'Rooms', 'Beds', 'Booked', 'Available', 'Occupancy %', 'Monthly rent roll (PKR)', `Expenses ${state.month} (PKR)`]];
  ids.forEach((id) => {
    const d = state.data[id], h = hostelName(id), s = stats([id], state.month);
    summary.push([h, s.floors, s.rooms, s.beds, s.occupied, s.available, s.pct, s.rent, s.expenses]);
    d.floors.forEach((f) => sortedRooms(d, f.id).forEach((r) => r.beds.forEach((b) => { const o = b.occupant || {}; beds.push([h, f.name, r.name, b.label, b.occupant ? 'Booked' : 'Available', o.name || '', o.phone || '', o.cnic || '', b.occupant ? Number(o.fee) || 0 : '', o.since || '', o.notes || '']); })));
    [...d.expenses].sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => exps.push([h, e.date, e.category, Number(e.amount), e.note || '']));
    d.history.forEach((x) => past.push([h, x.name, x.phone || '', x.room, x.bed, Number(x.fee) || 0, x.from, x.to]));
  });
  Excel.download([
    { name: 'Summary', rows: summary, widths: [22, 8, 8, 8, 8, 10, 12, 22, 22] },
    { name: 'Beds & Residents', rows: beds, widths: [20, 14, 8, 6, 10, 22, 14, 16, 18, 14, 24] },
    { name: 'Expenses', rows: exps, widths: [20, 12, 14, 14, 30] },
    { name: 'Past Residents', rows: past, widths: [20, 22, 14, 8, 6, 18, 12, 12] }], `hostel-data-${today()}.xlsx`);
}

function showPreview(kind, html, onImport) {
  const box = document.getElementById('prev-' + kind);
  box.innerHTML = html;
  const btn = box.querySelector('[data-go]'); if (btn) btn.onclick = async () => { btn.disabled = true; try { await onImport(); } catch { btn.disabled = false; } };
  const cancel = box.querySelector('[data-cancel]'); if (cancel) cancel.onclick = () => (box.innerHTML = '');
}
const errList = (errors) => (errors.length ? `<ul class="err-list">${errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}${errors.length > 8 ? `<li>…and ${errors.length - 8} more</li>` : ''}</ul>` : '');

function previewResidents(rows, fname) {
  const id = state.hostel, d = JSON.parse(JSON.stringify(state.data[id])), errors = [];
  const c = { floors: 0, rooms: 0, beds: 0, residents: 0, updated: 0 };
  rows.forEach((row, i) => {
    const n = i + 2, P = (...p) => Excel.pick(row, ...p);
    const floor = String(P('floor')).trim(), roomName = String(P('room')).trim(), bedLabel = String(P('bed')).trim();
    if (!floor || !roomName || !bedLabel) return errors.push(`Row ${n}: Floor, Room and Bed are required`);
    const name = String(P('residentname', 'resident', 'name', 'occupant')).trim();
    let fee = null, since = null;
    if (name) {
      fee = Excel.toNum(P('monthlyrent', 'rent', 'fee'));
      if (fee === null) return errors.push(`Row ${n}: monthly rent missing for ${name}`);
      const raw = P('movein', 'since', 'date');
      since = raw === '' ? today() : Excel.toDate(raw);
      if (!since) return errors.push(`Row ${n}: move-in date "${raw}" not understood (use YYYY-MM-DD)`);
    }
    let f = d.floors.find((x) => x.name.toLowerCase() === floor.toLowerCase());
    if (!f) { f = { id: uid(), name: floor }; d.floors.push(f); c.floors++; }
    let r = d.rooms.find((x) => x.name.toLowerCase() === roomName.toLowerCase());
    if (!r) { r = { id: uid(), floorId: f.id, name: roomName, beds: [] }; d.rooms.push(r); c.rooms++; }
    let b = r.beds.find((x) => x.label.toLowerCase() === bedLabel.toLowerCase());
    if (!b) { b = { id: uid(), label: bedLabel, occupant: null }; r.beds.push(b); c.beds++; }
    if (!name) return;
    if (b.occupant && b.occupant.name.toLowerCase() !== name.toLowerCase()) return errors.push(`Row ${n}: room ${roomName} bed ${bedLabel} is already taken by ${b.occupant.name}`);
    if (b.occupant) c.updated++; else c.residents++;
    b.occupant = { name, phone: String(P('phone', 'mobile')).trim(), cnic: String(P('cnic')).trim(), fee, since, notes: String(P('note')).trim() };
  });
  const any = c.floors + c.rooms + c.beds + c.residents + c.updated;
  showPreview('residents', `<div class="note" style="margin-top:1rem"><b>${esc(fname)}</b> · ${rows.length} rows<br>
    Will add <b>${c.floors}</b> floors, <b>${c.rooms}</b> rooms, <b>${c.beds}</b> beds and <b>${c.residents}</b> residents${c.updated ? `, and update <b>${c.updated}</b> existing residents` : ''}.
    ${errors.length ? `<br><b>${errors.length} row${errors.length === 1 ? '' : 's'} will be skipped:</b>` : ''}${errList(errors)}</div>
    <div class="row" style="display:flex;gap:.5rem;margin-top:.6rem"><button class="btn primary" data-go ${any ? '' : 'disabled'}>Import into ${esc(hostelName(id))}</button><button class="btn" data-cancel>Cancel</button></div>`,
  async () => {
    const backup = state.data[id];
    state.data[id] = normalise(d);
    try { await saveHostel(id, `Bulk import from ${fname}`); } catch (e) { state.data[id] = backup; throw e; }
    state.tab = 'rooms'; render();
  });
}

function previewExpenses(rows, fname) {
  const id = state.hostel, add = [], errors = [];
  rows.forEach((row, i) => {
    const n = i + 2, P = (...p) => Excel.pick(row, ...p);
    const date = Excel.toDate(P('date')), amount = Excel.toNum(P('amount')), cat = String(P('category', 'type')).trim() || 'Other';
    if (!date) return errors.push(`Row ${n}: date missing or not understood`);
    if (!amount || amount <= 0) return errors.push(`Row ${n}: amount missing`);
    const category = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === cat.toLowerCase()) || cat;
    add.push({ id: uid(), date, category, amount, note: String(P('note', 'description')).trim() });
  });
  const total = add.reduce((s, e) => s + e.amount, 0);
  showPreview('expenses', `<div class="note" style="margin-top:1rem"><b>${esc(fname)}</b> · ${rows.length} rows<br>
    Will add <b>${add.length}</b> expenses totalling <b>${money(total)}</b>.${errors.length ? `<br><b>${errors.length} row${errors.length === 1 ? '' : 's'} will be skipped:</b>` : ''}${errList(errors)}</div>
    <div class="row" style="display:flex;gap:.5rem;margin-top:.6rem"><button class="btn primary" data-go ${add.length ? '' : 'disabled'}>Import ${add.length} expenses</button><button class="btn" data-cancel>Cancel</button></div>`,
  async () => {
    const d = state.data[id];
    d.expenses.push(...add);
    try { await saveHostel(id, `Bulk import ${add.length} expenses from ${fname}`); } catch (e) { d.expenses = d.expenses.filter((x) => !add.includes(x)); throw e; }
    state.tab = 'expenses'; render();
  });
}

// ---------- Setup ----------
function renderSetup(main) {
  const single = state.hostel !== ALL, id = state.hostel, d = single ? state.data[id] : null, w = W();
  if (!w) { main.innerHTML = '<div class="card empty"><b>View only</b>Your login can view data but not change the setup.</div>'; return; }
  main.innerHTML = `<div class="stack">
    ${single ? `
    <div class="grid-half">
      <div class="card"><div class="card-h"><h3>Floors</h3><span class="sub">${d.floors.length} floor${d.floors.length === 1 ? '' : 's'}</span></div>
        <div class="tablewrap"><table><tbody>${d.floors.map((f, i) => {
          const n = d.rooms.filter((r) => r.floorId === f.id).length, nb = d.rooms.filter((r) => r.floorId === f.id).reduce((s, r) => s + r.beds.length, 0);
          return `<tr><td><b>${esc(f.name)}</b><div class="small muted">${n} room${n === 1 ? '' : 's'} · ${nb} beds</div></td>
            <td class="num"><button class="btn sm" data-up="${f.id}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
            <button class="btn sm" data-down="${f.id}" ${i === d.floors.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
            <button class="btn sm" data-renamefloor="${f.id}">Rename</button>
            <button class="btn sm danger" data-delfloor="${f.id}">Delete</button></td></tr>`;
        }).join('') || '<tr><td class="muted">No floors yet. Add your first one below.</td></tr>'}</tbody></table></div>
        <form id="floorForm" style="display:flex;gap:.5rem;margin-top:.9rem"><input name="name" required placeholder="e.g. Ground Floor, Floor 1"><button class="btn primary">${icon('plus')}Add</button></form>
        <p class="small muted">Tip: add several at once separated by commas — "Ground Floor, Floor 1, Floor 2".</p>
      </div>
      <div class="card"><div class="card-h"><h3>Generate rooms</h3></div>
        <p class="small muted" style="margin-top:0">Create many rooms with beds in one go. Rename anything later from Rooms & Beds.</p>
        <form id="quickForm">
          <label>Floor <select name="floor" required>${floorOptions(d)}</select></label>
          <div class="field-row">
            <label>How many rooms <input name="count" type="number" min="1" max="60" value="5" required></label>
            <label>First room ID <input name="first" required value="101"></label></div>
          <div class="field-row">
            <label>Beds per room <input name="per" type="number" min="1" max="26" value="4" required></label>
            <label>Bed IDs <select name="style"><option value="num">1, 2, 3…</option><option value="let">A, B, C…</option><option value="pre">101-1, 101-2…</option></select></label></div>
          <p class="small muted" id="quickPrev"></p>
          <button class="btn primary" ${d.floors.length ? '' : 'disabled'}>Generate rooms</button>
        </form>
      </div>
    </div>` : '<div class="card empty"><b>Choose a hostel</b>Select a single hostel at the top to configure its floors and rooms.</div>'}
    <div class="card"><div class="card-h"><h3>Hostels</h3><span class="sub">${state.meta.hostels.length} total</span></div>
      <div class="tablewrap"><table><tbody>${state.meta.hostels.map((h) => { const s = stats([h.id], state.month); return `<tr><td><b>${esc(h.name)}</b><div class="small muted">${s.rooms} rooms · ${s.beds} beds</div></td><td class="num"><button class="btn sm" data-rename="${esc(h.id)}">Rename</button></td></tr>`; }).join('')}</tbody></table></div>
      <form id="hostelForm" style="display:flex;gap:.5rem;margin-top:.9rem"><input name="name" required placeholder="Add another hostel (set it up later)"><button class="btn">${icon('plus')}Add hostel</button></form>
    </div></div>`;

  if (single) {
    const saveD = async (msg) => { try { await saveHostel(id, msg); render(); } catch { /* shown */ } };
    document.getElementById('floorForm').onsubmit = (e) => {
      e.preventDefault();
      const names = new FormData(e.target).get('name').split(',').map((s) => s.trim()).filter(Boolean);
      const added = names.filter((n) => !d.floors.some((f) => f.name.toLowerCase() === n.toLowerCase()));
      if (!added.length) return toast('Those floors already exist', true);
      added.forEach((name) => d.floors.push({ id: uid(), name }));
      saveD(`Add floor${added.length > 1 ? 's' : ''} ${added.join(', ')}`);
    };
    main.querySelectorAll('[data-up],[data-down]').forEach((b) => (b.onclick = () => {
      const fid = b.dataset.up || b.dataset.down, i = d.floors.findIndex((f) => f.id === fid), j = b.dataset.up ? i - 1 : i + 1;
      [d.floors[i], d.floors[j]] = [d.floors[j], d.floors[i]]; saveD('Reorder floors');
    }));
    main.querySelectorAll('[data-renamefloor]').forEach((b) => (b.onclick = () => {
      const f = d.floors.find((x) => x.id === b.dataset.renamefloor), name = (prompt('Floor name', f.name) || '').trim();
      if (name && name !== f.name) { f.name = name; saveD(`Rename floor to ${name}`); }
    }));
    main.querySelectorAll('[data-delfloor]').forEach((b) => (b.onclick = () => {
      const f = d.floors.find((x) => x.id === b.dataset.delfloor);
      if (d.rooms.some((r) => r.floorId === f.id)) return toast('Move or delete the rooms on this floor first', true);
      if (confirm(`Delete floor "${f.name}"?`)) { d.floors = d.floors.filter((x) => x.id !== f.id); saveD(`Delete floor ${f.name}`); }
    }));
    const qf = document.getElementById('quickForm');
    const plan = () => {
      const f = new FormData(qf), count = Math.max(0, Number(f.get('count'))), per = Math.max(0, Number(f.get('per'))), first = f.get('first').trim(), style = f.get('style');
      const m = first.match(/^(.*?)(\d+)$/);
      const names = Array.from({ length: count }, (_, i) => (m ? m[1] + String(Number(m[2]) + i).padStart(m[2].length, '0') : `${first}${i + 1}`));
      const label = (name, j) => (style === 'let' ? String.fromCharCode(65 + j) : style === 'pre' ? `${name}-${j + 1}` : String(j + 1));
      return { names, per, label, floor: f.get('floor') };
    };
    const showPlan = () => { const p = plan(); document.getElementById('quickPrev').textContent = p.names.length ? `Creates rooms ${p.names[0]}${p.names.length > 1 ? ' – ' + p.names[p.names.length - 1] : ''} with ${p.per} beds each (${p.names.length * p.per} beds).` : ''; };
    qf.oninput = showPlan; showPlan();
    qf.onsubmit = (e) => {
      e.preventDefault();
      const p = plan(); let added = 0, skipped = 0;
      p.names.forEach((name) => {
        if (d.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) { skipped++; return; }
        d.rooms.push({ id: uid(), floorId: p.floor, name, beds: Array.from({ length: p.per }, (_, j) => ({ id: uid(), label: p.label(name, j), occupant: null })) });
        added++;
      });
      if (!added) return toast(`No rooms added – all ${skipped} already exist`, true);
      saveHostel(id, `Generate ${added} rooms on ${floorName(d, p.floor)}`).then(() => { toast(`Added ${added} rooms${skipped ? `, skipped ${skipped} existing` : ''}`); render(); }).catch(() => {});
    };
  }
  document.getElementById('hostelForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    if (!confirm(`Add a new hostel "${name}"?`)) return;
    let hid = slug(name);
    while (state.meta.hostels.some((h) => h.id === hid)) hid += '-' + uid().slice(0, 2);
    try {
      const data = normalise({});
      const sha = await GH.write(`hostels/${hid}.json`, data, null, `[${state.auth.username}] Create hostel ${name}`);
      state.meta.hostels.push({ id: hid, name });
      state.metaSha = await GH.write('hostels.json', state.meta, state.metaSha, `[${state.auth.username}] Add hostel ${name}`);
      state.data[hid] = data; state.shas[hid] = sha; state.hostel = hid;
      toast('Hostel added – set up its floors and rooms'); render();
    } catch (err) { toast(err.message, true); boot(); }
  };
  main.querySelectorAll('[data-rename]').forEach((b) => (b.onclick = async () => {
    const h = state.meta.hostels.find((x) => x.id === b.dataset.rename), name = (prompt('Hostel name', h.name) || '').trim();
    if (!name || name === h.name) return;
    const old = h.name; h.name = name;
    try { state.metaSha = await GH.write('hostels.json', state.meta, state.metaSha, `[${state.auth.username}] Rename hostel to ${name}`); render(); }
    catch (err) { h.name = old; toast(err.message, true); boot(); }
  }));
}

// ---------- start ----------
try { localStorage.removeItem('hms_session'); } catch { /* old token-based login */ }
state.auth = loadAuth();
if (state.auth) boot(); else renderLogin();
