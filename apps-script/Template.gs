/**
 * Template HTML untuk invoice & receipt. HTML ini dikonversi ke PDF oleh Google.
 * Konverter PDF Google hanya mendukung CSS dasar, jadi layout memakai <table>
 * (tanpa flexbox/grid) dan gambar disisipkan sebagai data URI base64.
 *
 * Semua fungsi di file ini murni (tanpa layanan Apps Script), sehingga
 * bisa juga dijalankan di Node.js untuk preview.
 *
 * Warna aksen: CONFIG.WARNA_AKSEN (garis kop) dan CONFIG.WARNA_AKSEN_TEKS (teks berwarna, lebih gelap
 * agar mudah dibaca). Label istilah mengikuti CONFIG.LABEL (lihat label_ di Storage.gs).
 */

function warnaAksen_() { return CONFIG.WARNA_AKSEN || '#0E9F9E'; }
function warnaAksenTeks_() { return CONFIG.WARNA_AKSEN_TEKS || '#0B7D7C'; }

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 2700000 -> "2.700.000" */
function fmtNum_(n) {
  n = Math.round(Number(n) || 0);
  var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + s;
}

/** 2700000 -> "Rp 2.700.000" */
function fmtRp_(n) {
  return 'Rp ' + fmtNum_(n);
}

function docCss_() {
  return [
    '@page { size: A4; margin: 14mm 16mm; }',
    'body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0; }',
    'table { border-collapse: collapse; }',
    'td, th { vertical-align: top; padding: 0; }',
    '.title { font-size: 30pt; font-weight: bold; letter-spacing: 0.5px; color: #0F2E35; }',
    '.usaha { font-size: 15pt; font-weight: bold; color: ' + warnaAksenTeks_() + '; }',
    '.rule { border-bottom: 3px solid ' + warnaAksen_() + '; height: 1px; margin: 10px 0 18px 0; }',
    '.kaki { margin-top: 28px; font-size: 8pt; color: #8a949c; }',
    '.kv td { padding: 2px 0; }',
    '.kv td.l { width: 95px; }',
    '.kv td.c { width: 12px; }',
    '.items th { border: 1px solid #0F2E35; background: #0F2E35; color: #fff; font-weight: bold; text-align: center; padding: 4px 6px; font-size: 10.5pt; }',
    '.items td { border: 1px solid #c9d3d6; padding: 4px 6px; height: 14px; }',
    '.r { text-align: right; }',
    '.ctr { text-align: center; }',
    '.totals td { padding: 3px 0; }',
    '.grand td { font-weight: bold; font-size: 11.5pt; padding-top: 5px; color: ' + warnaAksenTeks_() + '; }',
    '.b { font-weight: bold; }',
    '.sp { height: 18px; }'
  ].join('\n');
}

function wrapHtml_(body) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + docCss_() +
    '</style></head><body>' + body +
    '<div class="kaki">Dibuat dengan Docket Lite</div>' +
    '</body></html>';
}

/** Header: judul besar di kiri, logo (atau nama usaha) di kanan, garis aksen di bawah. */
function headerHtml_(title) {
  var kanan;
  if (LOGO_BASE64) {
    var logoH = 40;
    var logoW = Math.round(LOGO_W * logoH / LOGO_H);
    kanan = '<img src="data:image/png;base64,' + LOGO_BASE64 + '" width="' + logoW + '" height="' + logoH + '">';
  } else {
    kanan = '<div class="usaha">' + esc_(CONFIG.NAMA_USAHA || '') + '</div>';
  }
  return '<table width="100%"><tr>' +
    '<td style="vertical-align: middle;"><div class="title">' + esc_(title) + '</div></td>' +
    '<td style="vertical-align: middle; text-align: right;">' + kanan +
    '</td></tr></table><div class="rule"></div>';
}

/** Tabel label : nilai. rows = [[label, nilaiHtml], ...] (nilai sudah di-escape). */
function kvHtml_(rows, labelWidth) {
  var lw = labelWidth ? ' style="width:' + labelWidth + 'px"' : '';
  return '<table class="kv">' + rows.map(function (r) {
    return '<tr><td class="l"' + lw + '>' + esc_(r[0]) + '</td><td class="c">:</td><td>' + r[1] + '</td></tr>';
  }).join('') + '</table>';
}

/** Blok info klien (Kepada/Domisili/Invoice/Tgl Invoice | proyek/Tanggal Acara). */
function infoHtml_(d) {
  var kiri = kvHtml_([
    ['Kepada', esc_(d.kepada)],
    ['Domisili', esc_(d.domisili)],
    ['Invoice', esc_(d.noInvoice) + (d.revisi
      ? ' <span style="color: #6e6e6e; font-size: 9pt;">&middot; Revisi ' + d.revisi + '</span>' : '')],
    ['Tgl Invoice', esc_(d.tglInvoice)]
  ], 85);
  var kanan = kvHtml_([
    [label_('proyekPanjang'), esc_(d.mempelai)],
    ['Tanggal Acara', esc_(d.tanggalAcara)]
  ], 118);
  return '<table width="100%"><tr><td width="54%">' + kiri + '</td><td>' + kanan + '</td></tr></table>';
}

/** Tabel item + subtotal/diskon/total. */
function itemsHtml_(d) {
  var rows = d.items.map(function (it, i) {
    return '<tr>' +
      '<td class="ctr">' + (i + 1) + '</td>' +
      '<td>' + esc_(it.nama) + '</td>' +
      '<td class="r">' + fmtNum_(it.harga) + '</td>' +
      '<td class="ctr">' + fmtNum_(it.qty) + '</td>' +
      '<td class="r">' + fmtNum_(it.harga * it.qty) + '</td>' +
      '</tr>';
  });
  var minRows = (typeof CONFIG !== 'undefined' && CONFIG.MIN_BARIS_ITEM) || 5;
  for (var k = rows.length; k < minRows; k++) {
    rows.push('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>');
  }
  var table = '<table class="items" width="100%">' +
    '<tr><th width="7%">No</th><th width="45%">Item</th><th width="17%">Harga</th>' +
    '<th width="12%">Jumlah</th><th width="19%">Total</th></tr>' +
    rows.join('') + '</table>';

  var totals = '<table width="100%" style="margin-top: 18px;"><tr><td width="62%"></td><td>' +
    '<table class="totals" width="100%">' +
    '<tr><td>Sub total</td><td class="r">' + fmtNum_(d.subtotal) + '</td></tr>' +
    '<tr><td>Diskon</td><td class="r">' + fmtNum_(d.diskon) + '</td></tr>' +
    '<tr class="grand"><td>TOTAL</td><td class="r">' + fmtNum_(d.total) + '</td></tr>' +
    '</table></td></tr></table>';
  return '<div style="margin-top: 22px;">' + table + '</div>' + totals;
}

/**
 * d = { kepada, domisili, noInvoice, tglInvoice, mempelai, tanggalAcara,
 *       items: [{nama, harga, qty}], subtotal, diskon, total, revisi? }
 */
function buildInvoiceHtml(d) {
  var dp = Math.round(d.total * CONFIG.DP_PERSEN / 100);
  var bayar = '<div class="b" style="margin-bottom: 6px;">Informasi pembayaran :</div>' +
    kvHtml_([
      ['Bank', esc_(CONFIG.BANK.nama)],
      ['No rekening', esc_(CONFIG.BANK.rekening)],
      ['Atas nama', esc_(CONFIG.BANK.atasNama)],
      ['Email', esc_(CONFIG.EMAIL)]
    ], 85);
  var catatan = '<div class="b" style="line-height: 1.7;">' +
    'Catatan Pembayaran:<br>' +
    label_('uangMuka') + ' (' + CONFIG.DP_PERSEN + '%): ' + fmtRp_(dp) + '<br>' +
    (jadwalPelunasan_(d.noInvoice, d.tanggalAcara) ? 'Pelunasan: ' + esc_(jadwalPelunasan_(d.noInvoice, d.tanggalAcara)) + '<br>' : '') +
    'Konfirmasi pembayaran: ' + esc_(CONFIG.WA) + ' (WA)</div>';

  return wrapHtml_(
    headerHtml_('INVOICE') +
    infoHtml_(d) +
    itemsHtml_(d) +
    '<div style="margin-top: 22px;">' + bayar + '</div>' +
    '<div class="sp"></div>' + catatan
  );
}

/**
 * d   = data invoice (sama seperti buildInvoiceHtml)
 * pay = { noReceipt, jumlah, totalDibayar, sisa, metode, tglBayar, status, ke }
 */
function buildReceiptHtml(d, pay) {
  var statusHtml = '<b>' + esc_(pay.status) + '</b> <img src="data:image/png;base64,' +
    CHECK_BASE64 + '" width="14" height="14" style="vertical-align: -2px;">';
  var rows = [];
  if (pay.noReceipt) rows.push(['No. Receipt', '<b>' + esc_(pay.noReceipt) + '</b>']);
  rows.push(['Pembayaran Ke', String(pay.ke)]);
  rows.push(['Total Invoice', fmtRp_(d.total)]);
  rows.push(['Jumlah Dibayarkan', fmtRp_(pay.jumlah)]);
  if (pay.ke > 1) rows.push(['Total Sudah Dibayar', fmtRp_(pay.totalDibayar)]);
  rows.push(['Metode', esc_(pay.metode)]);
  rows.push(['Tanggal Bayar', esc_(pay.tglBayar)]);
  rows.push(['Status', statusHtml]);

  var sisaHtml = '<div class="b" style="margin-bottom: 6px;">Sisa Pembayaran:</div>' +
    kvHtml_([['Sisa Pelunasan', fmtRp_(Math.max(pay.sisa, 0))]], 125) +
    '<div style="margin-top: 4px;">' +
    esc_(pay.sisa > 0 ? (pay.pengingat || '') : CONFIG.CATATAN_RECEIPT_LUNAS) + '</div>';

  return wrapHtml_(
    headerHtml_('PAYMENT RECEIPT') +
    infoHtml_(d) +
    itemsHtml_(d) +
    '<div style="margin-top: 14px;">' + kvHtml_(rows, 125) + '</div>' +
    '<div class="sp"></div>' + sisaHtml
  );
}

