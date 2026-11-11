// Excel import / export (SheetJS, loaded on demand).
const Excel = (() => {
  let loading = null;
  function load() {
    if (window.XLSX) return Promise.resolve();
    if (!loading) loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res; s.onerror = () => { loading = null; rej(new Error('Could not load the Excel library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Accepts Date, Excel serial number, "2026-11-01", "1/11/2026" (day first) -> "YYYY-MM-DD" or null.
  function toDate(v) {
    if (v === '' || v == null) return null;
    if (v instanceof Date && !isNaN(v)) return iso(v);
    if (typeof v === 'number') { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null; }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return null;
  }
  const toNum = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? null : n; };

  // Read the first sheet into objects keyed by simplified header names.
  async function readRows(file) {
    await load();
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }).map((r) => {
      const o = {};
      Object.entries(r).forEach(([k, v]) => (o[k.toLowerCase().replace(/[^a-z]/g, '')] = typeof v === 'string' ? v.trim() : v));
      return o;
    }).filter((r) => Object.values(r).some((v) => v !== ''));
  }
  const pick = (row, ...prefixes) => { for (const p of prefixes) { const k = Object.keys(row).find((x) => x.startsWith(p)); if (k) return row[k]; } return ''; };

  function download(sheets, filename) {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ name, rows, widths }) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, filename);
  }

  const RES_HEAD = ['Floor', 'Room', 'Bed', 'Resident Name', 'Phone', 'CNIC', 'Monthly Rent (PKR)', 'Security Deposit (PKR)', 'Move-in Date (YYYY-MM-DD)', 'Notes'];
  const EXP_HEAD = ['Date (YYYY-MM-DD)', 'Category', 'Amount (PKR)', 'Note'];

  return {
    load, readRows, toDate, toNum, pick, download, RES_HEAD, EXP_HEAD,
    async template(kind) {
      await load();
      if (kind === 'residents') download([{ name: 'Rooms & Residents', widths: [14, 8, 6, 22, 14, 16, 18, 20, 22, 24], rows: [RES_HEAD,
        ['A Floor', 'A01', '1', 'Ali Khan', '0300-1234567', '35202-1234567-1', 15000, 15000, '2026-11-01', ''],
        ['A Floor', 'A01', '2', '', '', '', '', '', '', 'empty bed – leave name blank'],
        ['B Floor', 'B01', '1', 'Usman Ahmed', '0312-7654321', '', 18000, 10000, '2026-10-15', '']] }], 'rooms-residents-template.xlsx');
      else download([{ name: 'Expenses', widths: [18, 14, 14, 30], rows: [EXP_HEAD,
        ['2026-11-05', 'Electricity', 42000, 'LESCO bill'], ['2026-11-07', 'Internet', 6500, 'Fiber']] }], 'expenses-template.xlsx');
    },
  };
})();
