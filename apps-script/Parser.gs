/**
 * Membaca pesan berformat "Label: nilai" per baris.
 * Baris "Item: nama | harga | jumlah" boleh lebih dari satu.
 */

var FIELD_ALIASES = {
  kepada: ['kepada', 'nama', 'klien', 'client'],
  domisili: ['domisili', 'kota', 'alamat'],
  mempelai: ['proyek', 'mempelai', 'namamempelai', 'pengantin'],
  tanggalAcara: ['tanggalacara', 'tglacara', 'acara'],
  kode: ['kode', 'kodeproduk'],
  diskon: ['diskon', 'potongan', 'discount'],
  noInvoice: ['invoice', 'noinvoice', 'nomorinvoice', 'no', 'nomor'],
  tglInvoice: ['tglinvoice', 'tanggalinvoice'],
  jumlah: ['dibayarkan', 'jumlahdibayarkan', 'jumlah', 'bayar', 'nominal', 'dp'],
  metode: ['metode', 'via', 'metodebayar'],
  tglBayar: ['tanggal', 'tglbayar', 'tanggalbayar'],
  alasan: ['alasan', 'catatan', 'keterangan']
};

function parseFields_(body) {
  var raw = {}, items = [];
  String(body).split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^\s*[-•*]?\s*([^:]+?)\s*:\s*(.*)$/);
    if (!m) return;
    var key = m[1].toLowerCase().replace(/[^a-z]/g, '');
    var val = m[2].trim();
    if (key === 'item' || key === 'items') {
      if (val) items.push(val);
    } else {
      raw[key] = val;
    }
  });
  var fields = {};
  Object.keys(FIELD_ALIASES).forEach(function (name) {
    var aliases = FIELD_ALIASES[name];
    for (var i = 0; i < aliases.length; i++) {
      if (raw[aliases[i]]) { fields[name] = raw[aliases[i]]; break; }
    }
  });
  return { fields: fields, items: items };
}

/**
 * "2.700.000", "2,700,000", "Rp 2700000", "2.7jt", "2,7 juta", "500rb", "500k" -> angka.
 * Sen di belakang ("1.350.000,00", "1,350,000.00", "2700000,00") dan ",-" ("1.350.000,-") ikut terbaca,
 * seperti yang biasa tertulis di mutasi bank. Hasil NaN kalau tidak bisa dibaca.
 */
function parseRupiah_(s) {
  if (s == null) return NaN;
  var t = String(s).toLowerCase().replace(/rp\.?/g, '').replace(/\s+/g, '').replace(/[.,]?-$/, '');
  if (!t) return NaN;
  var m = t.match(/^(\d+(?:[.,]\d+)?)(jt|juta|rb|ribu|k)$/);
  if (m) {
    var mult = (m[2] === 'jt' || m[2] === 'juta') ? 1e6 : 1e3;
    return Math.round(parseFloat(m[1].replace(',', '.')) * mult);
  }
  var sen = rupiahSen_(t);
  if (sen != null) return sen;
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  return parseInt(t.replace(/[.,]/g, ''), 10);
}

/**
 * Angka dengan 2 digit sen di belakang -> rupiah dibulatkan, atau null kalau bukan bentuk itu.
 * Pemisah sen harus beda dengan pemisah ribuan ("1.350.000,00"), supaya "1.500.00" (salah ketik)
 * tidak dikira 1.500 rupiah. Tanpa pemisah ribuan minimal 4 digit ("2700000,00"); "2,50" tetap 250.
 */
function rupiahSen_(t) {
  var m = String(t).match(/^(\d{1,3}(?:([.,])\d{3})+|\d{4,})([.,])(\d{2})$/);
  if (!m || m[2] === m[3]) return null;
  return Math.round(parseInt(m[1].replace(/[.,]/g, ''), 10) + parseInt(m[4], 10) / 100);
}

/** "Nama paket | 2700000 | 1" -> {nama, harga, qty} atau {error} */
function parseItem_(line, idx) {
  var parts = line.split('|').map(function (s) { return s.trim(); });
  var nama = parts[0];
  var harga = parseRupiah_(parts[1]);
  var qty = parts[2] ? parseInt(parts[2].replace(/[^\d]/g, ''), 10) : 1;
  if (!nama) return { error: 'Item ke-' + idx + ': nama item kosong.' };
  if (isNaN(harga)) return { error: 'Item ke-' + idx + ' (' + nama + '): harga tidak terbaca. Format: Item: nama | harga | jumlah' };
  if (!qty || qty < 1) return { error: 'Item ke-' + idx + ' (' + nama + '): jumlah harus angka minimal 1.' };
  return { nama: nama, harga: harga, qty: qty };
}

var BULAN_ALIAS = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, pebruari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12
};

/**
 * Baca tanggal: "28 November 2026", "28 Nov 2026", "28/11/2026", "28-11-2026", "2026-11-28".
 * -> { d, m, y, teks: "28 November 2026", ym: "2026-11" } atau null kalau tidak terbaca / tidak ada.
 */
function parseTanggal_(s) {
  var t = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  var d, m, y, x;
  if ((x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) { d = +x[1]; m = +x[2]; y = +x[3]; }
  else if ((x = t.match(/^(\d{1,2}) ([a-z]+)\.? (\d{4})$/))) { d = +x[1]; m = BULAN_ALIAS[x[2]]; y = +x[3]; }
  else return null;
  if (!m || m < 1 || m > 12 || y < 2000 || y > 2100) return null;
  var hariDalamBulan = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (!d || d < 1 || d > hariDalamBulan) return null;
  return { d: d, m: m, y: y, teks: d + ' ' + BULAN_ID[m - 1] + ' ' + y, ym: y + '-' + (m < 10 ? '0' : '') + m };
}

/** "10%" -> 10% dari subtotal, "200000" -> 200000, kosong -> 0. */
function parseDiskon_(s, subtotal) {
  if (!s) return 0;
  var pct = String(s).match(/^\s*(\d+(?:[.,]\d+)?)\s*%\s*$/);
  if (pct) return Math.round(subtotal * parseFloat(pct[1].replace(',', '.')) / 100);
  return parseRupiah_(s);
}
