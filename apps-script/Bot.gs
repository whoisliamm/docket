/**
 * Entry point webhook Telegram dan perintah bot.
 *
 * Perintah:
 *   /invoice  -> buat invoice (PDF dikirim ke chat, data dicatat di Sheets)
 *   /receipt  -> buat receipt pembayaran (PDF dikirim ke chat + disimpan ke Google Drive)
 *   /cek      -> cek status invoice / daftar invoice yang belum lunas
 *   /app      -> buka Mini App (tampilan form & daftar tagihan)
 *   /id       -> tampilkan Chat ID (untuk daftar akses)
 *
 * Docket Lite dipakai satu orang: pemilik bot (Script Property OWNER_CHAT_ID). Orang lain
 * mendapat Chat ID-nya saja. Akses untuk tim ada di versi lengkap.
 *
 * doPost menerima dua jenis request:
 *   - webhook Telegram (URL berisi ?key=WEBHOOK_KEY) -> handleUpdate_
 *   - request dari Mini App (JSON berisi initData)    -> handleApi_ (Api.gs)
 */

/** Contoh pesan /invoice, dari CONFIG.CONTOH_CHAT dan paket pertama di CONFIG.PAKET. */
function templateInvoice_() {
  var c = CONFIG.CONTOH_CHAT || {}, p = (CONFIG.PAKET || [])[0] || { nama: 'Paket', harga: 1000000 };
  return '/invoice\n' +
    'Kepada: ' + (c.kepada || 'Nama Klien') + '\n' +
    'Domisili: ' + (c.domisili || 'Jakarta') + '\n' +
    label_('proyek') + ': ' + (c.proyek || 'Nama proyek') + '\n' +
    'Tanggal Acara: ' + (c.tanggalAcara || '22 Januari 2027') + '\n' +
    'Kode: ' + CONFIG.KODE_DEFAULT + '\n' +
    'Item: ' + p.nama + ' | ' + p.harga + ' | 1\n' +
    'Diskon: 0';
}


var TEMPLATE_RECEIPT =
  '/receipt\n' +
  'Invoice: INV-JSA-2026-11-001\n' +
  'Dibayarkan: 1350000\n' +
  'Metode: Transfer BCA';

function doPost(e) {
  if (!e || !e.postData) return ok_();
  if (!e.parameter || !e.parameter.key) return handleApi_(e);

  var lock = LockService.getScriptLock();
  try {
    // Kunci rahasia di URL webhook, supaya hanya Telegram (lewat setWebhook) yang bisa memanggil.
    if (e.parameter.key !== prop_('WEBHOOK_KEY')) return ok_();
    var update = JSON.parse(e.postData.contents);

    lock.waitLock(28000); // satu pesan diproses bergantian, supaya nomor invoice tidak bentrok
    // Telegram bisa mengirim ulang update yang sama; abaikan duplikat.
    var cache = CacheService.getScriptCache();
    var dedupeKey = 'upd_' + update.update_id;
    if (cache.get(dedupeKey)) return ok_();
    cache.put(dedupeKey, '1', 21600);

    handleUpdate_(update);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
  } finally {
    lock.releaseLock();
  }
  return ok_();
}

function doGet() {
  return ContentService.createTextOutput((CONFIG.JUDUL_BOT || 'Bot invoice') + ' aktif.');
}

/**
 * Jawaban untuk webhook Telegram. ContentService dijawab Apps Script dengan redirect 302, yang dianggap
 * gagal oleh Telegram: pesan yang sama terus dikirim ulang dan pesan berikutnya tertahan.
 * HtmlService dijawab langsung dengan 200 OK.
 */
function ok_() {
  return HtmlService.createHtmlOutput('ok');
}

function isAllowed_(chatId) {
  // Docket Lite dipakai satu orang: pemilik bot. Akses untuk tim ada di versi lengkap.
  return !!prop_('OWNER_CHAT_ID') && String(chatId) === String(prop_('OWNER_CHAT_ID')).trim();
}

function handleUpdate_(update) {
  var msg = update.message;
  if (!msg || !msg.text) return;
  var chatId = String(msg.chat.id);
  var oleh = userName_(msg.from); // dicatat di kolom "Dibuat Oleh"
  var text = msg.text.trim();
  var m = text.match(/^\/([a-zA-Z_]+)(@\w+)?/);
  var cmd = m ? m[1].toLowerCase() : '';
  var body = m ? text.slice(m[0].length).trim() : text;

  if (!isAllowed_(chatId)) {
    // Chat pribadi: tampilkan Chat ID (untuk OWNER_CHAT_ID). Grup: cukup tampilkan Chat ID grup.
    if (msg.chat.type === 'private') return sendMessage_(chatId, 'Bot ini hanya bisa dipakai pemiliknya.\n' +
      'Kalau kamu pemiliknya, isi Script Property OWNER_CHAT_ID dengan Chat ID ini: <code>' + chatId + '</code>');
    if (cmd === 'id') return sendMessage_(chatId, 'Chat ID grup ini: <code>' + chatId + '</code>');
    return sendMessage_(chatId, 'Maaf, grup ini belum punya akses ke bot.');
  }
  if (cmd === 'id') {
    return sendMessage_(chatId, 'Chat ID kamu: <code>' + chatId + '</code>');
  }

  try {
    switch (cmd) {
      case 'invoice':
        return body ? cmdInvoice_(chatId, body, oleh)
          : sendMessage_(chatId, 'Salin template ini, ubah isinya, lalu kirim:\n<pre>' + esc_(templateInvoice_()) + '</pre>');
      case 'receipt':
      case 'kuitansi':
        return body ? cmdReceipt_(chatId, body, oleh)
          : sendMessage_(chatId, 'Salin template ini, ubah isinya, lalu kirim:\n<pre>' + esc_(TEMPLATE_RECEIPT) + '</pre>');
      case 'cek':
        return cmdCek_(chatId, body);
      case 'app':
        return cmdApp_(chatId, msg.chat.type === 'private');
      case 'start':
        sendMessage_(chatId, helpText_());
        return prop_('MINIAPP_URL') && msg.chat.type === 'private' ? cmdApp_(chatId, true) : null;
      default:
        return sendMessage_(chatId, helpText_());
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    sendMessage_(chatId, '⚠️ Terjadi error: ' + esc_(err && err.message ? err.message : err));
  }
}





/** Daftar perintah. */
function helpText_() {
  return '<b>' + esc_(CONFIG.JUDUL_BOT || 'Bot Invoice & Receipt') + '</b>\n\n' +
    '/invoice - buat invoice baru\n' +
    '/receipt - buat receipt pembayaran (otomatis tersimpan ke Google Drive)\n' +
    '/cek - daftar invoice yang belum lunas\n' +
    '/cek INV-... - status satu invoice\n' +
    '/app - buka Mini App\n' +
    '/id - lihat Chat ID\n' +
    '\n' +
    'Ketik /invoice atau /receipt tanpa isi untuk mendapatkan template.\n' +
    'Harga boleh ditulis 2700000, 2.700.000, 2,7jt, atau 500rb. Diskon boleh persen (10%).';
}

function errorReply_(chatId, errors, template) {
  return sendMessage_(chatId, '❌ Belum bisa dibuat:\n• ' + errors.map(esc_).join('\n• ') +
    '\n\nContoh format:\n<pre>' + esc_(template) + '</pre>');
}

// ---------------------------------------------------------------- /invoice

function cmdInvoice_(chatId, body, oleh) {
  var p = parseFields_(body);
  var f = p.fields;
  var errors = [];
  var items = [];
  p.items.forEach(function (line, i) {
    var it = parseItem_(line, i + 1);
    if (it.error) errors.push(it.error); else items.push(it);
  });
  if (!p.items.length) errors.push('Minimal satu baris "Item: nama | harga | jumlah".');
  if (errors.length) return errorReply_(chatId, errors, templateInvoice_());

  sendTyping_(chatId);
  var r = createInvoice_({
    kepada: f.kepada, domisili: f.domisili, mempelai: f.mempelai, tanggalAcara: f.tanggalAcara,
    kode: f.kode, noInvoice: f.noInvoice, tglInvoice: f.tglInvoice, items: items, diskon: f.diskon
  }, chatId, oleh);
  if (r.errors) return errorReply_(chatId, r.errors, templateInvoice_());

  kirimPdf_(chatId, r.pdf, invoiceCaption_(r.inv, r.dp) + '\n\n' +
    'Kalau sudah dibayar, kirim:\n<code>/receipt\nInvoice: ' + esc_(r.inv.noInvoice) +
    '\nDibayarkan: ' + r.dp + '\nMetode: Transfer ' + esc_(CONFIG.BANK.nama) + '</code>',
    'Invoice <b>' + esc_(r.inv.noInvoice) + '</b> sudah tercatat, tapi PDF-nya gagal dikirim. ' +
    'Jangan kirim /invoice lagi (nanti tercatat dua kali). Kirim ulang PDF-nya dari Mini App: buka invoice lalu ketuk Kirim ulang PDF invoice.');
}

/** Kirim PDF; kalau gagal, beri tahu bahwa datanya sudah tersimpan supaya tidak dikirim ulang (dobel). */
function kirimPdf_(chatId, pdf, caption, pesanGagal) {
  var r = sendDocument_(chatId, pdf, caption);
  if (!terkirim_(r)) sendMessage_(chatId, '⚠️ ' + pesanGagal);
  return r;
}

// ---------------------------------------------------------------- /receipt

function cmdReceipt_(chatId, body, oleh) {
  var f = parseFields_(body).fields;
  // Nomor invoice boleh langsung ditulis setelah /receipt, mis. "/receipt INV-JSA-2026-11-001"
  var noInvoice = f.noInvoice || (body.match(/INV-[A-Z0-9-]+/i) || [])[0];
  var errors = [];
  if (!noInvoice) errors.push('"Invoice" (nomor invoice) wajib diisi.');
  if (!f.jumlah) errors.push('"Dibayarkan" (jumlah yang dibayar) wajib diisi.');
  if (errors.length) return errorReply_(chatId, errors, TEMPLATE_RECEIPT);

  var data = { noInvoice: noInvoice, jumlah: f.jumlah, metode: f.metode, tglBayar: f.tglBayar };
  buatReceiptChat_(chatId, data, oleh);
}

function buatReceiptChat_(chatId, data, oleh) {
  sendTyping_(chatId);
  var r = createReceipt_(data, chatId, oleh);
  if (r.errors) return sendMessage_(chatId, '❌ ' + r.errors.map(esc_).join('\n❌ ') +
    '\n\nKetik /cek untuk melihat daftar invoice.');
  kirimPdf_(chatId, r.pdf, receiptCaption_(r.inv, r.pay),
    'Pembayaran untuk <b>' + esc_(r.inv.noInvoice) + '</b> sudah tercatat' + (r.pay.noReceipt ? ' (' + esc_(r.pay.noReceipt) + ')' : '') +
    ', tapi PDF receipt gagal dikirim. Jangan kirim /receipt lagi. Receipt-nya ada di Google Drive:\n' + esc_(r.pay.url));
}

// ---------------------------------------------------------------- /app

function cmdApp_(chatId, isPrivate) {
  var url = prop_('MINIAPP_URL');
  if (!url) return sendMessage_(chatId, 'Mini App belum diatur. Isi Script Property MINIAPP_URL (lihat README).');
  if (!isPrivate) {
    return sendMessage_(chatId, 'Mini App hanya bisa dibuka dari chat pribadi dengan bot. Buka chat bot ini lalu kirim /app.');
  }
  return tg_('sendMessage', {
    chat_id: String(chatId),
    text: 'Kelola invoice & pembayaran lewat Mini App:',
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '📱 Buka Mini App', web_app: { url: url } }]] })
  });
}


// ---------------------------------------------------------------- /cek

function cmdCek_(chatId, body) {
  var no = (body.match(/INV-[A-Z0-9-]+/i) || [])[0];
  if (no) {
    var found = findInvoice_(no);
    if (!found) return sendMessage_(chatId, '❌ Invoice <b>' + esc_(no) + '</b> tidak ditemukan.');
    var inv = found.inv;
    return sendMessage_(chatId,
      '<b>' + esc_(inv.noInvoice) + '</b>\n' +
      'Kepada: ' + esc_(inv.kepada) + '\n' +
      (inv.mempelai ? label_('proyek') + ': ' + esc_(inv.mempelai) + '\n' : '') +
      (inv.tanggalAcara ? 'Acara: ' + esc_(inv.tanggalAcara) + '\n' : '') +
      'Total: ' + fmtRp_(inv.total) + '\n' +
      'Dibayar: ' + fmtRp_(inv.dibayar) + '\n' +
      'Sisa: ' + fmtRp_(inv.status === STATUS_BATAL ? 0 : inv.total - inv.dibayar) + '\n' +
      'Status: <b>' + esc_(inv.status) + '</b>' +
      (inv.dibuatOleh ? '\nDibuat oleh: ' + esc_(inv.dibuatOleh) : '') +
      (inv.catatan ? '\nCatatan: ' + esc_(inv.catatan) + (inv.diubahOleh ? ' (oleh ' + esc_(inv.diubahOleh) + ')' : '') : ''));
  }

  var open = listInvoices_().filter(isOpen_);
  if (!open.length) return sendMessage_(chatId, '🎉 Semua invoice sudah lunas.');
  var lines = open.slice(-20).reverse().map(function (inv) {
    return '• <code>' + esc_(inv.noInvoice) + '</code> ' + esc_(inv.kepada) +
      ' - sisa ' + fmtRp_(inv.total - inv.dibayar) + ' (' + esc_(inv.status) + ')';
  });
  return sendMessage_(chatId, '<b>Invoice belum lunas (' + open.length + ')</b>\n' + lines.join('\n') +
    (open.length > 20 ? '\n…dan ' + (open.length - 20) + ' lainnya (lihat Google Sheets).' : ''));
}
