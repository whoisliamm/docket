const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), zlib = require('zlib');
const dir = process.argv[2];
const TOKEN = '123456:TESTTOKEN';
const props = { BOT_TOKEN: TOKEN, ALLOWED_CHAT_IDS: '111, 222', OWNER_CHAT_ID: '111', SPREADSHEET_ID: 'x', RECEIPT_FOLDER_ID: 'f', WEBHOOK_KEY: 'k', MINIAPP_URL: 'https://a.github.io/m/', WEBAPP_URL: 'https://script.google.com/macros/s/x/exec' };
const sheets = {};
function mkSheet() {
  const rows = [];
  return {
    rows, getLastRow: () => rows.length, appendRow: r => rows.push(r.slice()),
    getRange: (r, c, nr, nc) => {
      nc = nc || 1; nr = nr || 1;
      return {
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { rows[r - 1 + i] = rows[r - 1 + i] || []; rows[r - 1 + i][c - 1 + j] = x; })); return this; },
        getValues: () => { const o = []; for (let i = 0; i < nr; i++) { o.push([]); for (let j = 0; j < nc; j++) o[i].push((rows[r - 1 + i] || [])[c - 1 + j] ?? ''); } return o; },
        setValue(x) { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; return this; },
        setFontWeight() { return this; }, setNumberFormat() { return this; }
      };
    },
    setFrozenRows() {}, getMaxRows: () => 1000
  };
}
const sent = [];
const toSigned = b => Array.from(b).map(x => x > 127 ? x - 256 : x);
const toBuf = a => Buffer.from(a.map(x => x & 255));
const ctx = {
  console, JSON, Math, Date, Object,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => props[k] = v }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet()) }) },
  Utilities: {
    formatDate: (d, tz, f) => {
      const s = new Date(d.getTime() + 7 * 3600e3); const p = n => String(n).padStart(2, '0');
      if (f === 'yyyy-MM') return s.getUTCFullYear() + '-' + p(s.getUTCMonth() + 1);
      if (f === 'd-M-yyyy') return s.getUTCDate() + '-' + (s.getUTCMonth() + 1) + '-' + s.getUTCFullYear();
      if (f === 'yyyy-M-d') return s.getUTCFullYear() + '-' + (s.getUTCMonth() + 1) + '-' + s.getUTCDate();
      return s.toISOString();
    },
    newBlob: (x, type, name) => Array.isArray(x)
      ? ({ bytes: x, type, name, getBytes: () => x, setName(n) { this.name = n; return this; } })
      : ({ getBytes: () => toSigned(Buffer.from(x, 'utf8')), getAs: () => ({ setName: n => ({ name: n, lama: true }) }) }),
    base64Decode: s => toSigned(Buffer.from(s, 'base64')),
    gzip: blob => ({ getBytes: () => toSigned(zlib.gzipSync(Buffer.from(blob.bytes.map(v => v & 255)))) }),
    computeHmacSha256Signature: (v, k) => toSigned(crypto.createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
    getUuid: () => 'u'
  },
  DriveApp: { getFolderById: () => ({ getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: b => ({ getUrl: () => 'https://drive/' + b.name }) }) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  HtmlService: { createHtmlOutput: h => ({ html: h }) },
  Logger: { log() {} },
  UrlFetchApp: { fetch: (url, o) => { sent.push({ m: url.split('/').pop(), p: o.payload }); return { getContentText: () => '{"ok":true}' }; } }
};
vm.createContext(ctx);
for (const f of ['Config', 'Assets', 'Template', 'Parser', 'Storage', 'Telegram', 'Core', 'Api', 'Bot', 'Setup'])
  vm.runInContext(fs.readFileSync(dir + '/' + f + '.gs', 'utf8'), ctx, { filename: f });

function initData(user, authDate) {
  const p = { auth_date: String(authDate || Math.floor(Date.now() / 1000)), query_id: 'AAH', user: JSON.stringify(user) };
  const dcs = Object.keys(p).sort().map(k => k + '=' + p[k]).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return Object.entries(p).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}
const call = (body) => JSON.parse(ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(body) } }).t);
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const good = initData({ id: 111, first_name: 'Rina' });
let r = call({ action: 'bootstrap', initData: good });
assert(r.ok && r.user.name === 'Rina' && r.config.dpPersen === 50, 'bootstrap valid');
r = call({ action: 'bootstrap', initData: good.replace('Rina', 'Hacker') });
assert(!r.ok && r.code === 'auth', 'initData yang diubah ditolak');
r = call({ action: 'bootstrap', initData: initData({ id: 333, first_name: 'X' }) });
assert(!r.ok && r.code === 'forbidden' && r.userId === '333', 'user tidak terdaftar ditolak');
r = call({ action: 'bootstrap', initData: initData({ id: 111 }, Math.floor(Date.now() / 1000) - 90000) });
assert(!r.ok && r.code === 'auth', 'initData kedaluwarsa ditolak');

r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Kedai Kopi Senja', mempelai: 'J & E', tanggalAcara: '22 Januari 2027', kode: 'DG',
  items: [{ nama: 'DG Onsite', harga: 2700000, qty: 1 }, { nama: 'QR', harga: 500000, qty: 2 }], diskon: 200000 } });
assert(r.ok && r.invoice.total === 3500000 && /^INV-DG-\d{4}-\d{2}-001$/.test(r.invoice.noInvoice) && r.dp === 1750000,
  'invoice.create ' + (r.invoice && r.invoice.noInvoice) + ' total ' + (r.invoice && r.invoice.total));
assert(sent.some(s => s.m === 'sendDocument' && s.p.chat_id === '111'), 'PDF invoice dikirim ke chat user');
const no = r.invoice.noInvoice;
r = call({ action: 'invoice.create', initData: good, data: { kepada: '', items: [] } });
assert(!r.ok && /Kepada/.test(r.error) && /item/.test(r.error), 'validasi invoice: ' + (r.error || '').replace(/\n/g, ' | '));
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'A', items: [{ nama: 'x', harga: 100, qty: 1 }], noInvoice: no } });
assert(!r.ok && /nomor manual tidak dipakai/.test(r.error), 'nomor manual ditolak (nomor selalu otomatis)');

r = call({ action: 'receipt.create', initData: good, data: { noInvoice: no, jumlah: 1750000, metode: 'QRIS', tglBayar: '16 November 2026' } });
assert(r.ok && r.payment.status === 'DP DITERIMA' && r.invoice.dibayar === 1750000, 'receipt 1 DP');
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: no, jumlah: 99999999 } });
assert(!r.ok && /melebihi/.test(r.error), 'receipt melebihi sisa ditolak');
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: no, jumlah: 1000000 } });
assert(r.ok && r.payment.status === 'PEMBAYARAN DITERIMA' && r.payment.ke === 2, 'receipt 2 sebagian');
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: no, jumlah: 750000 } });
assert(r.ok && r.payment.status === 'LUNAS' && r.invoice.status === 'LUNAS', 'receipt 3 lunas');
r = call({ action: 'payments', initData: good, data: { noInvoice: no } });
assert(r.ok && r.payments.length === 3 && r.payments[2].url.includes('Receipt'), 'riwayat pembayaran 3 baris');
r = call({ action: 'bootstrap', initData: good });
assert(r.invoices[0].status === 'LUNAS' && r.invoices[0].dibayar === 3500000, 'sheet invoice ter-update');

// jalur perintah chat tetap jalan
sent.length = 0;
const upd = (id, text, type = 'private') => ctx.doPost({ parameter: { key: 'k' }, postData: { contents: JSON.stringify({ update_id: id, message: { chat: { id: 111, type }, text } }) } });
upd(1, '/invoice\nKepada: Budi\nItem: Paket | 2,7jt | 1\nDiskon: 10%');
assert(sent.some(s => s.m === 'sendDocument' && /Total: <b>Rp 2.430.000/.test(s.p.caption)), '/invoice via chat (diskon 10%)');
upd(2, '/invoice\nKepada: Budi\nItem: Paket | abc | 1');
assert(sent.some(s => s.m === 'sendMessage' && /harga tidak terbaca/.test(s.p.text)), '/invoice error harga');
upd(3, '/receipt\nInvoice: INV-XX-1\nDibayarkan: 100');
assert(sent.some(s => s.m === 'sendMessage' && /tidak ditemukan/.test(s.p.text)), '/receipt invoice tidak ada');
upd(6, '/receipt INV-DG-' + no.split('-').slice(2).join('-') + '\nDibayarkan: 100');
assert(sent.some(s => s.m === 'sendMessage' && /sudah lunas/.test(s.p.text)), '/receipt invoice lunas ditolak');
sent.length = 0; upd(4, '/app');
assert(sent.some(s => /web_app/.test(s.p.reply_markup || '')), '/app kirim tombol web_app');
sent.length = 0; upd(5, '/app', 'group');
assert(sent.some(s => /chat pribadi/.test(s.p.text || '')), '/app di grup diarahkan ke chat pribadi');
sent.length = 0; ctx.setWebhook();
assert(sent.some(s => s.m === 'setChatMenuButton'), 'setWebhook memasang menu button');
r = JSON.parse(ctx.doPost({ parameter: {}, postData: { contents: 'bukan json' } }).t);
assert(!r.ok, 'body bukan JSON ditolak');

// kode produk: DG, CP, ADD + produk tambahan dari tab Produk
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Percetakan', kode: 'CP', items: [{ nama: 'Percetakan', harga: 1000000, qty: 1 }, { nama: 'Revisi Tambahan', harga: 500000, qty: 1 }] } });
assert(r.ok && /^INV-CP-\d{4}-\d{2}-001$/.test(r.invoice.noInvoice), 'kode CP -> ' + (r.invoice && r.invoice.noInvoice));
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'X', kode: 'QR', items: [{ nama: 'x', harga: 1, qty: 1 }] } });
assert(!r.ok && /DG \(Desain Grafis\), CP \(Percetakan\), ADD \(Tambahan\)/.test(r.error), 'kode QR ditolak: ' + r.error);
r = call({ action: 'bootstrap', initData: good });
assert(JSON.stringify(r.config.kodeList) === '["DG","CP","ADD"]' && r.config.produk.ADD === 'Tambahan', 'config Mini App berisi DG, CP, ADD');
sent.length = 0; upd(7, '/invoice\nKepada: Budi\nKode: XY\nItem: Paket | 100rb | 1');
assert(sent.some(s => s.m === 'sendMessage' && /tidak dikenal/.test(s.p.text)), '/invoice Kode: XY ditolak di chat');

// nama pembuat invoice & receipt
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Dina', items: [{ nama: 'Paket', harga: 1000000, qty: 1 }] } });
const noDina = r.invoice.noInvoice;
assert(r.ok && r.invoice.dibuatOleh === 'Rina' && r.invoice.dibuatPada, 'invoice Mini App mencatat pembuat: ' + r.invoice.dibuatOleh);
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: noDina, jumlah: 500000 } });
assert(r.ok && r.payment.dibuatOleh === 'Rina', 'receipt mencatat nama pencatat: ' + r.payment.dibuatOleh);
r = call({ action: 'bootstrap', initData: initData({ id: 222, first_name: 'Ana' }) });
assert(!r.ok && r.code === 'forbidden', 'Lite: orang selain pemilik ditolak walau ada di ALLOWED_CHAT_IDS');
sent.length = 0;
ctx.doPost({ parameter: { key: 'k' }, postData: { contents: JSON.stringify({ update_id: 50, message: { chat: { id: 111, type: 'private' }, from: { id: 111, first_name: 'Budi', username: 'budi' }, text: '/invoice\nKepada: X\nItem: A | 100rb | 1' } }) } });
assert(sheets.Invoice.rows[sheets.Invoice.rows.length - 1][15] === 'Budi', 'invoice via chat mencatat pembuat di kolom P');
sent.length = 0;
ctx.doPost({ parameter: { key: 'k' }, postData: { contents: JSON.stringify({ update_id: 51, message: { chat: { id: 111, type: 'private' }, from: { id: 111, username: 'budi' }, text: '/cek ' + noDina } }) } });
assert(sent.some(s => /Dibuat oleh: Rina/.test(s.p.text || '')), '/cek menampilkan pembuat');
// sheet lama (tanpa kolom Dibuat Oleh) mendapat judul kolom baru
sheets.Invoice.rows[0].length = 15; sheets.Pembayaran.rows[0].length = 12;
call({ action: 'bootstrap', initData: good }); call({ action: 'payments', initData: good, data: { noInvoice: noDina } });
assert(sheets.Invoice.rows[0][15] === 'Dibuat Oleh' && sheets.Pembayaran.rows[0][12] === 'Dibuat Oleh', 'judul kolom Dibuat Oleh ditambahkan ke sheet lama');

// chat
sent.length = 0;
const say = (id, text) => ctx.doPost({ parameter: { key: 'k' }, postData: { contents: JSON.stringify({ update_id: id, message: { chat: { id: 111, type: 'private' }, from: { id: 111, first_name: 'Budi' }, text } }) } });

// ---------------- bulan nomor invoice ikut Tgl invoice
const P = s => ctx.parseTanggal_(s);
assert(P('28 November 2026').ym === '2026-11' && P('28 Nov 2026').teks === '28 November 2026' && P('5/12/2026').teks === '5 Desember 2026' && P('2026-01-09').teks === '9 Januari 2026' && P('29 Februari 2028').ym === '2028-02', 'parseTanggal_ berbagai format');
assert(P('31 Februari 2026') === null && P('besok') === null && P('29 Februari 2027') === null && P('') === null && P('32/1/2026') === null, 'parseTanggal_ menolak tanggal tidak valid');
const it1 = [{ nama: 'Paket', harga: 1000000, qty: 1 }];
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Oktober A', items: it1, tglInvoice: '28 Oktober 2026' } });
assert(r.ok && r.invoice.noInvoice === 'INV-DG-2026-10-001' && r.invoice.tglInvoice === '28 Oktober 2026', 'Tgl invoice Oktober -> ' + (r.invoice && r.invoice.noInvoice));
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Oktober B', items: it1, tglInvoice: '2026-10-30' } });
assert(r.ok && r.invoice.noInvoice === 'INV-DG-2026-10-002', 'urut lanjut di bulan Oktober -> ' + (r.invoice && r.invoice.noInvoice));
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Des', kode: 'CP', items: it1, tglInvoice: '5/12/2026' } });
assert(r.ok && r.invoice.noInvoice === 'INV-CP-2026-12-001' && r.invoice.tglInvoice === '5 Desember 2026', 'format 5/12/2026 disimpan rapi -> ' + (r.invoice && r.invoice.noInvoice));
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'X', items: it1, tglInvoice: 'besok' } });
assert(!r.ok && /Tgl invoice "besok" tidak terbaca/.test(r.error), 'Tgl invoice tidak terbaca ditolak');
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Tanpa tgl', items: it1 } });
const thisYm = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
assert(r.ok && r.invoice.noInvoice.indexOf('INV-DG-' + thisYm + '-') === 0, 'tanpa Tgl invoice tetap pakai bulan ini');
sent.length = 0; say(70, '/invoice\nKepada: Lina\nTgl Invoice: 30 Sep 2026\nItem: Paket | 1jt | 1');
assert(sent.some(s => s.m === 'sendDocument' && /INV-DG-2026-09-001/.test(s.p.caption)), '/invoice via chat dengan Tgl Invoice September');
sent.length = 0; say(71, '/invoice\nKepada: Lina\nTgl Invoice: akhir bulan\nItem: Paket | 1jt | 1');
assert(sent.some(s => /tidak terbaca/.test(s.p.text || '')), '/invoice via chat dengan Tgl Invoice salah ditolak');


// ---------------- penomoran baru: 3 digit, NOMOR_AWAL, receipt RCP, revisi, produk
const it2 = [{ nama: 'Paket', harga: 1000000, qty: 1 }];
sheets.Invoice.rows.push(['INV-DG-2026-08-7', '1 Agustus 2026', 'Lama', '', '', '', '[]', 0, 0, 0, 0, 0, 'LUNAS']);
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Agustus', items: it2, tglInvoice: '20 Agustus 2026' } });
assert(r.ok && r.invoice.noInvoice === 'INV-DG-2026-08-008', 'nomor lama tanpa nol tetap dilanjutkan -> ' + (r.invoice && r.invoice.noInvoice));
ctx.CONFIG.NOMOR_AWAL['INV-CP-2026-07'] = 6;
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Juli 1', kode: 'CP', items: it2, tglInvoice: '3 Juli 2026' } });
const r2 = call({ action: 'invoice.create', initData: good, data: { kepada: 'Juli 2', kode: 'CP', items: it2, tglInvoice: '4 Juli 2026' } });
assert(r.invoice.noInvoice === 'INV-CP-2026-07-006' && r2.invoice.noInvoice === 'INV-CP-2026-07-007', 'NOMOR_AWAL dipakai lalu lanjut -> ' + r.invoice.noInvoice + ', ' + r2.invoice.noInvoice);
ctx.CONFIG.NOMOR_AWAL['INV-CP-2026-07'] = 3;
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Juli 3', kode: 'CP', items: it2, tglInvoice: '5 Juli 2026' } });
assert(r.invoice.noInvoice === 'INV-CP-2026-07-008', 'NOMOR_AWAL lebih kecil dari nomor yang ada diabaikan -> ' + r.invoice.noInvoice);

// receipt: kode ikut invoice, bulan = bulan dicatat, urutan per kode
const rcpYm = thisYm;
const noJuli = r.invoice.noInvoice;
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: noJuli, jumlah: 400000 } });
assert(r.ok && new RegExp('^RCP-CP-' + rcpYm + '-[0-9]{3}$').test(r.payment.noReceipt), 'receipt invoice CP Juli memakai RCP-CP bulan ini -> ' + (r.payment && r.payment.noReceipt));
const rcp1 = r.payment.noReceipt;
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: noJuli, jumlah: 100000 } });
const urut = s => parseInt(s.slice(-3), 10);
assert(urut(r.payment.noReceipt) === urut(rcp1) + 1 && r.payment.ke === 2, 'receipt berikutnya urut +1 -> ' + r.payment.noReceipt);
const lastPayRow = sheets.Pembayaran.rows[sheets.Pembayaran.rows.length - 1];
assert(lastPayRow[15] === r.payment.noReceipt && sheets.Pembayaran.rows[0][15] === 'No Receipt', 'No Receipt tersimpan di kolom P');
assert(sent.some(s => s.m === 'sendDocument' && s.p.document.name === 'Receipt ' + r.payment.noReceipt + ' - Juli 3.pdf' && /Untuk INV-CP-2026-07-008 \(pembayaran ke-2\)/.test(s.p.caption)), 'nama file & caption receipt memakai nomor RCP');
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'DG baru', items: it2 } });
const noDG = r.invoice.noInvoice;
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: noDG, jumlah: 500000 } });
assert(new RegExp('^RCP-DG-' + rcpYm + '-').test(r.payment.noReceipt), 'urutan RCP-DG terpisah dari RCP-CP -> ' + r.payment.noReceipt);
ctx.CONFIG.NOMOR_AWAL['RCP-ADD-' + rcpYm] = 4;
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'Addon', kode: 'ADD', items: it2 } });
assert(r.ok && /^INV-ADD-/.test(r.invoice.noInvoice), 'produk ADD bisa dipakai -> ' + r.invoice.noInvoice);
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: r.invoice.noInvoice, jumlah: 100000 } });
assert(r.payment.noReceipt === 'RCP-ADD-' + rcpYm + '-004', 'NOMOR_AWAL juga berlaku untuk receipt -> ' + r.payment.noReceipt);

// PDF
const h = ctx.buildReceiptHtml({ kepada: 'A', domisili: '', noInvoice: 'INV-DG-2026-11-001', tglInvoice: '', mempelai: '', tanggalAcara: '', items: [], subtotal: 0, diskon: 0, total: 0 },
  { noReceipt: 'RCP-DG-2026-11-012', ke: 2, jumlah: 1, totalDibayar: 1, sisa: 0, metode: 'QRIS', tglBayar: 'x', status: 'LUNAS' });
assert(/No\. Receipt/.test(h) && /RCP-DG-2026-11-012/.test(h) && /Pembayaran Ke/.test(h), 'PDF receipt mencetak No. Receipt & pembayaran ke');
const hi = ctx.buildInvoiceHtml({ kepada: 'A', domisili: '', noInvoice: 'INV-DG-2026-11-001', tglInvoice: '', mempelai: '', tanggalAcara: '', items: [], subtotal: 0, diskon: 0, total: 0, revisi: 2 });
assert(/INV-DG-2026-11-001 <span[^>]*>&middot; Revisi 2<\/span>/.test(hi), 'PDF invoice mencetak Revisi di samping nomor');


// chat: baris No: ditolak
sent.length = 0; say(80, '/invoice\nKepada: Manual\nNo: INV-DG-2026-11-099\nItem: Paket | 1jt | 1');
assert(sent.some(s => /nomor manual tidak dipakai/.test(s.p.text || '')) && !sent.some(s => s.m === 'sendDocument'), '/invoice dengan No: ditolak');


// ---------------- pengingat pelunasan per produk (DG: 14 hari sebelum acara)
const DAY = 864e5, now = Date.now();
const tglKe = d => ctx.tanggalIndo_(new Date(now + d * DAY));
assert(ctx.jadwalPelunasan_('INV-DG-2026-11-001', '22 Januari 2027') === 'Paling lambat 8 Januari 2027 (14 hari sebelum acara)'
  && ctx.jadwalPelunasan_('INV-DG-2026-11-001', '') === 'Paling lambat 14 hari sebelum acara'
  && ctx.jadwalPelunasan_('INV-CP-2026-11-001', '22 Januari 2027') === 'Dilakukan saat pesanan selesai'
  && ctx.jadwalPelunasan_('INV-ADD-2026-11-001', '22 Januari 2027') === '' && ctx.jadwalPelunasan_('INV-UD-2026-11-001', 'x') === '',
  'jadwal pelunasan: DG 14 hari sebelum acara, CP saat pesanan selesai, ADD & lainnya kosong');
assert(ctx.jadwalPelunasan_('INV-DG-2026-11-001', '1 Maret 2027') === 'Paling lambat 15 Februari 2027 (14 hari sebelum acara)', 'mundur 14 hari melewati batas bulan');
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'DG Pel', tanggalAcara: '22 Januari 2027', items: [{ nama: 'Paket', harga: 2000000, qty: 1 }] } });
const noDGp = r.invoice.noInvoice;
sent.length = 0;
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: noDGp, jumlah: 1000000 } });
assert(r.payment.pengingat === 'Pelunasan Rp 1.000.000 paling lambat 8 Januari 2027 (14 hari sebelum acara).', 'receipt DP DG: ' + r.payment.pengingat);
assert(sent.some(s => s.m === 'sendDocument' && s.p.caption.indexOf('⏰ Pelunasan Rp 1.000.000 paling lambat 8 Januari 2027') >= 0), 'pengingat juga di caption chat');
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: noDGp, jumlah: 400000 } });
assert(r.payment.pengingat === 'Pelunasan Rp 600.000 paling lambat 8 Januari 2027 (14 hari sebelum acara).', 'cicilan: tanggal sama, sisa terbaru: ' + r.payment.pengingat);
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: noDGp, jumlah: 600000 } });
assert(r.payment.status === 'LUNAS' && r.payment.pengingat === '', 'receipt lunas tanpa pengingat');
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'DG tanpa acara', items: [{ nama: 'Paket', harga: 2000000, qty: 1 }] } });
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: r.invoice.noInvoice, jumlah: 1000000 } });
assert(r.payment.pengingat === 'Pelunasan Rp 1.000.000 paling lambat 14 hari sebelum acara.', 'DG tanpa tanggal acara: ' + r.payment.pengingat);
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'CP Pel', kode: 'CP', tanggalAcara: '22 Januari 2027', items: [{ nama: 'Paket', harga: 2000000, qty: 1 }] } });
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: r.invoice.noInvoice, jumlah: 1000000 } });
assert(r.payment.pengingat === 'Pelunasan Rp 1.000.000 dilakukan saat pesanan selesai.', 'receipt DP CP: ' + r.payment.pengingat);
r = call({ action: 'invoice.create', initData: good, data: { kepada: 'ADD Pel', kode: 'ADD', tanggalAcara: '22 Januari 2027', items: [{ nama: 'Paket', harga: 2000000, qty: 1 }] } });
sent.length = 0;
r = call({ action: 'receipt.create', initData: good, data: { noInvoice: r.invoice.noInvoice, jumlah: 1000000 } });
assert(r.payment.pengingat === '' && !sent.some(s => /⏰/.test(s.p.caption || '')), 'receipt DP ADD tanpa pengingat');


// ---------------- webhook dijawab 200 (HtmlService), bukan redirect ContentService
const wres = ctx.doPost({ parameter: { key: 'k' }, postData: { contents: JSON.stringify({ update_id: 999, message: { chat: { id: 111, type: 'private' }, from: { id: 111, first_name: 'Budi' }, text: '/id' } }) } });
assert(wres && wres.html === 'ok', 'webhook Telegram dijawab lewat HtmlService (200 OK)');

// ---------------- Sheets mengubah "17 November 2026" jadi Date: harus dibaca kembali sebagai teks Indonesia
{
  const rd = call({ action: 'invoice.create', initData: good, data: { kode: 'DG', kepada: 'Tgl Date', tanggalAcara: '22 November 2026', items: [{ nama: 'Paket', harga: 2000000, qty: 1 }] } });
  const noD = rd.invoice.noInvoice;
  call({ action: 'receipt.create', initData: good, data: { noInvoice: noD, jumlah: 1000000, tglBayar: '17 November 2026' } });
  const jkt = (y, m, d) => new Date(Date.UTC(y, m - 1, d) - 7 * 3600e3); // tengah malam WIB
  sheets['Invoice'].rows.forEach(r => { if (r[0] === noD) { r[1] = jkt(2026, 11, 17); r[5] = jkt(2026, 11, 22); } });
  sheets['Pembayaran'].rows.forEach(r => { if (r[1] === noD) r[0] = jkt(2026, 11, 17); });
  const fd = ctx.findInvoice_(noD).inv;
  assert(fd.tglInvoice === '17 November 2026' && fd.tanggalAcara === '22 November 2026', 'tanggal Date dari Sheets dibaca sebagai teks Indonesia');
  assert(ctx.listPayments_(noD)[0].tglBayar === '17 November 2026', 'tanggal bayar Date dari Sheets dibaca sebagai teks');
  assert(/8 November 2026/.test(ctx.jadwalPelunasan_(noD, fd.tanggalAcara)), 'batas DG tetap terhitung dari tanggal acara bertipe Date');
  assert(ctx.teksTanggal_('') === '' && ctx.teksTanggal_(null) === '' && ctx.teksTanggal_('3 Desember 2026') === '3 Desember 2026', 'teks biasa tidak berubah');
}

// ---------------- kolom Item ringkas (G) + JSON di kolom T, baris lama tetap terbaca
{
  const ri = call({ action: 'invoice.create', initData: good, data: { kode: 'DG', kepada: 'Item Ringkas', tanggalAcara: '3 Desember 2026',
    items: [{ nama: 'Paket A', harga: 1000000, qty: 1 }, { nama: 'Revisi Tambahan', harga: 500000, qty: 2 }] } });
  const noI = ri.invoice.noInvoice;
  const row = sheets['Invoice'].rows.find(r => r[0] === noI);
  assert(row[6] === 'Paket A, Revisi Tambahan ×2', 'kolom Item berisi ringkasan yang mudah dibaca');
  assert(JSON.parse(row[19]).length === 2 && row.length === 20, 'data item lengkap tersimpan di kolom T');
  assert(ctx.findInvoice_(noI).inv.items[1].qty === 2, 'item dibaca dari kolom T');
  const lama = ['INV-DG-2026-10-001', '1 Oktober 2026', 'Lama', '', '', '', '[{"nama":"Paket Lama","harga":100,"qty":1}]', 100, 0, 100, 0, 100, 'BELUM BAYAR', '', '', '', '', '', ''];
  assert(ctx.rowToInvoice_(lama).items[0].nama === 'Paket Lama', 'baris lama dengan JSON di kolom G tetap terbaca');
  assert(ctx.bacaItems_('', 'Paket rusak').length === 0, 'teks biasa di kolom G tidak membuat error');
}

// ---------------------------------------------------------------- akses manual (Lite)
{
  sent.length = 0;
  ctx.handleUpdate_({ message: { chat: { id: 555, type: 'private' }, from: { id: 555, first_name: 'Baru' }, text: '/start' } });
  assert(sent.length === 1 && sent[0].p.chat_id === '555' && /hanya bisa dipakai pemiliknya/.test(sent[0].p.text) && /<code>555<\/code>/.test(sent[0].p.text),
    'orang lain mendapat pesan khusus pemilik + Chat ID-nya');
  assert(!/\/edit|\/batal|\/tagih|\/akses|\/pengingat/.test(ctx.helpText_(true)), 'daftar perintah Lite tanpa perintah versi lengkap');
  const rr = call({ action: 'bootstrap', initData: initData({ id: 444, first_name: 'Y' }) });
  assert(rr.code === 'forbidden' && /pemilik bot/.test(rr.error) && /444/.test(rr.error), 'Mini App menolak selain pemilik dan menampilkan Chat ID');
  delete props.OWNER_CHAT_ID;
  assert(!ctx.isAllowed_('111'), 'tanpa OWNER_CHAT_ID tidak ada yang bisa memakai bot');
  props.OWNER_CHAT_ID = '111';
}

// ---------------------------------------------------------------- kirim ulang PDF invoice dari Mini App
{
  const rr = call({ action: 'invoice.create', initData: good, data: { kode: 'DG', kepada: 'Kirim Ulang', tanggalAcara: '3 Desember 2026', items: [{ nama: 'Paket', harga: 2000000, qty: 1 }] } });
  const noK = rr.invoice.noInvoice;
  sent.length = 0;
  const r1 = call({ action: 'invoice.resend', initData: good, data: { noInvoice: noK } });
  const doc = sent.find(x => x.m === 'sendDocument');
  assert(r1.ok && doc && doc.p.chat_id === '111' && /Dikirim ulang dari Mini App/.test(doc.p.caption) && /Kirim Ulang\.pdf$/.test(doc.p.document.name),
    'invoice.resend mengirim ulang PDF invoice ke chat pengguna');
  assert(!call({ action: 'invoice.resend', initData: good, data: { noInvoice: 'INV-XX-1999-01-001' } }).ok, 'invoice.resend: nomor tidak ada ditolak');
}

// ---------------------------------------------------------------- requestId, pembayaran kembar, validasi server
{

  // Validasi total & harga di server.
  const v1 = call({ action: 'invoice.create', initData: good, data: { kode: 'DG', kepada: 'Nol', items: [{ nama: 'Paket', harga: 1000000, qty: 1 }], diskon: 1000000 } });
  assert(!v1.ok && /lebih dari Rp 0/.test(v1.error), 'server menolak invoice dengan total Rp 0');
  const v2 = call({ action: 'invoice.create', initData: good, data: { kode: 'DG', kepada: 'Nol', items: [{ nama: 'Gratis', harga: 0, qty: 1 }, { nama: 'Paket', harga: 100, qty: 1 }] } });
  assert(!v2.ok && /harga harus lebih dari Rp 0/.test(v2.error), 'server menolak item berharga Rp 0');

}

// ---------------------------------------------------------------- angka dengan sen, gagal kirim PDF
{
  const rp = s => ctx.parseRupiah_(s);
  assert(rp('2.700.000,00') === 2700000 && rp('1,350,000.00') === 1350000 && rp('2700000,00') === 2700000,
    'angka dengan sen (",00" / ".00") tidak terbaca 100 kali lipat');
  assert(rp('Rp 1.350.000,-') === 1350000 && rp('500.000-') === 500000, 'akhiran ",-" terbaca');
  assert(rp('2.700.000') === 2700000 && rp('2,50') === 250 && rp('1.500') === 1500 && rp('2,7jt') === 2700000 && isNaN(rp('-')),
    'bentuk angka lama tetap terbaca sama');

  // Telegram tidak menjawab (UrlFetchApp melempar error) setelah invoice tersimpan.
  const fetchAsli = ctx.UrlFetchApp.fetch;
  ctx.UrlFetchApp.fetch = (url, o) => {
    const m = url.split('/').pop(); sent.push({ m, p: o.payload });
    if (m === 'sendDocument') throw new Error('Timeout');
    return { getContentText: () => '{"ok":true}' };
  };
  const jumlahInv = () => sheets[ctx.CONFIG.SHEET_INVOICE].rows.length;
  const sebelum = jumlahInv();
  r = call({ action: 'invoice.create', initData: good, requestId: 'tg-gagal-1',
    data: { kepada: 'Tes Gagal Kirim', kode: 'DG', items: [{ nama: 'Paket', harga: 1000000, qty: 1 }] } });
  assert(r.ok && r.kirimGagal === true && jumlahInv() === sebelum + 1,
    'invoice.create: PDF gagal dikirim tetap dijawab ok (kirimGagal), jadi tidak ditawari simpan ulang');
  r = call({ action: 'invoice.resend', initData: good, data: { noInvoice: r.invoice.noInvoice } });
  assert(!r.ok && /gagal dikirim/.test(r.error), 'kirim ulang PDF yang gagal dilaporkan gagal');
  sent.length = 0;
  upd(950, '/invoice\nKepada: Tes Chat Gagal\nItem: Paket | 1jt | 1');
  assert(jumlahInv() === sebelum + 2 && sent.some(s => s.m === 'sendMessage' && /sudah tercatat/.test(s.p.text) && /Jangan kirim \/invoice lagi/.test(s.p.text)),
    '/invoice: PDF gagal dikirim -> diberi tahu invoice sudah tercatat');
  ctx.UrlFetchApp.fetch = (url, o) => { sent.push({ m: url.split('/').pop(), p: o.payload }); return { getContentText: () => '<html>502 Bad Gateway</html>' }; };
  assert(ctx.tg_('sendMessage', {}).ok === false, 'jawaban Telegram bukan JSON tidak melempar error');
  ctx.UrlFetchApp.fetch = fetchAsli;
}
