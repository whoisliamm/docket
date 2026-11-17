/**
 * API untuk Telegram Mini App (folder miniapp/).
 *
 * Mini App mengirim POST berisi JSON: { action, data, initData }.
 * initData adalah data login yang ditandatangani Telegram; tanda tangannya
 * diperiksa dengan BOT_TOKEN, jadi hanya pengguna Telegram asli yang bisa
 * memanggil API ini, dan hanya pemilik bot (Script Property OWNER_CHAT_ID).
 *
 * PDF hasil dari Mini App dikirim bot ke chat pribadi pengguna tersebut.
 */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleApi_(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Request tidak valid.' });
  }

  var auth = verifyInitData_(req.initData);
  if (!auth) {
    return json_({ ok: false, code: 'auth', error: 'Sesi Telegram tidak valid atau sudah kedaluwarsa. Tutup lalu buka ulang Mini App dari bot.' });
  }
  var userId = String(auth.user.id);
  if (!isAllowed_(userId)) {
    return json_({ ok: false, code: 'forbidden', userId: userId,
      error: 'Mini App ini hanya bisa dipakai pemilik bot. Chat ID kamu: ' + userId + '.' });
  }

  var lock = null;
  try {
    switch (req.action) {
      case 'bootstrap':
        return json_({ ok: true, user: { id: userId, name: auth.user.first_name || '' },
          config: miniAppConfig_(), invoices: listInvoices_().map(invoiceSummary_) });

      case 'payments':
        return json_({ ok: true, payments: listPayments_(str_(req.data && req.data.noInvoice)).map(function (p) {
          delete p.row; // nomor baris Sheets hanya untuk server
          return p;
        }) });

      case 'invoice.resend': {
        // Kirim ulang PDF invoice (versi terakhir) ke chat pengguna, mis. kalau klien minta dikirim lagi.
        var noR = str_(req.data && req.data.noInvoice);
        var fr = findInvoice_(noR);
        if (!fr) return json_({ ok: false, error: 'Invoice ' + noR + ' tidak ditemukan.' });
        if (String(fr.inv.status).toUpperCase() === STATUS_BATAL) {
          return json_({ ok: false, error: 'Invoice ' + fr.inv.noInvoice + ' sudah dibatalkan, PDF-nya tidak dikirim ulang.' });
        }
        var invR = fr.inv;
        var namaR = 'Invoice ' + invR.noInvoice + (invR.revisi ? ' Rev ' + invR.revisi : '') + ' - ' + safeName_(invR.kepada) + '.pdf';
        sendDocument_(userId, invoicePdf_(invR, namaR),
          invoiceCaption_(invR, Math.round(invR.total * CONFIG.DP_PERSEN / 100)) + '\n\n<i>Dikirim ulang dari Mini App.</i>');
        return json_({ ok: true });
      }


      case 'invoice.create':
      case 'receipt.create':
        lock = LockService.getScriptLock();
        lock.waitLock(28000); // sama seperti webhook: nomor invoice & urutan pembayaran tidak bentrok
        return json_(apiWrite_(req.action, req.data, userId, userName_(auth.user)));

      default:
        return json_({ ok: false, error: 'Aksi tidak dikenal: ' + req.action });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'Terjadi error: ' + (err && err.message ? err.message : err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function apiWrite_(action, data, userId, oleh) {
  switch (action) {
    case 'invoice.create': return apiCreateInvoice_(data, userId, oleh);
    case 'receipt.create': return apiCreateReceipt_(data, userId, oleh);
  }
}


function apiCreateInvoice_(data, userId, oleh) {
  var r = createInvoice_(data, userId, oleh);
  if (r.errors) return { ok: false, error: r.errors.join('\n') };
  sendDocument_(userId, r.pdf, invoiceCaption_(r.inv, r.dp) + '\n\n<i>Dibuat dari Mini App</i>');
  return { ok: true, invoice: invoiceSummary_(Object.assign({ dibayar: 0, sisa: r.inv.total, status: 'BELUM BAYAR' }, r.inv)), dp: r.dp };
}


function apiCreateReceipt_(data, userId, oleh) {
  data = data || {};
  var r = createReceipt_(data, userId, oleh);
  if (r.errors) return { ok: false, error: r.errors.join('\n') };
  sendDocument_(userId, r.pdf, receiptCaption_(r.inv, r.pay));
  return { ok: true, invoice: invoiceSummary_(r.inv), payment: r.pay };
}


function miniAppConfig_() {
  return {
    dpPersen: CONFIG.DP_PERSEN,
    kodeDefault: CONFIG.KODE_DEFAULT,
    kodeList: kodeList_(),
    produk: produk_(),
    paket: CONFIG.PAKET,
    metode: CONFIG.METODE,
    bank: CONFIG.BANK,
    label: { proyek: label_('proyek'), proyekPanjang: label_('proyekPanjang'), uangMuka: label_('uangMuka'),
      contohProyek: label_('contohProyek') }
  };
}

function invoiceSummary_(inv) {
  return {
    noInvoice: inv.noInvoice, tglInvoice: inv.tglInvoice, kepada: inv.kepada,
    domisili: inv.domisili, mempelai: inv.mempelai, tanggalAcara: inv.tanggalAcara,
    items: inv.items, subtotal: inv.subtotal, diskon: inv.diskon, total: inv.total,
    dibayar: inv.dibayar, status: inv.status,
    dibuatOleh: inv.dibuatOleh || '', dibuatPada: inv.dibuatPada || '',
    diubahOleh: inv.diubahOleh || '', diubahPada: inv.diubahPada || '', catatan: inv.catatan || '',
    revisi: inv.revisi || 0
  };
}

/**
 * Validasi initData Telegram Mini App.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * -> { user, authDate } atau null kalau tidak valid.
 */
function verifyInitData_(initData) {
  if (!initData || typeof initData !== 'string') return null;
  var token = prop_('BOT_TOKEN');
  if (!token) return null;

  var params = {};
  initData.split('&').forEach(function (pair) {
    var i = pair.indexOf('=');
    if (i < 0) return;
    var dec = function (s) { return decodeURIComponent(s.replace(/\+/g, ' ')); };
    params[dec(pair.slice(0, i))] = dec(pair.slice(i + 1));
  });
  var hash = params.hash;
  if (!hash) return null;
  delete params.hash;

  var dataCheck = Object.keys(params).sort().map(function (k) { return k + '=' + params[k]; }).join('\n');
  var secret = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(token).getBytes(), Utilities.newBlob('WebAppData').getBytes());
  var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(dataCheck).getBytes(), secret);
  if (bytesToHex_(sig) !== String(hash).toLowerCase()) return null;

  var authDate = Number(params.auth_date) || 0;
  var maxAge = CONFIG.MINIAPP_SESI_DETIK || 86400;
  if (Date.now() / 1000 - authDate > maxAge) return null;

  var user;
  try { user = JSON.parse(params.user || 'null'); } catch (err) { return null; }
  if (!user || !user.id) return null;
  return { user: user, authDate: authDate };
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
