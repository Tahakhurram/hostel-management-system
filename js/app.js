// Hostel Management – static app. Data is stored as JSON in a private GitHub repo.
//   hostels.json         -> { hostels: [{id, name}] }
//   hostels/<id>.json    -> { floors:[{id,name}], rooms:[{id,floorId,name,beds:[{id,label,occupant}]}], expenses:[], history:[] }
const CURRENCY = 'PKR';
const DEFAULT_HOSTEL = 'HOSTEL DE KHAS';
const EXPENSE_CATEGORIES = ['Electricity', 'Internet', 'Water', 'Gas', 'Salaries', 'Maintenance', 'Food', 'Rent', 'Other'];
const ALL = '__all__';
const UNASSIGNED = '__unassigned__';

const $app = document.getElementById('app');
const state = {
  session: null, meta: null, metaSha: null, data: {}, shas: {},
  hostel: ALL, tab: 'dashboard',
  month: new Date().toISOString().slice(0, 7),
  search: '',
};

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${CURRENCY} ${Math.round(n || 0).toLocaleString('en-PK')}`;
const uid = () => Math.random().toString(36).slice(2, 9);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
const today = () => new Date().toISOString().slice(0, 10);
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), isErr ? 6000 : 2500);
}

// ---------- session ----------
const loadSession = () => { try { return JSON.parse(localStorage.getItem('hms_session')); } catch { return null; } };
const saveSession = (s) => localStorage.setItem('hms_session', JSON.stringify(s));
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
      s.canWrite = (await GH.check()).canWrite;
      saveSession(s); state.session = s; await boot();
    } catch (err) { renderLogin(err.message); }
  };
}

// ---------- data ----------
function normalise(d) {
  d.floors = d.floors || []; d.rooms = d.rooms || []; d.expenses = d.expenses || []; d.history = d.history || [];
  if (d.rooms.some((r) => !r.floorId || !d.floors.find((f) => f.id === r.floorId))) {
    let u = d.floors.find((f) => f.id === UNASSIGNED);
    if (!u) { u = { id: UNASSIGNED, name: 'Unassigned' }; d.floors.push(u); }
    d.rooms.forEach((r) => { if (!r.floorId || !d.floors.find((f) => f.id === r.floorId)) r.floorId = UNASSIGNED; });
  }
  return d;
}

async function boot() {
  $app.innerHTML = '<div class="center muted">Loading…</div>';
  try {
    GH.configure(state.session);
    let m = await GH.read('hostels.json');
    if (!m) {
      if (!state.session.canWrite) throw new Error('No data yet. Sign in with a read & write token first to set things up.');
      const meta = { hostels: [{ id: 'hostel-de-khas', name: DEFAULT_HOSTEL }] };
      m = { data: meta, sha: await GH.write('hostels.json', meta, null, 'Initialise hostels') };
    }
    state.meta = m.data; state.metaSha = m.sha;
    await Promise.all(state.meta.hostels.map(loadHostel));
    if (state.hostel !== ALL && !state.meta.hostels.find((h) => h.id === state.hostel)) state.hostel = ALL;
    render();
  } catch (err) { renderLogin(err.message); }
}

async function loadHostel(h) {
  const r = await GH.read(`hostels/${h.id}.json`);
  state.data[h.id] = normalise(r ? r.data : {});
  state.shas[h.id] = r ? r.sha : null;
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
const hostelName = (id) => (state.meta.hostels.find((h) => h.id === id) || {}).name || id;
const selectedIds = () => (state.hostel === ALL ? state.meta.hostels.map((h) => h.id) : [state.hostel]);
const sortedRooms = (d, floorId) => d.rooms.filter((r) => r.floorId === floorId).sort((a, b) => natural(a.name, b.name));
const floorName = (d, id) => (d.floors.find((f) => f.id === id) || {}).name || '—';

function monthsBack(month, n) {
  const [y, m] = month.split('-').map(Number), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  return out;
}
const monthLabel = (m) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

// Income for a month = fees of everyone who occupied a bed at any point in that month.
function incomeFor(id, month) {
  const d = state.data[id]; let total = 0;
  d.rooms.forEach((r) => r.beds.forEach((b) => {
    if (b.occupant && b.occupant.since.slice(0, 7) <= month) total += Number(b.occupant.fee) || 0;
  }));
  d.history.forEach((h) => { if (h.from.slice(0, 7) <= month && h.to.slice(0, 7) >= month) total += Number(h.fee) || 0; });
  return total;
}
const expensesFor = (id, month) => state.data[id].expenses.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + Number(e.amount), 0);

function hostelStats(id, month) {
  const d = state.data[id];
  let beds = 0, occupied = 0, feeSum = 0;
  const byFloor = d.floors.map((f) => ({ name: f.name, beds: 0, occupied: 0, id: f.id }));
  d.rooms.forEach((r) => r.beds.forEach((b) => {
    beds++;
    const fl = byFloor.find((f) => f.id === r.floorId);
    if (fl) fl.beds++;
    if (b.occupant) { occupied++; feeSum += Number(b.occupant.fee) || 0; if (fl) fl.occupied++; }
  }));
  const byCat = {};
  d.expenses.filter((e) => e.date.startsWith(month)).forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount)));
  const income = feeSum, expenses = expensesFor(id, month);
  const avgFee = occupied ? feeSum / occupied : 0;
  return { beds, occupied, available: beds - occupied, rooms: d.rooms.length, floors: d.floors.length, income, expenses, net: income - expenses, byCat, byFloor, avgFee, lost: avgFee * (beds - occupied) };
}
function sumStats(list) {
  const t = { beds: 0, occupied: 0, available: 0, rooms: 0, floors: 0, income: 0, expenses: 0, net: 0, lost: 0, byCat: {} };
  list.forEach((s) => {
    ['beds', 'occupied', 'available', 'rooms', 'floors', 'income', 'expenses', 'net', 'lost'].forEach((k) => (t[k] += s[k]));
    Object.entries(s.byCat).forEach(([c, v]) => (t.byCat[c] = (t.byCat[c] || 0) + v));
  });
  return t;
}

// ---------- charts ----------
let charts = [];
const killCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
function mkChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  Chart.defaults.color = css('--muted');
  Chart.defaults.font.family = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  Chart.defaults.borderColor = css('--grid');
  cfg.options = { responsive: true, maintainAspectRatio: false, ...cfg.options };
  charts.push(new Chart(el, cfg));
}
const short = (v) => (Math.abs(v) >= 1000 ? v / 1000 + 'k' : v);
const chartBox = (id, title, tableHtml) => `
  <div class="card"><h3>${title}</h3><div class="chartbox"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div>
  <details><summary>View as table</summary><div class="scroll">${tableHtml}</div></details></div>`;
const tableOf = (heads, rows) => `<table><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;

// ---------- rendering ----------
function render() {
  killCharts();
  const w = state.session.canWrite;
  const tabs = [['dashboard', 'Dashboard'], ['rooms', 'Rooms & Beds'], ['occupants', 'Occupants'], ['expenses', 'Expenses']];
  if (w) tabs.push(['setup', 'Setup']);
  if (!w && state.tab === 'setup') state.tab = 'dashboard';
  $app.innerHTML = `
    <header>
      <div class="brand">Hostel Management <span class="pill">${esc(state.session.owner)} · ${w ? 'read & write' : 'view only'}</span></div>
      <div class="hdr-right">
        <select id="hostelSel" aria-label="Hostel">
          ${state.meta.hostels.length > 1 ? `<option value="${ALL}">All hostels (combined)</option>` : ''}
          ${state.meta.hostels.map((h) => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('')}
        </select>
        <button id="refresh" title="Reload from GitHub">↻ Refresh</button>
        <button id="logout">Sign out</button>
      </div>
    </header>
    <nav>${tabs.map(([k, l]) => `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav>
    <main id="main"></main>`;
  if (state.meta.hostels.length === 1) state.hostel = state.meta.hostels[0].id;
  const sel = document.getElementById('hostelSel');
  sel.value = state.hostel;
  sel.onchange = (e) => { state.hostel = e.target.value; render(); };
  document.getElementById('refresh').onclick = boot;
  document.getElementById('logout').onclick = logout;
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); }));
  ({ dashboard: renderDashboard, rooms: renderRooms, occupants: renderOccupants, expenses: renderExpenses, setup: renderSetup })[state.tab](document.getElementById('main'));
}

const needSingleHostel = (main) => (main.innerHTML = '<div class="card center muted">Select a specific hostel from the dropdown above to view this page.</div>');
const monthPicker = () => `<label class="inline">Month <input type="month" id="monthSel" value="${state.month}"></label>`;
function bindMonth() {
  const el = document.getElementById('monthSel');
  if (el) el.onchange = (e) => { state.month = e.target.value || state.month; render(); };
}
const tile = (label, value, cls = '') => `<div class="tile ${cls}"><div class="tl">${label}</div><div class="tv">${value}</div></div>`;

// ---- Dashboard ----
function renderDashboard(main) {
  const ids = selectedIds();
  const per = ids.map((id) => ({ id, s: hostelStats(id, state.month) }));
  const t = sumStats(per.map((p) => p.s));
  const pct = t.beds ? Math.round((t.occupied / t.beds) * 100) : 0;
  if (!t.beds) {
    main.innerHTML = `<h2>${esc(state.hostel === ALL ? 'All hostels' : hostelName(state.hostel))}</h2>
      <div class="card center"><p><strong>No rooms set up yet.</strong></p>
      <p class="muted">Go to <b>Setup</b> to add floors, rooms and beds. The charts appear once beds exist.</p></div>`;
    return;
  }
  main.innerHTML = `
    <div class="row between"><h2>${esc(state.hostel === ALL ? 'All hostels – combined' : hostelName(state.hostel))}</h2>${monthPicker()}</div>
    <div class="tiles">
      ${tile('Total beds', t.beds)}${tile('Booked', t.occupied)}${tile('Available', t.available)}${tile('Occupancy', pct + '%')}
    </div>
    <div class="tiles">
      ${tile('Monthly income (agreed fees)', money(t.income))}
      ${tile('Expenses · ' + monthLabel(state.month), money(t.expenses))}
      ${tile('Net', money(t.net), t.net >= 0 ? 'pos' : 'neg')}
      ${tile('Income lost to empty beds', money(t.lost), t.lost ? 'neg' : '')}
    </div>
    <div class="charts">
      ${chartBox('cOcc', 'Bed status', tableOf(['Status', 'Beds'], [['Booked', t.occupied], ['Available', t.available]]))}
      ${chartBox('cGroup', per.length > 1 ? 'Occupancy by hostel' : 'Occupancy by floor', '')}
      ${chartBox('cTrend', 'Income vs expenses – last 6 months', '')}
      ${chartBox('cCat', 'Expenses by category · ' + monthLabel(state.month), '')}
    </div>
    ${per.length > 1 ? `<div class="card scroll"><h3>By hostel</h3><table>
      <tr><th>Hostel</th><th>Beds</th><th>Booked</th><th>Available</th><th>Income</th><th>Expenses</th><th>Net</th></tr>
      ${per.map((p) => `<tr><td>${esc(hostelName(p.id))}</td><td>${p.s.beds}</td><td>${p.s.occupied}</td><td>${p.s.available}</td><td>${money(p.s.income)}</td><td>${money(p.s.expenses)}</td><td>${money(p.s.net)}</td></tr>`).join('')}
    </table></div>` : ''}
    <p class="muted small">Income = monthly fee agreed with each current occupant. Past months use each person's move-in/out dates. Fees are agreed amounts, not payments received.</p>`;
  bindMonth();

  const s1 = css('--s1'), s2 = css('--s2'), s3 = css('--s3'), neutral = css('--neutral'), surface = css('--card');
  const bar = { borderColor: surface, borderWidth: 2, borderRadius: 4 };
  const moneyTip = { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y ?? c.parsed.x)}` } };

  mkChart('cOcc', { type: 'doughnut', data: { labels: ['Booked', 'Available'], datasets: [{ data: [t.occupied, t.available], backgroundColor: [s1, neutral], borderColor: surface, borderWidth: 2 }] },
    options: { cutout: '66%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.parsed} beds` } } } } });

  // Occupancy by group (hostels if several, else floors)
  const groups = per.length > 1
    ? per.map((p) => ({ name: hostelName(p.id), beds: p.s.beds, occupied: p.s.occupied }))
    : per[0].s.byFloor.filter((f) => f.beds);
  mkChart('cGroup', { type: 'bar', data: { labels: groups.map((g) => g.name), datasets: [
      { label: 'Booked', data: groups.map((g) => g.occupied), backgroundColor: s1, ...bar },
      { label: 'Available', data: groups.map((g) => g.beds - g.occupied), backgroundColor: neutral, ...bar }] },
    options: { indexAxis: 'y', scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } }, plugins: { legend: { position: 'bottom' } } } });
  document.querySelector('#cGroup').closest('.card').querySelector('.scroll').innerHTML =
    tableOf([per.length > 1 ? 'Hostel' : 'Floor', 'Beds', 'Booked', 'Available'], groups.map((g) => [g.name, g.beds, g.occupied, g.beds - g.occupied]));

  // Trend
  const months = monthsBack(state.month, 6);
  const inc = months.map((m) => ids.reduce((s, id) => s + incomeFor(id, m), 0));
  const exp = months.map((m) => ids.reduce((s, id) => s + expensesFor(id, m), 0));
  const net = inc.map((v, i) => v - exp[i]);
  mkChart('cTrend', { type: 'bar', data: { labels: months.map(monthLabel), datasets: [
      { label: 'Income', data: inc, backgroundColor: s1, ...bar },
      { label: 'Expenses', data: exp, backgroundColor: s2, ...bar },
      { type: 'line', label: 'Net', data: net, borderColor: s3, backgroundColor: s3, borderWidth: 2, pointRadius: 4, pointBorderColor: surface, pointBorderWidth: 2, tension: 0 }] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: { callback: short } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom' }, tooltip: moneyTip } } });
  document.querySelector('#cTrend').closest('.card').querySelector('.scroll').innerHTML =
    tableOf(['Month', 'Income', 'Expenses', 'Net'], months.map((m, i) => [monthLabel(m), money(inc[i]), money(exp[i]), money(net[i])]));

  // Expense categories
  const cats = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  const catCard = document.querySelector('#cCat').closest('.card');
  if (!cats.length) catCard.querySelector('.chartbox').innerHTML = '<p class="muted center">No expenses recorded this month.</p>';
  else mkChart('cCat', { type: 'bar', data: { labels: cats.map((c) => c[0]), datasets: [{ label: 'Expenses', data: cats.map((c) => c[1]), backgroundColor: s1, ...bar }] },
    options: { indexAxis: 'y', scales: { x: { ticks: { callback: short } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: moneyTip } } });
  catCard.querySelector('.scroll').innerHTML = tableOf(['Category', 'Amount'], cats.map((c) => [c[0], money(c[1])]));
}

// ---- Modal ----
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
    try { await onSubmit(new FormData(e.target), close, e.submitter); } catch (err) { /* toast shown */ }
  };
}

// Parse "4" -> 1..4 (skipping used labels), or "A, B, C" -> ['A','B','C'].
function bedLabelsFromSpec(spec, used = new Set()) {
  spec = (spec || '').trim();
  if (!spec) return [];
  if (/^\d+$/.test(spec)) {
    const n = Math.min(Number(spec), 60), out = []; let i = 1;
    while (out.length < n) { const l = String(i++); if (!used.has(l.toLowerCase())) out.push(l); }
    return out;
  }
  return spec.split(',').map((s) => s.trim()).filter(Boolean);
}
const dupes = (arr) => arr.find((x, i) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) !== i);

// ---- Rooms & Beds ----
function renderRooms(main) {
  if (state.hostel === ALL) return needSingleHostel(main);
  const id = state.hostel, d = state.data[id], w = state.session.canWrite;
  main.innerHTML = `
    <div class="row between"><h2>${esc(hostelName(id))} – Rooms & Beds</h2>
      ${w ? '<button class="primary" id="addRoom">+ Add room</button>' : ''}</div>
    ${d.rooms.length ? '' : '<div class="card center muted">No rooms yet. Use <b>Setup</b> to add floors and rooms.</div>'}
    ${d.floors.map((f) => {
      const rooms = sortedRooms(d, f.id);
      if (!rooms.length) return '';
      const beds = rooms.reduce((s, r) => s + r.beds.length, 0), occ = rooms.reduce((s, r) => s + r.beds.filter((b) => b.occupant).length, 0);
      return `<div class="floor"><h3>${esc(f.name)}</h3><span class="muted small">${occ}/${beds} beds booked</span></div>
      <div class="rooms">${rooms.map((r) => `<div class="card room">
        <div class="row between"><strong>Room ${esc(r.name)}</strong><span class="muted small">${r.beds.filter((b) => b.occupant).length}/${r.beds.length} booked</span></div>
        <div class="beds">${r.beds.map((b) => `
          <button class="bed ${b.occupant ? 'taken' : 'free'}" data-room="${r.id}" data-bed="${b.id}">
            <span class="bl">Bed ${esc(b.label)}</span>
            <span class="bn">${b.occupant ? esc(b.occupant.name) : 'Available'}</span>
            ${b.occupant ? `<span class="bf">${money(b.occupant.fee)}</span>` : ''}
          </button>`).join('')}</div>
        ${w ? `<div class="row"><button data-editroom="${r.id}">Edit room & beds</button></div>` : ''}
      </div>`).join('')}</div>`;
    }).join('')}`;
  if (w) {
    document.getElementById('addRoom').onclick = () => addRoomDialog();
    main.querySelectorAll('[data-editroom]').forEach((b) => (b.onclick = () => editRoomDialog(b.dataset.editroom)));
  }
  main.querySelectorAll('.bed').forEach((b) => (b.onclick = () => bedDialog(b.dataset.room, b.dataset.bed)));
}

function floorOptions(d, sel) {
  return d.floors.map((f) => `<option value="${esc(f.id)}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}

function addRoomDialog() {
  const hid = state.hostel, d = state.data[hid];
  if (!d.floors.length) return toast('Add a floor first (Setup tab)', true);
  modal(`<h3>Add room</h3>
    <label>Floor <select name="floor">${floorOptions(d)}</select></label>
    <label>Room name / ID <input name="name" required placeholder="e.g. 101"></label>
    <label>Beds – a number (4) or your own IDs (A, B, C, D) <input name="beds" required value="4"></label>
    <div class="row"><button class="primary">Add</button><button data-close>Cancel</button></div>`,
  async (f, close) => {
    const name = f.get('name').trim();
    if (d.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) { toast('A room with that name already exists', true); return; }
    const labels = bedLabelsFromSpec(f.get('beds'));
    if (!labels.length) { toast('Enter at least one bed', true); return; }
    if (dupes(labels)) { toast(`Duplicate bed ID: ${dupes(labels)}`, true); return; }
    d.rooms.push({ id: uid(), floorId: f.get('floor'), name, beds: labels.map((l) => ({ id: uid(), label: l, occupant: null })) });
    await saveHostel(hid, `Add room ${name}`);
    close(); render();
  });
}

function editRoomDialog(roomId) {
  const hid = state.hostel, d = state.data[hid], room = d.rooms.find((r) => r.id === roomId);
  modal(`<h3>Edit room ${esc(room.name)}</h3>
    <label>Room name / ID <input name="name" required value="${esc(room.name)}"></label>
    <label>Floor <select name="floor">${floorOptions(d, room.floorId)}</select></label>
    <div class="muted small">Bed IDs (edit to rename; tick to remove an empty bed)</div>
    ${room.beds.map((b) => `<div class="bedrow"><label>Bed <input name="bed_${b.id}" required value="${esc(b.label)}"></label>
      ${b.occupant ? `<span class="muted small">${esc(b.occupant.name)}</span>` : `<label class="inline"><input type="checkbox" name="rm_${b.id}"> remove</label>`}</div>`).join('')}
    <label>Add beds – a number or IDs (A, B) <input name="add" placeholder="optional"></label>
    <div class="row"><button class="primary">Save</button><button value="delete" class="danger" formnovalidate>Delete room</button><button data-close>Cancel</button></div>`,
  async (f, close, submitter) => {
    if (submitter && submitter.value === 'delete') {
      if (room.beds.some((b) => b.occupant)) { toast('Vacate all beds before deleting the room', true); return; }
      if (!confirm(`Delete room ${room.name}?`)) return;
      d.rooms = d.rooms.filter((r) => r.id !== roomId);
      await saveHostel(hid, `Delete room ${room.name}`); close(); render(); return;
    }
    const name = f.get('name').trim();
    if (d.rooms.some((r) => r.id !== roomId && r.name.toLowerCase() === name.toLowerCase())) { toast('A room with that name already exists', true); return; }
    const kept = room.beds.filter((b) => !f.get('rm_' + b.id));
    const labels = kept.map((b) => f.get('bed_' + b.id).trim());
    const extra = bedLabelsFromSpec(f.get('add'), new Set(labels.map((l) => l.toLowerCase())));
    const all = [...labels, ...extra];
    if (!all.length) { toast('A room needs at least one bed (or delete the room)', true); return; }
    if (all.some((l) => !l)) { toast('Bed IDs cannot be empty', true); return; }
    if (dupes(all)) { toast(`Duplicate bed ID: ${dupes(all)}`, true); return; }
    kept.forEach((b, i) => (b.label = labels[i]));
    room.beds = [...kept, ...extra.map((l) => ({ id: uid(), label: l, occupant: null }))];
    room.name = name; room.floorId = f.get('floor');
    await saveHostel(hid, `Edit room ${name}`); close(); render();
  });
}

function bedDialog(roomId, bedId) {
  const hid = state.hostel, d = state.data[hid], w = state.session.canWrite;
  const room = d.rooms.find((r) => r.id === roomId), bed = room.beds.find((b) => b.id === bedId), o = bed.occupant;
  const title = `${esc(floorName(d, room.floorId))} · Room ${esc(room.name)} · Bed ${esc(bed.label)}`;
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

// ---- Occupants ----
function renderOccupants(main) {
  const ids = selectedIds(), multi = ids.length > 1;
  const rows = [];
  ids.forEach((id) => {
    const d = state.data[id];
    d.floors.forEach((f) => sortedRooms(d, f.id).forEach((r) => r.beds.forEach((b) => {
      if (b.occupant) rows.push({ hostel: hostelName(id), floor: f.name, room: r.name, bed: b.label, ...b.occupant });
    })));
  });
  main.innerHTML = `
    <div class="row between"><h2>Occupants (${rows.length})</h2>
      <input id="search" placeholder="Search name, phone, room…" value="${esc(state.search)}" style="max-width:260px"></div>
    <div class="card scroll"><table id="occTable"></table></div>`;
  const draw = () => {
    const q = state.search.toLowerCase();
    const list = rows.filter((r) => !q || [r.name, r.phone, r.room, r.bed, r.floor].join(' ').toLowerCase().includes(q));
    document.getElementById('occTable').innerHTML = `<tr>${multi ? '<th>Hostel</th>' : ''}<th>Name</th><th>Phone</th><th>Floor</th><th>Room</th><th>Bed</th><th class="num">Monthly fee</th><th>Since</th></tr>` +
      (list.map((r) => `<tr>${multi ? `<td>${esc(r.hostel)}</td>` : ''}<td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.floor)}</td><td>${esc(r.room)}</td><td>${esc(r.bed)}</td><td class="num">${money(r.fee)}</td><td>${esc(r.since)}</td></tr>`).join('') ||
        `<tr><td colspan="8" class="muted">No occupants found.</td></tr>`);
  };
  draw();
  document.getElementById('search').oninput = (e) => { state.search = e.target.value; draw(); };
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

// ---- Setup: floors, quick room generator, hostels ----
function renderSetup(main) {
  const single = state.hostel !== ALL;
  const id = state.hostel, d = single ? state.data[id] : null;
  main.innerHTML = `
    ${single ? `
    <h2>${esc(hostelName(id))} – Setup</h2>
    <div class="card"><h3>Floors</h3>
      <table>${d.floors.map((f, i) => {
        const n = d.rooms.filter((r) => r.floorId === f.id).length;
        return `<tr><td>${esc(f.name)}</td><td class="muted small">${n} room${n === 1 ? '' : 's'}</td>
          <td class="num"><button class="small" data-up="${f.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="small" data-down="${f.id}" ${i === d.floors.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="small" data-renamefloor="${f.id}">Rename</button>
          <button class="small danger" data-delfloor="${f.id}">Delete</button></td></tr>`;
      }).join('') || '<tr><td class="muted">No floors yet.</td></tr>'}</table>
      <form id="floorForm" class="row"><input name="name" required placeholder="New floor, e.g. Ground Floor or Floor 1" style="max-width:340px"><button class="primary">+ Add floor</button></form>
    </div>
    <div class="card"><h3>Quick add rooms</h3>
      <p class="muted small">Generates several rooms with beds at once. You can rename any room or bed afterwards in Rooms & Beds.</p>
      <form id="quickForm" class="grid">
        <label>Floor <select name="floor" required>${floorOptions(d)}</select></label>
        <label>Number of rooms <input name="count" type="number" min="1" max="60" value="5" required></label>
        <label>First room ID <input name="first" required placeholder="101" value="101"></label>
        <label>Beds per room <input name="per" type="number" min="1" max="26" value="4" required></label>
        <label>Bed ID style <select name="style"><option value="num">1, 2, 3…</option><option value="let">A, B, C…</option><option value="pre">Room-1, Room-2…</option></select></label>
        <button class="primary" ${d.floors.length ? '' : 'disabled'}>Generate rooms</button>
      </form>
    </div>` : '<div class="card muted">Select a hostel in the dropdown above to configure its floors and rooms.</div>'}
    <div class="card"><h3>Hostels</h3>
      <table>${state.meta.hostels.map((h) => `<tr><td>${esc(h.name)}</td><td class="muted small">${esc(h.id)}</td><td class="num"><button class="small" data-rename="${esc(h.id)}">Rename</button></td></tr>`).join('')}</table>
      <form id="hostelForm" class="row"><input name="name" required placeholder="New hostel name (set up later)" style="max-width:340px"><button>+ Add hostel</button></form>
    </div>`;

  if (single) {
    const saveD = async (msg) => { try { await saveHostel(id, msg); render(); } catch { /* shown */ } };
    document.getElementById('floorForm').onsubmit = (e) => {
      e.preventDefault();
      const name = new FormData(e.target).get('name').trim();
      if (d.floors.some((f) => f.name.toLowerCase() === name.toLowerCase())) return toast('That floor already exists', true);
      d.floors.push({ id: uid(), name }); saveD(`Add floor ${name}`);
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
    document.getElementById('quickForm').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target), count = Number(f.get('count')), per = Number(f.get('per')), first = f.get('first').trim(), style = f.get('style');
      const m = first.match(/^(.*?)(\d+)$/);
      const nameAt = (i) => (m ? m[1] + String(Number(m[2]) + i).padStart(m[2].length, '0') : `${first}${i + 1}`);
      let added = 0, skipped = 0;
      for (let i = 0; i < count; i++) {
        const name = nameAt(i);
        if (d.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
        const label = (j) => (style === 'let' ? String.fromCharCode(65 + j) : style === 'pre' ? `${name}-${j + 1}` : String(j + 1));
        d.rooms.push({ id: uid(), floorId: f.get('floor'), name, beds: Array.from({ length: per }, (_, j) => ({ id: uid(), label: label(j), occupant: null })) });
        added++;
      }
      if (!added) return toast(`No rooms added – all ${skipped} names already exist`, true);
      saveHostel(id, `Quick add ${added} rooms`).then(() => { if (skipped) toast(`Added ${added}, skipped ${skipped} existing`); render(); }).catch(() => {});
    };
  }
  document.getElementById('hostelForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    let hid = slug(name);
    while (state.meta.hostels.some((h) => h.id === hid)) hid += '-' + uid().slice(0, 2);
    state.meta.hostels.push({ id: hid, name });
    state.data[hid] = normalise({}); state.shas[hid] = null;
    try {
      state.shas[hid] = await GH.write(`hostels/${hid}.json`, state.data[hid], null, `Create hostel ${name}`);
      state.metaSha = await GH.write('hostels.json', state.meta, state.metaSha, `Add hostel ${name}`);
      state.hostel = hid; toast('Hostel added – set up its floors and rooms'); render();
    } catch (err) { toast(err.message, true); boot(); }
  };
  main.querySelectorAll('[data-rename]').forEach((b) => (b.onclick = async () => {
    const h = state.meta.hostels.find((x) => x.id === b.dataset.rename), name = (prompt('New name', h.name) || '').trim();
    if (!name) return;
    h.name = name;
    try { state.metaSha = await GH.write('hostels.json', state.meta, state.metaSha, `Rename hostel to ${name}`); render(); }
    catch (err) { toast(err.message, true); boot(); }
  }));
}

// ---------- start ----------
state.session = loadSession();
if (state.session && state.session.token) boot(); else renderLogin();
