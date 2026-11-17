/**
 * Pemanggilan Telegram Bot API.
 */

function tg_(method, payload) {
  var token = prop_('BOT_TOKEN');
  if (!token) throw new Error('BOT_TOKEN belum diisi di Script Properties.');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    payload: payload || {},
    muteHttpExceptions: true
  });
  var json = JSON.parse(res.getContentText());
  if (!json.ok) console.error('Telegram ' + method + ' gagal: ' + res.getContentText());
  return json;
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
