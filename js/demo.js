// Demo mode: made-up hostels kept in memory only. Nothing is saved to GitHub.
const Demo = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date(), M = (k) => { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const day = (k, d) => `${M(k)}-${pad(d)}`;
  const thisM = M(0), todayD = Math.min(now.getDate(), 28);
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const FIRST = ['Ali', 'Usman', 'Bilal', 'Hamza', 'Saad', 'Imran', 'Zain', 'Faisal', 'Ahmed', 'Omar', 'Kamran', 'Talha', 'Hassan', 'Junaid', 'Waqas', 'Asad', 'Fahad', 'Danish', 'Shahzaib', 'Haris', 'Arslan', 'Moiz', 'Rehan', 'Sufyan'];
  const LAST = ['Khan', 'Ahmed', 'Raza', 'Malik', 'Iqbal', 'Shah', 'Javed', 'Aziz', 'Nawaz', 'Farooq', 'Butt', 'Chaudhry', 'Qureshi', 'Siddiqui', 'Mirza', 'Hashmi'];
  const uid = () => Math.random().toString(36).slice(2, 9);
  let person = 0;
  const resident = (since, fee) => { person++; return { rid: uid(), name: `${FIRST[(person * 7) % FIRST.length]} ${LAST[(person * 5) % LAST.length]}`, phone: `03${String(10 + (person * 13) % 40)}-${String(1000000 + person * 48271 % 8999999).slice(0, 7)}`, cnic: `35202-${String(1000000 + person * 7919 % 8999999).slice(0, 7)}-${person % 9 + 1}`, fee, deposit: fee, since, notes: rnd() < 0.15 ? 'University student, pays via JazzCash' : '' }; };

  function hostel(floorsSpec, occRate, startBack) {
    const floors = [], rooms = [], history = [], payments = [], expenses = [];
    floorsSpec.forEach(([letter, count, pattern]) => {
      const f = { id: uid(), name: `${letter} Floor` }; floors.push(f);
      for (let i = 1; i <= count; i++) {
        const nBeds = pattern[(i - 1) % pattern.length], fee = { 1: 28000, 2: 20000, 3: 16000, 4: 14000 }[nBeds];
        rooms.push({ id: uid(), floorId: f.id, name: `${letter}${pad(i)}`, beds: Array.from({ length: nBeds }, (_, b) => {
          const occ = rnd() < occRate;
          return { id: uid(), label: String(b + 1), occupant: occ ? resident(day(Math.floor(rnd() * startBack), 1 + Math.floor(rnd() * 20)), fee) : null };
        }) });
      }
    });
    // a few people who moved out
    for (let i = 0; i < 4; i++) { const r = rooms[Math.floor(rnd() * rooms.length)], fee = 16000, o = resident(day(startBack, 1), fee);
      history.push({ rid: o.rid, name: o.name, phone: o.phone, cnic: o.cnic, room: r.name, bed: '1', fee, deposit: fee, depositReturned: i % 2 ? fee : fee - 4000, from: o.since, to: day(Math.max(1, startBack - 3 - i), 25) }); }
    // rent payments: last month mostly paid, this month partly collected
    const rentStart = M(2);
    rooms.forEach((r) => r.beds.forEach((b) => { const o = b.occupant; if (!o) return;
      [2, 1, 0].forEach((k) => {
        const m = M(k); if (o.since.slice(0, 7) > m || m < rentStart) return;
        const roll = rnd(), d = k === 0 ? Math.min(todayD, 1 + Math.floor(rnd() * 10)) : 1 + Math.floor(rnd() * 10);
        let amt = 0;
        if (k > 0) amt = roll < 0.85 ? o.fee : roll < 0.95 ? Math.round(o.fee / 2) : 0;
        else amt = roll < 0.45 ? o.fee : roll < 0.6 ? Math.round(o.fee / 2) : 0;
        if (amt) payments.push({ id: uid(), rid: o.rid, name: o.name, room: r.name, bed: b.label, month: m, date: `${m}-${pad(d)}`, amount: amt, method: rnd() < 0.6 ? 'Cash' : rnd() < 0.5 ? 'JazzCash' : 'Bank transfer', note: '', by: 'manager1' });
      });
    }));
    for (let k = 11; k >= 0; k--) {
      if (k > startBack) continue;
      const d = (n) => (k === 0 ? Math.min(todayD, n) : n);
      [['Electricity', 95000, 4], ['Gas', 14000, 6], ['Internet', 9500, 2], ['Water', 4000, 8], ['Salaries', 85000, 1], ['Food', 120000, 15], ['Cleaning', 12000, 12], ['Maintenance', 18000, 18]]
        .forEach(([c, a, dd]) => { if (k === 0 && dd > todayD) return; expenses.push({ id: uid(), date: day(k, d(dd)), category: c, amount: Math.round(a * (0.8 + rnd() * 0.4) / 100) * 100, note: { Electricity: 'LESCO bill', Gas: 'SNGPL bill', Internet: 'Fiber connection', Salaries: 'Warden and cook', Food: 'Mess groceries' }[c] || '' }); });
    }
    return { floors, rooms, expenses, history, payments, rentStart };
  }

  function files() {
    seed = 11; person = 0;
    return {
      'hostels.json': { hostels: [{ id: 'hostel-de-khas', name: 'HDK-1' }, { id: 'hostel-de-khas-no-2', name: 'HDK-2' }] },
      'hostels/hostel-de-khas.json': hostel([['A', 8, [3, 3, 2, 4]], ['B', 8, [3, 2, 3, 1]], ['C', 6, [4, 3, 2]]], 0.86, 10),
      'hostels/hostel-de-khas-no-2.json': hostel([['A', 6, [2, 3]], ['B', 6, [3, 2, 1]]], 0.55, 3),
    };
  }

  // Swap the GitHub client for an in-memory one.
  function start() {
    const store = files();
    GH.configure = () => {}; GH.check = async () => ({ canWrite: true });
    GH.read = async (p) => (store[p] ? { data: JSON.parse(JSON.stringify(store[p])), sha: 'demo' } : null);
    GH.write = async (p, d) => { store[p] = JSON.parse(JSON.stringify(d)); return 'demo'; };
    return { username: 'demo', role: 'owner', canWrite: true, demo: true, token: 'demo' };
  }
  return { start };
})();
