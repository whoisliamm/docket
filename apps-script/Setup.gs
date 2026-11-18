/**
 * Fungsi yang dijalankan manual dari editor Apps Script (pilih nama fungsi, klik Run).
 *   1. setup()        -> sekali di awal: buat tab log, folder Drive, kunci webhook
 *   2. setWebhook()   -> setelah Deploy sebagai Web app (dan setiap kali URL deploy berubah)
 *   3. testPdf()      -> opsional: buat contoh invoice & receipt di Drive untuk dicek tampilannya
 *   4. webhookInfo()  -> opsional: cek status webhook bila bot tidak merespons
 *   5. setMiniAppButton() -> setelah MINIAPP_URL diisi / diubah: pasang tombol menu Mini App
 */

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BOT_TOKEN')) {
    throw new Error('Isi BOT_TOKEN dulu di Project Settings > Script Properties.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script ini harus dibuat dari Google Sheets (Extensions > Apps Script).');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  invoiceSheet_();
  paymentSheet_();
  riwayatSheet_();
  produkSheet_();
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);

  if (!props.getProperty('RECEIPT_FOLDER_ID')) {
    var folder = DriveApp.createFolder((CONFIG.NAMA_USAHA || 'Invoice') + ' - Receipt');
    props.setProperty('RECEIPT_FOLDER_ID', folder.getId());
  }
  if (!props.getProperty('WEBHOOK_KEY')) {
    props.setProperty('WEBHOOK_KEY', Utilities.getUuid().replace(/-/g, ''));
  }

  var folderUrl = DriveApp.getFolderById(props.getProperty('RECEIPT_FOLDER_ID')).getUrl();
  Logger.log('Setup selesai.\nSpreadsheet: ' + ss.getUrl() + '\nFolder receipt: ' + folderUrl);
}

function setWebhook() {
  var url = prop_('WEBAPP_URL');
  if (!url) throw new Error('Isi WEBAPP_URL di Script Properties dengan URL Web app (akhiran /exec).');
  if (!/\/exec$/.test(url)) throw new Error('WEBAPP_URL harus berakhiran /exec, bukan /dev.');
  var res = tg_('setWebhook', {
    url: url + '?key=' + prop_('WEBHOOK_KEY'),
    drop_pending_updates: 'true',
    allowed_updates: JSON.stringify(['message', 'callback_query'])
  });
  tg_('setMyCommands', {
    commands: JSON.stringify([
      { command: 'invoice', description: 'Buat invoice baru' },
      { command: 'receipt', description: 'Buat receipt pembayaran' },
      { command: 'cek', description: 'Cek invoice yang belum lunas' },
      { command: 'edit', description: 'Ubah invoice yang belum dibayar' },
      { command: 'batal', description: 'Batalkan invoice yang belum dibayar' },
      { command: 'batalbayar', description: 'Batalkan pembayaran terakhir' },
      { command: 'tagih', description: 'Kirim tagihan pelunasan setelah DP' },
      { command: 'app', description: 'Buka Mini App' },
      { command: 'id', description: 'Lihat Chat ID' }
    ])
  });
  Logger.log(JSON.stringify(res));
  setMiniAppButton();
}

/** Pasang tombol menu "Buka App" di chat bot. Butuh Script Property MINIAPP_URL (https). */
function setMiniAppButton() {
  var url = prop_('MINIAPP_URL');
  if (!url) {
    Logger.log('MINIAPP_URL belum diisi, tombol Mini App dilewati.');
    return;
  }
  if (!/^https:\/\//.test(url)) throw new Error('MINIAPP_URL harus diawali https://');
  var res = tg_('setChatMenuButton', {
    menu_button: JSON.stringify({ type: 'web_app', text: 'Buka App', web_app: { url: url } })
  });
  Logger.log('Tombol Mini App: ' + JSON.stringify(res));
}


function webhookInfo() {
  Logger.log(JSON.stringify(tg_('getWebhookInfo', {}), null, 2));
}

/** Membuat contoh PDF di folder receipt/_contoh tanpa mengubah log. */
function testPdf() {
  var inv = {
    noInvoice: 'INV-DG-2026-11-000', tglInvoice: tanggalIndo_(new Date()),
    kepada: 'Contoh Klien', domisili: 'Jakarta', mempelai: 'Nama proyek',
    tanggalAcara: '22 Januari 2027',
    items: [{ nama: ((CONFIG.PAKET || [])[0] || {}).nama || 'Paket', harga: 2700000, qty: 1 }],
    subtotal: 2700000, diskon: 0, total: 2700000
  };
  var pay = {
    noReceipt: 'RCP-DG-2026-11-000', jumlah: 1350000, totalDibayar: 1350000, sisa: 1350000, ke: 1,
    metode: 'Transfer BCA', tglBayar: tanggalIndo_(new Date()), status: 'DP DITERIMA'
  };
  var root = DriveApp.getFolderById(prop_('RECEIPT_FOLDER_ID'));
  var it = root.getFoldersByName('_contoh');
  var folder = it.hasNext() ? it.next() : root.createFolder('_contoh');
  var a = folder.createFile(invoicePdf_(inv, 'Contoh Invoice.pdf'));
  var b = folder.createFile(receiptPdf_(inv, pay, 'Contoh Receipt.pdf'));
  Logger.log('Contoh invoice: ' + a.getUrl() + '\nContoh receipt: ' + b.getUrl());
}

// ---------------------------------------------------------------- tampilan Google Sheets

/**
 * Merapikan tampilan keempat tab (Invoice, Pembayaran, Riwayat, Produk): judul kolom biru,
 * baris selang-seling, lebar kolom, format Rupiah, warna status, dan filter.
 * Hanya mengubah tampilan; isi data tidak disentuh. Aman dijalankan berkali-kali.
 */
function rapikanSheet() {
  var S = [
    { sh: invoiceSheet_(), judul: INVOICE_HEADERS, tab: '#36709b', teks: INVOICE_TEXT_COLS, status: 13,
      lebar: [165, 130, 160, 120, 170, 130, 240, 115, 105, 115, 115, 115, 150, 150, 100, 120, 150, 120, 220, 200],
      uang: [8, 9, 10, 11, 12], bungkus: [7, 19], sembunyi: [15, INVOICE_COL_ITEMS_JSON], teksLain: [INVOICE_COL_ITEMS_JSON] },
    { sh: paymentSheet_(), judul: PAY_HEADERS, tab: '#4997D0', teks: 4, status: 9,
      lebar: [130, 165, 110, 160, 115, 120, 120, 115, 175, 110, 150, 100, 120, 150, 130, 165],
      uang: [5, 7, 8], tengah: [3], klip: [10], sembunyi: [12] },
    { sh: riwayatSheet_(), judul: RIWAYAT_HEADERS, tab: '#8a96a3', teks: 6, aksi: 2,
      lebar: [150, 175, 165, 110, 380, 170, 200, 200],
      klip: [7, 8], bungkus: [5, 6] },
    { sh: produkSheet_(), judul: PRODUK_HEADERS, tab: '#b7c9d9', teks: 2,
      lebar: [80, 220, 150, 130] }
  ];
  S.forEach(rapikanTab_);
  Logger.log('Tampilan Sheets sudah dirapikan.');
}

var WARNA_SHEET = {
  judul: '#36709b', judulTeks: '#ffffff', selang: '#f4f8fb', teks: '#1f2933', redup: '#66727f',
  status: {
    'LUNAS': ['#e3f2e7', '#1e6b34'],
    'DP DITERIMA': ['#e6f0f8', '#2c5f86'],
    'PEMBAYARAN DITERIMA': ['#e0f4ec', '#0f6b4b'],
    'BELUM BAYAR': ['#fff3d6', '#7a4f00'],
    'DIBATALKAN': ['#fbe9e7', '#a3261b']
  }
};

function rapikanTab_(o) {
  var sh = o.sh, n = sh.getLastColumn() || o.lebar.length;
  n = Math.max(n, o.lebar.length);
  var baris = sh.getMaxRows(), isi = baris - 1;
  var W = WARNA_SHEET;

  sh.setTabColor(o.tab);
  sh.setFrozenRows(1);
  sh.setHiddenGridlines(true);

  // Seluruh tabel: huruf 10, rata tengah vertikal, warna teks gelap.
  sh.getRange(1, 1, baris, n).setFontSize(10).setFontColor(W.teks).setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  // Judul kolom (ditulis ulang sesuai versi terbaru, mis. "Items (JSON)" -> "Item").
  if (o.judul) sh.getRange(1, 1, 1, o.judul.length).setValues([o.judul]);
  sh.getRange(1, 1, 1, n).setBackground(W.judul).setFontColor(W.judulTeks).setFontWeight('bold')
    .setHorizontalAlignment('left');
  sh.setRowHeight(1, 34);

  // Baris selang-seling (banding lama dihapus dulu supaya tidak bentrok).
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange(1, 1, baris, n).applyRowBanding()
    .setHeaderRowColor(W.judul).setFirstRowColor('#ffffff').setSecondRowColor(W.selang);

  // Lebar kolom.
  o.lebar.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  // Kolom teks tetap teks (mencegah "17 November 2026" diubah jadi tanggal oleh Sheets).
  if (o.teks) sh.getRange(2, 1, isi, o.teks).setNumberFormat('@');
  (o.teksLain || []).forEach(function (c) { sh.getRange(2, c, isi, 1).setNumberFormat('@'); });
  (o.uang || []).forEach(function (c) {
    sh.getRange(2, c, isi, 1).setNumberFormat('"Rp "#,##0').setHorizontalAlignment('right');
    sh.getRange(1, c).setHorizontalAlignment('right');
  });
  (o.tengah || []).forEach(function (c) { sh.getRange(1, c, baris, 1).setHorizontalAlignment('center'); });
  (o.klip || []).forEach(function (c) { sh.getRange(2, c, isi, 1).setFontColor(W.redup).setFontSize(9); });
  (o.bungkus || []).forEach(function (c) {
    sh.getRange(2, c, isi, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  });

  // Warna status dan baris yang dibatalkan.
  var aturan = [];
  if (o.status) {
    var col = colLetter_(o.status);
    var lain = [];
    if (o.status > 1) lain.push(sh.getRange(2, 1, isi, o.status - 1));
    if (o.status < n) lain.push(sh.getRange(2, o.status + 1, isi, n - o.status));
    aturan.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + col + '2="DIBATALKAN"').setFontColor(W.redup).setRanges(lain).build());
    var rs = sh.getRange(2, o.status, isi, 1);
    Object.keys(W.status).forEach(function (k) {
      aturan.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k)
        .setBackground(W.status[k][0]).setFontColor(W.status[k][1]).setBold(true).setRanges([rs]).build());
    });
    sh.getRange(1, o.status, baris, 1).setHorizontalAlignment('center');
  }
  if (o.aksi) {
    var ra = sh.getRange(2, o.aksi, isi, 1);
    [['DIBATALKAN', W.status.DIBATALKAN], ['DIEDIT', W.status['BELUM BAYAR']], ['DITAMBAH', W.status['DP DITERIMA']],
      ['DIIZINKAN', W.status.LUNAS]]
      .forEach(function (x) {
        aturan.push(SpreadsheetApp.newConditionalFormatRule().whenTextContains(x[0])
          .setBackground(x[1][0]).setFontColor(x[1][1]).setBold(true).setRanges([ra]).build());
      });
  }
  sh.setConditionalFormatRules(aturan);

  // Kolom teknis (Chat ID, data JSON) disembunyikan; buka lewat klik kanan > Unhide kalau perlu.
  (o.sembunyi || []).forEach(function (c) { sh.hideColumns(c); });

  // Tombol filter di judul kolom untuk audit (filter lama diganti).
  var f = sh.getFilter();
  if (f) f.remove();
  sh.getRange(1, 1, baris, n).createFilter();
}

function colLetter_(c) {
  var s = '';
  while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}

