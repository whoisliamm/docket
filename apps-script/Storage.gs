/**
 * Penyimpanan: log di Google Sheets dan file receipt di Google Drive.
 */

var INVOICE_HEADERS = ['No Invoice', 'Tgl Invoice', 'Kepada', 'Domisili', 'Proyek',
  'Tanggal Acara', 'Item', 'Subtotal', 'Diskon', 'Total', 'Dibayar', 'Sisa',
  'Status', 'Dibuat', 'Chat ID', 'Dibuat Oleh', 'Diubah', 'Diubah Oleh', 'Catatan', 'Items (JSON)'];
// Kolom G berisi ringkasan item yang mudah dibaca; data lengkapnya (JSON) di kolom T yang disembunyikan.
var INVOICE_COL_ITEMS_JSON = 20;
var INVOICE_TEXT_COLS = 7; // kolom A-G disimpan sebagai teks agar tanggal tidak diubah Sheets

// "No Receipt" sengaja di kolom terakhir (P) supaya sheet lama tidak bergeser.
var PAY_HEADERS = ['Tgl Bayar', 'No Invoice', 'Pembayaran Ke', 'Kepada', 'Jumlah', 'Metode',
  'Total Dibayar', 'Sisa', 'Status', 'Link PDF', 'Dibuat', 'Chat ID', 'Dibuat Oleh', 'Dibatalkan', 'Dibatalkan Oleh',
  'No Receipt'];
var PAY_COL_NO_RECEIPT = 16;

var PRODUK_HEADERS = ['Kode', 'Nama', 'Ditambah', 'Ditambah Oleh'];

/**
 * Label yang tampil di bot, PDF, Mini App, dan Sheets. Bisa diganti lewat CONFIG.LABEL, misalnya
 * { proyek: 'Proyek', proyekPanjang: 'Proyek', uangMuka: 'Uang muka' }.
 */
function label_(k) {
  var bawaan = { proyek: 'Proyek', proyekPanjang: 'Proyek', uangMuka: 'Uang muka', contohProyek: 'Nama proyek' };
  return (CONFIG.LABEL && CONFIG.LABEL[k]) || bawaan[k] || k;
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function ss_() {
  var id = prop_('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID belum diisi. Jalankan fungsi setup() dulu.');
  return SpreadsheetApp.openById(id);
}

function getSheet_(name, headers, textCols) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (textCols) sh.getRange(1, 1, sh.getMaxRows(), textCols).setNumberFormat('@');
  } else {
    // Sheet lama: isi judul kolom yang belum ada (mis. "Dibuat Oleh") tanpa menyentuh data.
    var head = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (String(head[i]) === '') sh.getRange(1, i + 1).setValue(headers[i]).setFontWeight('bold');
    }
  }
  return sh;
}

var TZ_SHEET_ = null;

/** Zona waktu spreadsheet (File > Settings). Kalau tidak terbaca, dianggap sama dengan CONFIG.TZ. */
function tzSheet_() {
  if (TZ_SHEET_ === null) {
    try { TZ_SHEET_ = ss_().getSpreadsheetTimeZone() || CONFIG.TZ; } catch (e) { TZ_SHEET_ = CONFIG.TZ; }
  }
  return TZ_SHEET_;
}

/**
 * Sel yang diubah Sheets menjadi Date. Waktu yang kita tulis ("2026-11-18 10:00:00", jam CONFIG.TZ) dibaca
 * Sheets menurut zona waktu spreadsheet. Kalau zonanya beda (mis. Asia/Makassar), jamnya bergeser; kembalikan
 * ke jam yang sama dalam CONFIG.TZ. Nilai lain dikembalikan apa adanya.
 */
function dariSel_(v) {
  if (!(v instanceof Date) || isNaN(v.getTime())) return v;
  var tz = tzSheet_();
  if (tz === CONFIG.TZ) return v;
  var f = 'yyyy-MM-dd HH:mm:ss';
  try { return Utilities.parseDate(Utilities.formatDate(v, tz, f), CONFIG.TZ, f); } catch (e) { return v; }
}

/** Nilai sel "Dibuat"/"Dibatalkan" -> "16 November 2026 15:20". */
function fmtSel_(v) {
  return fmtDibuat_(dariSel_(v));
}

/** Nilai kolom "Dibuat" -> waktu (ms), 0 kalau tidak terbaca. */
function tsDibuat_(v) {
  v = dariSel_(v);
  if (v instanceof Date) return v.getTime();
  var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : 0;
}

function fmtDibuat_(v) {
  if (v instanceof Date) return tanggalIndo_(v) + ' ' + Utilities.formatDate(v, CONFIG.TZ, 'HH:mm');
  return String(v == null ? '' : v);
}

var RIWAYAT_HEADERS = ['Waktu', 'Aksi', 'No Invoice', 'Oleh', 'Perubahan', 'Alasan',
  'Data Lama (JSON)', 'Data Baru (JSON)'];

function invoiceSheet_() {
  INVOICE_HEADERS[4] = label_('proyek'); // judul kolom E mengikuti CONFIG.LABEL
  return getSheet_(CONFIG.SHEET_INVOICE, INVOICE_HEADERS, INVOICE_TEXT_COLS);
}
function paymentSheet_() { return getSheet_(CONFIG.SHEET_PEMBAYARAN, PAY_HEADERS, 4); }
function riwayatSheet_() { return getSheet_(CONFIG.SHEET_RIWAYAT || 'Riwayat', RIWAYAT_HEADERS, 6); }
function produkSheet_() { return getSheet_(CONFIG.SHEET_PRODUK || 'Produk', PRODUK_HEADERS, 2); }


// ---------------------------------------------------------------- produk

/** Produk tambahan dari tab Produk -> [{kode, nama}] */
function extraProduk_() {
  var sh = produkSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 2).getValues()
    .map(function (r) { return { kode: String(r[0]).trim().toUpperCase(), nama: String(r[1]).trim() }; })
    .filter(function (p) { return p.kode && !CONFIG.PRODUK[p.kode]; });
}

/** Semua produk: dari Config lalu dari tab Produk -> { KODE: 'Nama produk', ... } */
function produk_() {
  var out = {};
  Object.keys(CONFIG.PRODUK).forEach(function (k) { out[k] = CONFIG.PRODUK[k]; });
  extraProduk_().forEach(function (p) { out[p.kode] = p.nama; });
  return out;
}

/** Urutan pilihan produk di Mini App. */
function kodeList_() {
  var list = (CONFIG.KODE_LIST || Object.keys(CONFIG.PRODUK)).slice();
  Object.keys(CONFIG.PRODUK).forEach(function (k) { if (list.indexOf(k) < 0) list.push(k); });
  extraProduk_().forEach(function (p) { if (list.indexOf(p.kode) < 0) list.push(p.kode); });
  return list;
}


// ---------------------------------------------------------------- nomor otomatis

/** 4 -> "004" (minimal 3 digit). */
function padUrut_(n) {
  var s = String(n);
  while (s.length < 3) s = '0' + s;
  return s;
}

/**
 * Nomor berikutnya untuk prefix "INV-JSA-2026-11-" dari daftar nomor yang sudah ada.
 * Nomor lama tanpa nol ("-4") dan baru ("-004") sama-sama terbaca. NOMOR_AWAL di Config
 * menentukan nomor pertama yang boleh dipakai (untuk melanjutkan nomor dari luar bot).
 */
function nextNumber_(prefix, existing) {
  var max = 0;
  existing.forEach(function (v) {
    var no = String(v).trim().toUpperCase();
    if (no.indexOf(prefix) === 0) {
      var n = parseInt(no.slice(prefix.length), 10);
      if (n > max) max = n;
    }
  });
  var awal = (CONFIG.NOMOR_AWAL || {})[prefix.replace(/-$/, '')];
  if (awal && awal - 1 > max) max = awal - 1;
  return prefix + padUrut_(max + 1);
}

/** Kode produk dari nomor invoice: "INV-PRD-2026-11-002" -> "PRD". */
function kodeDariNo_(noInvoice) {
  var m = String(noInvoice || '').toUpperCase().match(/^INV-([A-Z0-9]+)-\d{4}-\d{2}-/);
  return m ? m[1] : CONFIG.KODE_DEFAULT;
}

/** RCP-<KODE>-<TAHUN>-<BULAN dicatat>-<URUT>, urutan sendiri per kode per bulan. */
function nextReceiptNo_(kode) {
  var prefix = 'RCP-' + kode + '-' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM') + '-';
  var sh = paymentSheet_();
  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, PAY_COL_NO_RECEIPT, last - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  return nextNumber_(prefix, existing);
}

/**
 * Tambah satu baris di tab Riwayat.
 * aksi: INVOICE DIEDIT | INVOICE DIBATALKAN | PEMBAYARAN DIBATALKAN
 */
function logRiwayat_(aksi, noInvoice, oleh, perubahan, alasan, lama, baru) {
  // Perubahan utamanya sudah tersimpan; gagal mencatat riwayat tidak boleh membatalkannya.
  try {
    riwayatSheet_().appendRow([
      now_(), aksi, noInvoice, String(oleh || ''), perubahan || '', alasan || '',
      lama ? JSON.stringify(lama) : '', baru ? JSON.stringify(baru) : ''
    ]);
  } catch (err) {
    console.error('Gagal mencatat riwayat: ' + err);
  }
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss');
}

/** Date -> "16 November 2026" (zona waktu Jakarta). */
function tanggalIndo_(date) {
  var p = Utilities.formatDate(date || new Date(), CONFIG.TZ, 'd-M-yyyy').split('-');
  return p[0] + ' ' + BULAN_ID[Number(p[1]) - 1] + ' ' + p[2];
}

/**
 * Isi sel tanggal sebagai teks. Sheets otomatis mengubah teks seperti "17 November 2026"
 * (nama bulan yang sama dengan bahasa Inggris) menjadi Date; kembalikan ke "17 November 2026".
 */
function teksTanggal_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : tanggalIndo_(dariSel_(v));
  return String(v == null ? '' : v);
}

/**
 * INV-<KODE>-<TAHUN>-<BULAN>-<URUT 3 digit>, urutan dilanjutkan dari nomor terbesar bulan itu.
 * ym = "2026-11" dari Tgl invoice; kosong = bulan hari ini.
 */
function nextInvoiceNo_(kode, ym) {
  var prefix = 'INV-' + kode + '-' + (ym || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM')) + '-';
  var sh = invoiceSheet_();
  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  return nextNumber_(prefix, existing);
}

function rowToInvoice_(r) {
  return {
    noInvoice: String(r[0]), tglInvoice: teksTanggal_(r[1]), kepada: String(r[2]),
    domisili: String(r[3]), mempelai: String(r[4]), tanggalAcara: teksTanggal_(r[5]),
    items: bacaItems_(r[19], r[6]),
    subtotal: Number(r[7]) || 0, diskon: Number(r[8]) || 0, total: Number(r[9]) || 0,
    dibayar: Number(r[10]) || 0, sisa: Number(r[11]) || 0, status: String(r[12]),
    dibuatPada: fmtSel_(r[13]), dibuatOleh: String(r[15] || ''),
    diubahPada: fmtSel_(r[16]), diubahOleh: String(r[17] || ''), catatan: String(r[18] || ''),
    revisi: Number((String(r[18] || '').match(/^Revisi (\d+)/) || [])[1]) || 0
  };
}

/** "Paket A, Paket B ×2" untuk kolom Item. */
function ringkasItem_(items) {
  return (items || []).map(function (it) {
    var q = Number(it.qty) || 1;
    return String(it.nama || '') + (q > 1 ? ' ×' + q : '');
  }).join(', ');
}

/** Item dari kolom T (JSON). Baris lama yang menyimpan JSON di kolom G tetap terbaca. */
function bacaItems_(json, lama) {
  var s = String(json || '').trim();
  if (!s && String(lama || '').trim().charAt(0) === '[') s = String(lama).trim();
  try { return s ? JSON.parse(s) : []; } catch (e) { return []; }
}


/** Cari invoice berdasarkan nomor (tidak peka huruf besar/kecil). -> {row, inv} | null */
function findInvoice_(no) {
  var target = String(no).trim().toUpperCase();
  var sh = invoiceSheet_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  var data = sh.getRange(2, 1, last - 1, INVOICE_HEADERS.length).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0]).trim().toUpperCase() === target) {
      return { row: i + 2, inv: rowToInvoice_(data[i]) };
    }
  }
  return null;
}

function listInvoices_() {
  var sh = invoiceSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, INVOICE_HEADERS.length).getValues().map(rowToInvoice_);
}

function saveInvoice_(inv, chatId) {
  invoiceSheet_().appendRow([
    inv.noInvoice, inv.tglInvoice, inv.kepada, inv.domisili, inv.mempelai, inv.tanggalAcara,
    ringkasItem_(inv.items), inv.subtotal, inv.diskon, inv.total,
    0, inv.total, 'BELUM BAYAR', now_(), String(chatId), inv.dibuatOleh || '',
    '', '', '', JSON.stringify(inv.items)
  ]);
}

/** Perbarui kolom Dibayar, Sisa, Status di baris invoice. */
function updateInvoicePayment_(row, dibayar, sisa, status) {
  invoiceSheet_().getRange(row, 11, 1, 3).setValues([[dibayar, sisa, status]]);
}

function countPayments_(noInvoice) {
  var sh = paymentSheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var target = String(noInvoice).toUpperCase();
  return sh.getRange(2, 2, last - 1, 1).getValues().filter(function (r) {
    return String(r[0]).toUpperCase() === target;
  }).length;
}

function savePayment_(p, chatId) {
  paymentSheet_().appendRow([
    p.tglBayar, p.noInvoice, p.ke, p.kepada, p.jumlah, p.metode,
    p.totalDibayar, p.sisa, p.status, p.url, now_(), String(chatId), p.dibuatOleh || '',
    '', '', p.noReceipt || ''
  ]);
}

/** Simpan PDF ke folder receipt (subfolder per bulan bila diaktifkan). -> File */
function saveReceiptToDrive_(blob) {
  var folderId = prop_('RECEIPT_FOLDER_ID');
  if (!folderId) throw new Error('RECEIPT_FOLDER_ID belum diisi. Jalankan fungsi setup() dulu.');
  var folder = DriveApp.getFolderById(folderId);
  if (CONFIG.SUBFOLDER_PER_BULAN) {
    var name = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM');
    var it = folder.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : folder.createFolder(name);
  }
  return folder.createFile(blob);
}

/** Nama produk untuk judul PDF, dari kode di nomor invoice ("INV-PRD-..." -> nama produk PRD). */
function produkNama_(noInvoice) {
  try { return produk_()[kodeDariNo_(noInvoice)] || ''; } catch (e) { return CONFIG.PRODUK[kodeDariNo_(noInvoice)] || ''; }
}

/** PDF invoice & receipt dari template HTML (Template.gs). */
function invoicePdf_(inv, filename) {
  return htmlToPdf_(buildInvoiceHtml(inv), filename);
}

function receiptPdf_(inv, pay, filename) {
  return htmlToPdf_(buildReceiptHtml(inv, pay), filename);
}

function htmlToPdf_(html, filename) {
  return Utilities.newBlob(html, 'text/html', 'doc.html').getAs('application/pdf').setName(filename);
}

function safeName_(s) {
  return String(s).replace(/[\\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Semua pembayaran untuk satu invoice, urut dari yang pertama. */
function listPayments_(noInvoice) {
  var sh = paymentSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var target = String(noInvoice).trim().toUpperCase();
  return sh.getRange(2, 1, last - 1, PAY_HEADERS.length).getValues()
    .map(function (r, i) {
      return {
        row: i + 2, noInvoice: String(r[1]),
        tglBayar: teksTanggal_(r[0]), ke: Number(r[2]) || 0, jumlah: Number(r[4]) || 0,
        metode: String(r[5]), totalDibayar: Number(r[6]) || 0, sisa: Number(r[7]) || 0,
        status: String(r[8]), url: String(r[9]),
        dibuatPada: fmtSel_(r[10]), dibuatTs: tsDibuat_(r[10]), dibuatOleh: String(r[12] || ''),
        dibatalkanPada: fmtSel_(r[13]), dibatalkanOleh: String(r[14] || ''),
        noReceipt: String(r[15] || '')
      };
    })
    .filter(function (p) { return p.noInvoice.toUpperCase() === target; });
}
