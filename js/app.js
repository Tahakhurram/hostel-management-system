// Hostel Management – static app. Data is stored as JSON in a private GitHub repo.
//   hostels.json            -> { hostels: [{id, name}] }
//   hostels/<id>.json       -> { rooms: [...], expenses: [...], history: [...] }
const CURRENCY = 'PKR';
const DEFAULT_HOSTEL = 'HOSTEL DE KHAS';
const EXPENSE_CATEGORIES = ['Electricity', 'Internet', 'Water', 'Gas', 'Salaries', 'Maintenance', 'Food', 'Rent', 'Other'];
const ALL = '__all__';

const $app = document.getElementById('app');
const state = {
  session: null,      // {owner, repo, token, canWrite}
  meta: null,         // {hostels:[]}
  metaSha: null,
  data: {},           // hostelId -> {rooms, expenses, history}
  shas: {},           // hostelId -> sha
  hostel: ALL,
  tab: 'dashboard',
  month: new Date().toISOString().slice(0, 7),
};

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${CURRENCY} ${Math.round(n || 0).toLocaleString('en-PK')}`;
const uid = () => Math.random().toString(36).slice(2, 9);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
const today = () => new Date().toISOString().slice(0, 10);

function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), isErr ? 6000 : 2500);
}

// ---------- session ----------
function loadSession() {
  try { return JSON.parse(localStorage.getItem('hms_session')); } catch { return null; }
}
function saveSession(s) { localStorage.setItem('hms_session', JSON.stringify(s)); }
function logout() { localStorage.removeItem('hms_session'); location.reload(); }

function renderLogin(error = '') {
  const prev = loadSession() || {};
  $app.innerHTML = `
    <div class="login card">
      <h1>Hostel Management</h1>
      <p class="muted">Sign in with your GitHub details. Your token is kept only in this browser.</p>
      ${error ? `<div class="error">${esc(error)}</div>` : ''}
      <form id="loginForm">
        <label>GitHub username (owner of the data repo)
          <input name="owner" required value="${esc(prev.owner || '')}" autocomplete="off"></label>
        <label>Data repo name
          <input name="repo" required value="${esc(prev.repo || 'hostel-data')}" autocomplete="off"></label>
        <label>Access token
          <input name="token" type="password" required autocomplete="off" placeholder="github_pat_..."></label>
        <button class="primary" type="submit">Sign in</button>
      </form>
    </div>`;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const s = { owner: f.get('owner').trim(), repo: f.get('repo').trim(), token: f.get('token').trim() };
    GH.configure(s);
    try {
      const { canWrite } = await GH.check();
      s.canWrite = canWrite;
      saveSession(s);
      state.session = s;
      await boot();
    } catch (err) { renderLogin(err.message); }
  };
}

// ---------- data ----------
async function boot() {
  $app.innerHTML = '<div class="center muted">Loading…</div>';
  try {
    GH.configure(state.session);
    let m = await GH.read('hostels.json');
    if (!m) {
      if (!state.session.canWrite) throw new Error('No data yet. Ask the manager to sign in first to set things up.');
      const meta = { hostels: [{ id: 'hostel-de-khas', name: DEFAULT_HOSTEL }] };
      const sha = await GH.write('hostels.json', meta, null, 'Initialise hostels');
      m = { data: meta, sha };
    }
    state.meta = m.data; state.metaSha = m.sha;
    await Promise.all(state.meta.hostels.map(loadHostel));
    if (state.hostel !== ALL && !state.meta.hostels.find((h) => h.id === state.hostel)) state.hostel = ALL;
    render();
  } catch (err) {
    renderLogin(err.message);
  }
}

async function loadHostel(h) {
  const r = await GH.read(`hostels/${h.id}.json`);
  if (r) { state.data[h.id] = r.data; state.shas[h.id] = r.sha; }
  else { state.data[h.id] = { rooms: [], expenses: [], history: [] }; state.shas[h.id] = null; }
}

async function saveHostel(id, message) {
  try {
    state.shas[id] = await GH.write(`hostels/${id}.json`, state.data[id], state.shas[id], message);
    toast('Saved');
  } catch (err) {
    toast(err.message, true);
    if (err.conflict) { await loadHostel({ id }); render(); }
    throw err;
  }
}

// ---------- calculations ----------
function hostelStats(id, month) {
  const d = state.data[id];
  let beds = 0, occupied = 0, income = 0, people = 0;
  d.rooms.forEach((r) => r.beds.forEach((b) => {
    beds++;
    if (b.occupant) { occupied++; income += Number(b.occupant.fee) || 0; }
  }));
  const exp = d.expenses.filter((e) => e.date.startsWith(month));
  const expenses = exp.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = {};
  exp.forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount)));
  people = occupied;
  return { beds, occupied, available: beds - occupied, rooms: d.rooms.length, people, income, expenses, net: income - expenses, byCat };
}
function sumStats(list) {
  const t = { beds: 0, occupied: 0, available: 0, rooms: 0, people: 0, income: 0, expenses: 0, net: 0, byCat: {} };
  list.forEach((s) => {
    ['beds', 'occupied', 'available', 'rooms', 'people', 'income', 'expenses', 'net'].forEach((k) => (t[k] += s[k]));
    Object.entries(s.byCat).forEach(([c, v]) => (t.byCat[c] = (t.byCat[c] || 0) + v));
  });
  return t;
}

// ---------- rendering ----------
function render() {
  const canWrite = state.session.canWrite;
  const tabs = [['dashboard', 'Dashboard'], ['rooms', 'Rooms & Beds'], ['expenses', 'Expenses']];
  if (canWrite) tabs.push(['settings', 'Hostels']);
  if (!canWrite && state.tab === 'settings') state.tab = 'dashboard';
  $app.innerHTML = `
    <header>
      <div class="brand">Hostel Management <span class="pill">${canWrite ? 'Manager' : 'Owner (view only)'}</span></div>
      <div class="hdr-right">
        <select id="hostelSel" aria-label="Hostel">
          <option value="${ALL}">All hostels (combined)</option>
          ${state.meta.hostels.map((h) => `<option value="${esc(h.id)}" ${h.id === state.hostel ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
        </select>
        <button id="refresh" title="Reload from GitHub">↻</button>
        <button id="logout">Sign out</button>
      </div>
    </header>
    <nav>${tabs.map(([k, l]) => `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav>
    <main id="main"></main>`;
  document.getElementById('hostelSel').value = state.hostel;
  document.getElementById('hostelSel').onchange = (e) => { state.hostel = e.target.value; render(); };
  document.getElementById('refresh').onclick = boot;
  document.getElementById('logout').onclick = logout;
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); }));
  const main = document.getElementById('main');
  ({ dashboard: renderDashboard, rooms: renderRooms, expenses: renderExpenses, settings: renderSettings })[state.tab](main);
}

function hostelName(id) { return (state.meta.hostels.find((h) => h.id === id) || {}).name || id; }
function needSingleHostel(main) {
  main.innerHTML = '<div class="card center muted">Select a specific hostel from the dropdown above to view this page.</div>';
}
function monthPicker() {
  return `<label class="inline">Month <input type="month" id="monthSel" value="${state.month}"></label>`;
}
function bindMonth() {
  const el = document.getElementById('monthSel');
  if (el) el.onchange = (e) => { state.month = e.target.value || state.month; render(); };
}

function tile(label, value, cls = '') {
  return `<div class="tile ${cls}"><div class="tl">${label}</div><div class="tv">${value}</div></div>`;
}

function renderDashboard(main) {
  const ids = state.hostel === ALL ? state.meta.hostels.map((h) => h.id) : [state.hostel];
  const per = ids.map((id) => ({ id, s: hostelStats(id, state.month) }));
  const t = sumStats(per.map((p) => p.s));
  const pct = t.beds ? Math.round((t.occupied / t.beds) * 100) : 0;
  main.innerHTML = `
    <div class="row between"><h2>${state.hostel === ALL ? 'All hostels – combined' : esc(hostelName(state.hostel))}</h2>${monthPicker()}</div>
    <div class="tiles">
      ${tile('Total beds', t.beds)}
      ${tile('Booked', t.occupied)}
      ${tile('Available', t.available, 'good')}
      ${tile('Occupancy', pct + '%')}
    </div>
    <div class="tiles">
      ${tile('Monthly income (agreed fees)', money(t.income), 'good')}
      ${tile('Expenses in ' + state.month, money(t.expenses), 'bad')}
      ${tile('Net', money(t.net), t.net >= 0 ? 'good' : 'bad')}
    </div>
    <div class="bar"><div style="width:${pct}%"></div></div>
    ${state.hostel === ALL && per.length > 1 ? `
    <h3>By hostel</h3>
    <div class="card scroll"><table>
      <tr><th>Hostel</th><th>Beds</th><th>Booked</th><th>Available</th><th>Income</th><th>Expenses</th><th>Net</th></tr>
      ${per.map((p) => `<tr><td>${esc(hostelName(p.id))}</td><td>${p.s.beds}</td><td>${p.s.occupied}</td><td>${p.s.available}</td><td>${money(p.s.income)}</td><td>${money(p.s.expenses)}</td><td>${money(p.s.net)}</td></tr>`).join('')}
    </table></div>` : ''}
    <h3>Expenses by category (${esc(state.month)})</h3>
    <div class="card scroll">${Object.keys(t.byCat).length ? `<table>${Object.entries(t.byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${money(v)}</td></tr>`).join('')}</table>` : '<span class="muted">No expenses recorded this month.</span>'}</div>
    <p class="muted small">Income = sum of the monthly fee agreed with each current occupant.</p>`;
  bindMonth();
}

// ---- Rooms & beds ----
function renderRooms(main) {
  if (state.hostel === ALL) return needSingleHostel(main);
  const id = state.hostel, d = state.data[id], w = state.session.canWrite;
  main.innerHTML = `
    <div class="row between"><h2>${esc(hostelName(id))} – Rooms & Beds</h2>
      ${w ? '<button class="primary" id="addRoom">+ Add room</button>' : ''}</div>
    ${d.rooms.length ? '' : '<div class="card center muted">No rooms yet.</div>'}
    <div class="rooms">${d.rooms.map((r) => {
      const occ = r.beds.filter((b) => b.occupant).length;
      return `<div class="card room">
        <div class="row between"><strong>Room ${esc(r.name)}</strong><span class="muted small">${occ}/${r.beds.length} occupied</span></div>
        <div class="beds">${r.beds.map((b) => `
          <button class="bed ${b.occupant ? 'taken' : 'free'}" data-room="${r.id}" data-bed="${b.id}">
            <span class="bl">Bed ${esc(b.label)}</span>
            <span class="bn">${b.occupant ? esc(b.occupant.name) : 'Available'}</span>
            ${b.occupant ? `<span class="bf">${money(b.occupant.fee)}</span>` : ''}
          </button>`).join('')}</div>
        ${w ? `<div class="row"><button data-addbed="${r.id}">+ Bed</button><button data-delroom="${r.id}" class="danger">Delete room</button></div>` : ''}
      </div>`;
    }).join('')}</div>`;
  if (w) document.getElementById('addRoom').onclick = () => roomDialog();
  main.querySelectorAll('.bed').forEach((b) => (b.onclick = () => bedDialog(b.dataset.room, b.dataset.bed)));
  main.querySelectorAll('[data-addbed]').forEach((b) => (b.onclick = () => addBed(b.dataset.addbed)));
  main.querySelectorAll('[data-delroom]').forEach((b) => (b.onclick = () => delRoom(b.dataset.delroom)));
}

function modal(html, onSubmit) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<form class="card">${html}</form>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); close(); }));
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try { await onSubmit(new FormData(e.target), close, e.submitter); } catch (err) { /* toast already shown */ }
  };
  return el;
}

function roomDialog() {
  modal(`<h3>Add room</h3>
    <label>Room name / number <input name="name" required></label>
    <label>Number of beds <input name="n" type="number" min="1" max="30" value="4" required></label>
    <div class="row"><button class="primary">Add</button><button data-close>Cancel</button></div>`,
  async (f, close) => {
    const d = state.data[state.hostel];
    const name = f.get('name').trim();
    if (d.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) { toast('A room with that name already exists', true); return; }
    const n = Number(f.get('n'));
    d.rooms.push({ id: uid(), name, beds: Array.from({ length: n }, (_, i) => ({ id: uid(), label: String(i + 1), occupant: null })) });
    await saveHostel(state.hostel, `Add room ${name}`);
    close(); render();
  });
}

async function addBed(roomId) {
  const d = state.data[state.hostel], r = d.rooms.find((x) => x.id === roomId);
  r.beds.push({ id: uid(), label: String(r.beds.length + 1), occupant: null });
  await saveHostel(state.hostel, `Add bed to room ${r.name}`).catch(() => {});
  render();
}
async function delRoom(roomId) {
  const d = state.data[state.hostel], r = d.rooms.find((x) => x.id === roomId);
  if (r.beds.some((b) => b.occupant)) return toast('Vacate all beds before deleting the room', true);
  if (!confirm(`Delete room ${r.name}?`)) return;
  d.rooms = d.rooms.filter((x) => x.id !== roomId);
  await saveHostel(state.hostel, `Delete room ${r.name}`).catch(() => {});
  render();
}

function bedDialog(roomId, bedId) {
  const hid = state.hostel, d = state.data[hid], w = state.session.canWrite;
  const room = d.rooms.find((r) => r.id === roomId), bed = room.beds.find((b) => b.id === bedId), o = bed.occupant;
  const title = `Room ${esc(room.name)} · Bed ${esc(bed.label)}`;
  if (!w) {
    return modal(`<h3>${title}</h3>${o ? `<p><strong>${esc(o.name)}</strong><br>${esc(o.phone || '')}<br>Fee: ${money(o.fee)}<br>Since ${esc(o.since)}</p>` : '<p class="muted">Available</p>'}
      <div class="row"><button data-close>Close</button></div>`, async () => {});
  }
  modal(`<h3>${title}</h3>
    <label>Occupant name <input name="name" required value="${esc(o?.name || '')}"></label>
    <label>Phone <input name="phone" value="${esc(o?.phone || '')}"></label>
    <label>Agreed monthly fee (${CURRENCY}) <input name="fee" type="number" min="0" step="1" required value="${esc(o?.fee ?? '')}"></label>
    <label>Move-in date <input name="since" type="date" required value="${esc(o?.since || today())}"></label>
    <div class="row">
      <button class="primary" value="save">${o ? 'Save changes' : 'Assign bed'}</button>
      ${o ? '<button value="vacate" class="danger" formnovalidate>Vacate</button>' : ''}
      <button data-close>Cancel</button>
    </div>`,
  async (f, close, submitter) => {
    if (submitter && submitter.value === 'vacate') {
      if (!confirm(`Vacate ${o.name}?`)) return;
      d.history = d.history || [];
      d.history.push({ name: o.name, phone: o.phone, room: room.name, bed: bed.label, fee: o.fee, from: o.since, to: today() });
      bed.occupant = null;
      await saveHostel(hid, `Vacate ${o.name} from room ${room.name} bed ${bed.label}`);
    } else {
      bed.occupant = { name: f.get('name').trim(), phone: f.get('phone').trim(), fee: Number(f.get('fee')), since: f.get('since') };
      await saveHostel(hid, `${o ? 'Update' : 'Assign'} ${bed.occupant.name} – room ${room.name} bed ${bed.label}`);
    }
    close(); render();
  });
}

// ---- Expenses ----
function renderExpenses(main) {
  if (state.hostel === ALL) return needSingleHostel(main);
  const id = state.hostel, d = state.data[id], w = state.session.canWrite;
  const list = d.expenses.filter((e) => e.date.startsWith(state.month)).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  main.innerHTML = `
    <div class="row between"><h2>${esc(hostelName(id))} – Expenses</h2>${monthPicker()}</div>
    ${w ? `<form id="expForm" class="card grid">
      <label>Date <input name="date" type="date" required value="${today()}"></label>
      <label>Category <select name="category">${EXPENSE_CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label>Amount (${CURRENCY}) <input name="amount" type="number" min="0" step="1" required></label>
      <label>Note <input name="note"></label>
      <button class="primary">Add expense</button></form>` : ''}
    <div class="card scroll"><table>
      <tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th>${w ? '<th></th>' : ''}</tr>
      ${list.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.note)}</td><td class="num">${money(e.amount)}</td>${w ? `<td><button class="danger small" data-del="${e.id}">✕</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="5" class="muted">No expenses this month.</td></tr>'}
      <tr class="total"><td colspan="3">Total</td><td class="num">${money(total)}</td>${w ? '<td></td>' : ''}</tr>
    </table></div>`;
  bindMonth();
  if (w) {
    document.getElementById('expForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      d.expenses.push({ id: uid(), date: f.get('date'), category: f.get('category'), amount: Number(f.get('amount')), note: f.get('note').trim() });
      try { await saveHostel(id, `Expense: ${f.get('category')} ${f.get('amount')}`); } catch { return; }
      state.month = f.get('date').slice(0, 7);
      render();
    };
    main.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this expense?')) return;
      d.expenses = d.expenses.filter((x) => x.id !== b.dataset.del);
      await saveHostel(id, 'Delete expense').catch(() => {});
      render();
    }));
  }
}

// ---- Hostels (add / rename) ----
function renderSettings(main) {
  main.innerHTML = `
    <h2>Hostels</h2>
    <div class="card"><table>
      ${state.meta.hostels.map((h) => `<tr><td>${esc(h.name)}</td><td class="muted small">${esc(h.id)}</td><td><button data-rename="${esc(h.id)}">Rename</button></td></tr>`).join('')}
    </table></div>
    <form id="hostelForm" class="card row"><input name="name" placeholder="New hostel name" required><button class="primary">+ Add hostel</button></form>`;
  document.getElementById('hostelForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    let id = slug(name);
    while (state.meta.hostels.some((h) => h.id === id)) id += '-' + uid().slice(0, 2);
    state.meta.hostels.push({ id, name });
    state.data[id] = { rooms: [], expenses: [], history: [] };
    state.shas[id] = null;
    try {
      state.shas[id] = await GH.write(`hostels/${id}.json`, state.data[id], null, `Create hostel ${name}`);
      state.metaSha = await GH.write('hostels.json', state.meta, state.metaSha, `Add hostel ${name}`);
      state.hostel = id; state.tab = 'rooms'; render();
    } catch (err) { toast(err.message, true); boot(); }
  };
  main.querySelectorAll('[data-rename]').forEach((b) => (b.onclick = async () => {
    const h = state.meta.hostels.find((x) => x.id === b.dataset.rename);
    const name = prompt('New name', h.name);
    if (!name || !name.trim()) return;
    h.name = name.trim();
    try { state.metaSha = await GH.write('hostels.json', state.meta, state.metaSha, `Rename hostel to ${h.name}`); render(); }
    catch (err) { toast(err.message, true); boot(); }
  }));
}

// ---------- start ----------
state.session = loadSession();
if (state.session && state.session.token) boot(); else renderLogin();
