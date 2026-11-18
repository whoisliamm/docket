/**
 * Pemanggilan Telegram Bot API.
 */

/**
 * Panggil Bot API. Gangguan jaringan atau jawaban bukan JSON (mis. halaman 502) tidak dilempar sebagai error,
 * tapi dijawab { ok: false }: data yang sudah tersimpan tidak boleh tampak gagal hanya karena pesan tidak terkirim.
 */
function tg_(method, payload) {
  var token = prop_('BOT_TOKEN');
  if (!token) throw new Error('BOT_TOKEN belum diisi di Script Properties.');
  var teks = '';
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post',
      payload: payload || {},
      muteHttpExceptions: true
    });
    teks = res.getContentText();
    var json = JSON.parse(teks);
    if (!json.ok) console.error('Telegram ' + method + ' gagal: ' + teks);
    return json;
  } catch (err) {
    console.error('Telegram ' + method + ' gagal: ' + (err && err.message ? err.message : err) + (teks ? ' | ' + teks.slice(0, 300) : ''));
    return { ok: false, description: String(err && err.message ? err.message : err) };
  }
}

/** true kalau jawaban tg_ menandakan terkirim. */
function terkirim_(r) {
  return !!(r && r.ok);
}

function sendMessage_(chatId, html) {
  return tg_('sendMessage', {
    chat_id: String(chatId),
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: 'true'
  });
}

function sendDocument_(chatId, blob, captionHtml) {
  return tg_('sendDocument', {
    chat_id: String(chatId),
    document: blob,
    caption: captionHtml || '',
    parse_mode: 'HTML'
  });
}

function sendTyping_(chatId) {
  tg_('sendChatAction', { chat_id: String(chatId), action: 'upload_document' });
}
