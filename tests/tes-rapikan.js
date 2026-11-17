// Jalankan rapikanSheet() dengan Sheets tiruan yang mencatat setiap panggilan.
const fs = require('fs'), vm = require('vm');
const dir = process.argv[2];
const calls = [];
const API = {
  sheet: ['getRange', 'getLastColumn', 'getMaxRows', 'getLastRow', 'setTabColor', 'setFrozenRows', 'setHiddenGridlines', 'setRowHeight',
    'getBandings', 'hideColumns', 'setColumnWidth', 'newChart', 'insertChart', 'setConditionalFormatRules', 'getFilter', 'appendRow', 'insertSheet'],
  range: ['setFontSize', 'setFontColor', 'setVerticalAlignment', 'setWrapStrategy', 'setBackground', 'setFontWeight', 'setHorizontalAlignment',
    'applyRowBanding', 'setNumberFormat', 'createFilter', 'merge', 'setFormula', 'setFormulas', 'setValues', 'getValues', 'setValue'],
  banding: ['setHeaderRowColor', 'setFirstRowColor', 'setSecondRowColor', 'remove'],
  chart: ['setChartType', 'addRange', 'setPosition', 'setNumHeaders', 'setOption', 'build'],
  rule: ['whenFormulaSatisfied', 'whenTextEqualTo', 'whenTextContains', 'setFontColor', 'setBackground', 'setBold', 'setRanges', 'build']
};
function obj(kind, extra) {
  return new Proxy(extra || {}, { get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'symbol') return undefined;
    if (!API[kind].includes(k)) throw new Error(kind + '.' + k + ' tidak dikenal');
    return (...a) => { if (k === "setFormula" || k === "setFormulas") formulas.push(a[0]); calls.push(kind + '.' + k + '(' + a.map(x => typeof x === 'object' ? (Array.isArray(x) ? '[' + x.length + ']' : '{}') : JSON.stringify(x)).join(',') + ')');
      if (k === 'applyRowBanding') return obj('banding');
      if (k === 'newChart') return obj('chart');
      if (kind === 'banding' || kind === 'rule' || kind === 'chart') return k === 'build' ? { rule: 1 } : obj(kind);
      return obj(kind, kind === 'range' ? { getValues: () => [[]] } : undefined); };
  } });
}
function sheet(n) {
  return obj('sheet', { getLastColumn: () => n, getMaxRows: () => 1000, getLastRow: () => 1, getBandings: () => [obj('banding')], getFilter: () => null,
    getRange: (r, c, nr, nc) => { calls.push(`sheet.getRange(${r},${c},${nr},${nc})`);
      if (r < 1 || c < 1 || (nr !== undefined && nr < 1) || (nc !== undefined && nc < 1)) throw new Error('range tidak valid ' + [r, c, nr, nc]);
      return obj('range', { getValues: () => [Array(nc || 1).fill('x')] }); } });
}
const sheets = { Ringkasan: sheet(8), Invoice: sheet(20), Pembayaran: sheet(16), Riwayat: sheet(8), Produk: sheet(4) };
const formulas = [];
const ctx = { Charts: { ChartType: { COLUMN: 'COLUMN', BAR: 'BAR', LINE: 'LINE' } }, console, JSON, Math, Date, Object, String, Number, Array,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'x' }) },
  SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n], deleteSheet: () => calls.push('ss.deleteSheet'), insertSheet: (n, i) => { calls.push('ss.insertSheet(' + n + ',' + i + ')'); return sheet(26); } }), WrapStrategy: { CLIP: 'CLIP', WRAP: 'WRAP' },
    newConditionalFormatRule: () => obj('rule') },
  Logger: { log: m => console.log(m) } };
vm.createContext(ctx);
for (const f of ['Config', 'Storage', 'Setup']) vm.runInContext(fs.readFileSync(dir + '/' + f + '.gs', 'utf8'), ctx, { filename: f });
ctx.rapikanSheet();
console.log('panggilan:', calls.length);
console.log(calls.filter(c => /whenFormula|setRanges|createFilter|applyRowBanding/.test(c)).slice(0, 12).join('\n'));

console.log(calls.filter(c => /insertSheet|deleteSheet|setChartType|insertChart|hideColumns/.test(c)).join(String.fromCharCode(10)));
console.log("rumus:", formulas.length); console.log(JSON.stringify(formulas.slice(0,3)).slice(0,900)); fs.writeFileSync("rumus.json", JSON.stringify(formulas, null, 1));
