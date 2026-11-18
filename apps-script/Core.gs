/**
 * Logika inti pembuatan, perubahan, dan pembatalan invoice & receipt.
 * Dipakai bersama oleh perintah chat (Bot.gs) dan Mini App (Api.gs),
 * supaya aturan nomor invoice, validasi, dan status pembayaran selalu sama.
 *
 * Aturan batal & edit:
 *   - Invoice hanya bisa diedit atau dibatalkan selama belum ada pembayaran aktif.
 *   - Pembayaran yang bisa dibatalkan hanya pembayaran aktif terakhir.
 *   - Tidak ada baris yang dihapus: statusnya menjadi DIBATALKAN dan siapa/kapan dicatat.
 */

var STATUS_BATAL = 'DIBATALKAN';

function str_(v) {
  return v == null ? '' : String(v).trim();
}

/** Nama pengguna Telegram untuk kolom "Dibuat Oleh": nama depan + belakang, atau @username. */
function userName_(u) {
  if (!u) return '';
  var nama = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return nama || (u.username ? '@' + u.username : String(u.id || ''));
}

/** Angka atau teks rupiah ("2.700.000", "2,7jt") -> angka, NaN kalau tidak terbaca. */
function toAmount_(v) {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : NaN;
  return parseRupiah_(v);
}

/** Invoice yang masih menunggu pembayaran (bukan lunas, bukan dibatalkan). */
function isOpen_(inv) {
  return inv.status !== STATUS_BATAL && inv.total - inv.dibayar > 0;
}

function activePayments_(noInvoice) {
  return listPayments_(noInvoice).filter(function (p) { return p.status !== STATUS_BATAL; });
}

// ---------------------------------------------------------------- pengingat pelunasan

function aturanPelunasan_(noInvoice) {
  return (CONFIG.PELUNASAN || {})[kodeDariNo_(noInvoice)] || null;
}

/**
 * Batas pelunasan sesuai aturan produk.
 * JSA: 14 hari sebelum tanggal acara -> { ts, teks: 'Paling lambat 8 Januari 2027 (14 hari sebelum acara)' }
 * PRD: { ts: 0, teks: 'Dilakukan saat pesanan selesai' }. Tanpa aturan: { ts: 0, teks: '' }.
 */
function batasPelunasan_(noInvoice, tanggalAcara) {
  var a = aturanPelunasan_(noInvoice);
  if (!a) return { ts: 0, teks: '' };
  if (a.hariSebelumAcara) {
    var n = a.hariSebelumAcara, t = parseTanggal_(tanggalAcara);
    if (!t) return { ts: 0, teks: 'Paling lambat ' + n + ' hari sebelum acara' };
    var ts = new Date(t.y, t.m - 1, t.d, 12).getTime() - n * 86400000;
    return { ts: ts, teks: 'Paling lambat ' + tanggalIndo_(new Date(ts)) + ' (' + n + ' hari sebelum acara)' };
  }
  return { ts: 0, teks: a.teks ? 'Dilakukan ' + a.teks : '' };
}

/** Keterangan baris "Pelunasan" di jadwal invoice. '' = tanpa catatan. */
function jadwalPelunasan_(noInvoice, tanggalAcara) {
  return batasPelunasan_(noInvoice, tanggalAcara).teks;
}

/**
 * Pengingat pelunasan di receipt yang belum lunas.
 * JSA: "Pelunasan Rp 1.600.000 paling lambat 8 Januari 2027 (14 hari sebelum acara)."
 * PRD: "Pelunasan Rp 1.600.000 dilakukan saat pesanan selesai."
 */
function pengingatPelunasan_(noInvoice, sisa, tanggalAcara) {
  if (sisa <= 0) return '';
  var b = batasPelunasan_(noInvoice, tanggalAcara);
  if (!b.teks) return '';
  return 'Pelunasan ' + fmtRp_(sisa) + ' ' + b.teks.charAt(0).toLowerCase() + b.teks.slice(1) + '.';
}


/** Tgl invoice dari input: kosong -> null (pakai hari ini), tidak terbaca -> pesan error. */
function bacaTglInvoice_(v, errors) {
  if (!str_(v)) return null;
  var tgl = parseTanggal_(v);
  if (!tgl) errors.push('Tgl invoice "' + str_(v) + '" tidak terbaca. Tulis seperti 28 November 2026 atau 28/11/2026.');
  return tgl;
}

/** Validasi isi invoice (dipakai saat membuat dan mengedit). */
function validateInvoice_(d) {
  var errors = [];
  if (!str_(d.kepada)) errors.push('"Kepada" wajib diisi.');

  var items = [];
  (d.items || []).forEach(function (it, i) {
    var nama = str_(it && it.nama);
    var harga = toAmount_(it && it.harga);
    var qty = it && it.qty != null && it.qty !== '' ? parseInt(it.qty, 10) : 1;
    if (!nama) errors.push('Item ke-' + (i + 1) + ': nama item kosong.');
    else if (isNaN(harga) || harga < 0) errors.push('Item ke-' + (i + 1) + ' (' + nama + '): harga tidak terbaca.');
    else if (harga === 0) errors.push('Item ke-' + (i + 1) + ' (' + nama + '): harga harus lebih dari Rp 0.');
    else if (!qty || qty < 1) errors.push('Item ke-' + (i + 1) + ' (' + nama + '): jumlah minimal 1.');
    else items.push({ nama: nama, harga: harga, qty: qty });
  });
  if (!(d.items || []).length) errors.push('Minimal satu item.');

  var subtotal = items.reduce(function (s, it) { return s + it.harga * it.qty; }, 0);
  var diskon = typeof d.diskon === 'number' ? Math.round(d.diskon) : parseDiskon_(d.diskon, subtotal);
  if (isNaN(diskon) || diskon < 0) errors.push('Diskon tidak terbaca. Tulis angka (200000) atau persen (10%).');
  var total = subtotal - (diskon || 0);
  if (total < 0) errors.push('Diskon lebih besar dari subtotal.');
  else if (items.length && total === 0) errors.push('Total invoice harus lebih dari Rp 0. Kurangi diskonnya.');

  return { errors: errors, items: items, subtotal: subtotal, diskon: diskon || 0, total: total };
}

/**
 * input = { kepada, domisili, mempelai, tanggalAcara, kode, noInvoice, tglInvoice,
 *           items: [{nama, harga, qty}], diskon }   (diskon: angka, "200000", atau "10%")
 * -> { errors: [...] }  atau  { inv, pdf, dp }
 */
function createInvoice_(input, chatId, oleh) {
  input = input || {};
  var v = validateInvoice_(input);
  var errors = v.errors;

  var kode = str_(input.kode || CONFIG.KODE_DEFAULT).toUpperCase().replace(/[^A-Z0-9]/g, '') || CONFIG.KODE_DEFAULT;
  var produk = produk_();
  if (!produk[kode]) {
    errors.push('Kode produk "' + kode + '" tidak dikenal. Pilih ' + Object.keys(produk).map(function (k) {
      return k + ' (' + produk[k] + ')';
    }).join(', ') + '.');
  }
  // Nomor selalu otomatis supaya urutannya tidak loncat atau bentrok (lihat NOMOR_AWAL di Config).
  if (str_(input.noInvoice)) {
    errors.push('Nomor invoice dibuat otomatis, jadi nomor manual tidak dipakai lagi. Hapus baris "No:" lalu kirim ulang.');
  }
  var tgl = bacaTglInvoice_(input.tglInvoice, errors);

  if (errors.length) return { errors: errors };

  var inv = {
    // Bulan & tahun di nomor mengikuti Tgl invoice (bukan tanggal dibuat).
    noInvoice: nextInvoiceNo_(kode, tgl ? tgl.ym : null),
    tglInvoice: tgl ? tgl.teks : tanggalIndo_(new Date()),
    kepada: str_(input.kepada),
    domisili: str_(input.domisili),
    mempelai: str_(input.mempelai),
    tanggalAcara: str_(input.tanggalAcara),
    items: v.items,
    subtotal: v.subtotal,
    diskon: v.diskon,
    total: v.total,
    dibuatOleh: str_(oleh),
    dibuatPada: fmtDibuat_(new Date())
  };
  var pdf = invoicePdf_(inv, 'Invoice ' + inv.noInvoice + ' - ' + safeName_(inv.kepada) + '.pdf');
  saveInvoice_(inv, chatId);
  return { inv: inv, pdf: pdf, dp: Math.round(inv.total * CONFIG.DP_PERSEN / 100) };
}


/**
 * input = { noInvoice, jumlah, metode, tglBayar }
 * -> { errors: [...] }  atau  { inv, pay, pdf }
 */
function createReceipt_(input, chatId, oleh) {
  input = input || {};
  var errors = [];
  var noInvoice = str_(input.noInvoice);
  var jumlah = toAmount_(input.jumlah);
  if (!noInvoice) errors.push('"Invoice" (nomor invoice) wajib diisi.');
  if (input.jumlah == null || input.jumlah === '') errors.push('"Dibayarkan" (jumlah yang dibayar) wajib diisi.');
  else if (isNaN(jumlah) || jumlah <= 0) errors.push('Jumlah dibayarkan tidak terbaca.');
  if (errors.length) return { errors: errors };

  var found = findInvoice_(noInvoice);
  if (!found) return { errors: ['Invoice ' + noInvoice + ' tidak ditemukan.'] };
  var inv = found.inv;
  if (inv.status === STATUS_BATAL) return { errors: ['Invoice ' + inv.noInvoice + ' sudah dibatalkan, tidak bisa menerima pembayaran.'] };
  var sisaSebelum = inv.total - inv.dibayar;
  if (sisaSebelum <= 0) return { errors: ['Invoice ' + inv.noInvoice + ' sudah lunas.'] };
  if (jumlah > sisaSebelum) {
    return { errors: ['Jumlah ' + fmtRp_(jumlah) + ' melebihi sisa tagihan ' + fmtRp_(sisaSebelum) + '.'] };
  }

  // Nomor receipt tetap urut walau ada yang dibatalkan (#1, #2 batal, #3), status DP dihitung dari yang aktif.
  var ke = countPayments_(inv.noInvoice) + 1;
  var aktifSebelum = activePayments_(inv.noInvoice).length;
  var totalDibayar = inv.dibayar + jumlah;
  var sisa = inv.total - totalDibayar;
  var pay = {
    // Nomor receipt: urutan sendiri per kode per bulan dicatat, kode ikut invoice.
    noReceipt: nextReceiptNo_(kodeDariNo_(inv.noInvoice)),
    noInvoice: inv.noInvoice, kepada: inv.kepada, ke: ke,
    jumlah: jumlah, totalDibayar: totalDibayar, sisa: sisa,
    status: sisa <= 0 ? 'LUNAS' : (aktifSebelum === 0 ? 'DP DITERIMA' : 'PEMBAYARAN DITERIMA'),
    metode: str_(input.metode) || 'Transfer ' + CONFIG.BANK.nama,
    tglBayar: str_(input.tglBayar) || tanggalIndo_(new Date()),
    dibuatOleh: str_(oleh),
    dibuatPada: fmtDibuat_(new Date())
  };
  pay.pengingat = pengingatPelunasan_(inv.noInvoice, sisa, inv.tanggalAcara);

  var filename = 'Receipt ' + pay.noReceipt + ' - ' + safeName_(inv.kepada) + '.pdf';
  var pdf = receiptPdf_(inv, pay, filename);
  pay.url = saveReceiptToDrive_(pdf).getUrl();
  savePayment_(pay, chatId);
  updateInvoicePayment_(found.row, totalDibayar, sisa, pay.status);
  inv.dibayar = totalDibayar;
  inv.sisa = sisa;
  inv.status = pay.status;
  return { inv: inv, pay: pay, pdf: pdf };
}


// ---------------------------------------------------------------- caption PDF di chat

function invoiceCaption_(inv, dp) {
  return '🧾 <b>Invoice ' + esc_(inv.noInvoice) + '</b>' + (inv.revisi ? ' · Revisi ' + inv.revisi : '') + '\n' +
    esc_(inv.kepada) + (inv.mempelai ? ' · ' + esc_(inv.mempelai) : '') + '\n' +
    'Total: <b>' + fmtRp_(inv.total) + '</b>\n' +
    label_('uangMuka') + ' (' + CONFIG.DP_PERSEN + '%): ' + fmtRp_(dp);
}

function receiptCaption_(inv, pay) {
  return '✅ <b>Receipt ' + esc_(pay.noReceipt || inv.noInvoice + ' #' + pay.ke) + '</b>\n' +
    'Untuk ' + esc_(inv.noInvoice) + ' (pembayaran ke-' + pay.ke + ')\n' +
    esc_(inv.kepada) + ' · ' + esc_(pay.status) + '\n' +
    'Dibayar: ' + fmtRp_(pay.jumlah) + '\n' +
    'Sisa: ' + fmtRp_(Math.max(pay.sisa, 0)) + '\n' +
    (pay.pengingat ? '⏰ ' + esc_(pay.pengingat) + '\n' : '') + '\n' +
    '📁 Tersimpan di Google Drive:\n' + esc_(pay.url);
}
