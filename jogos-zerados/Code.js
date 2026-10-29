const CONFIG = {
  SPREADSHEET_ID: '',
  SHEET_GAMES: 'Jogos - GERAL',
  CACHE_SECONDS: 300,
  CACHE_KEY: 'zerados:data:v1',
};

const CONSOLE_NAMES = {
  'snes': 'SNES',
  'nintendo 64': 'N64',
  'gameboy': 'Game Boy',
  'game boy': 'Game Boy',
  'nntendo ds': 'Nintendo DS',
  'dream cast': 'Dreamcast',
  'saturn': 'Sega Saturn',
};

function doGet(e) {
  if (e && e.parameter && e.parameter.format === 'json') return jsonResponse_();
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Jogos Zerados')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function jsonResponse_() {
  let body;
  try {
    body = getData();
  } catch (err) {
    console.error(err);
    body = { error: 'Não foi possível ler a planilha.' };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function getData() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CONFIG.CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const data = readData_();
  try {
    cache.put(CONFIG.CACHE_KEY, JSON.stringify(data), CONFIG.CACHE_SECONDS);
  } catch (err) {
  }
  return data;
}

function readData_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID') || CONFIG.SPREADSHEET_ID;
  if (!id) {
    throw new Error('Falta o ID da planilha. Preencha a propriedade de script SPREADSHEET_ID.');
  }

  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(CONFIG.SHEET_GAMES);
  if (!sheet) {
    throw new Error('Não encontrei a aba "' + CONFIG.SHEET_GAMES + '" na planilha.');
  }

  return {
    games: parseGames_(sheet.getDataRange().getValues()),
    updatedAt: new Date().toISOString(),
  };
}

function parseGames_(rows) {
  const games = [];
  let year = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const first = row[0];

    if (typeof first === 'string') {
      const y = first.trim().match(/^(20\d{2})\b/);
      if (y) year = Number(y[1]);
      continue;
    }
    if (typeof first !== 'number' || !isFinite(first)) continue;

    const title = String(row[1] || '').replace(/^\s*\d+\s*-\s*/, '').trim();
    if (!title) continue;

    const when = parseWhen_(row[4], year);
    const time = String(row[3] === null || row[3] === undefined ? '' : row[3]).trim();
    const comment = String(row[5] || '').trim();

    games.push({
      n: first,
      title: title,
      console: normalizeConsole_(row[2]),
      year: when.end ? Number(when.end.slice(0, 4)) : year,
      start: when.start,
      end: when.end,
      minutes: parseMinutes_(time),
      time: time && time !== '???' ? time : '',
      comment: comment,
    });
  }
  return games;
}

function normalizeConsole_(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Outro';
  return CONSOLE_NAMES[raw.toLowerCase()] || raw;
}

function parseMinutes_(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, '');
  let m = t.match(/^(\d+)h(?:(\d+)(?:m(?:in)?)?(?:(\d+)s?)?)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0) + Number(m[3] || 0) / 60;
  m = t.match(/^(\d+)(?:m|min)(?:(\d+)s?)?$/);
  if (m) return Number(m[1]) + Number(m[2] || 0) / 60;
  return null;
}

function parseWhen_(value, sectionYear) {
  if (value instanceof Date) {
    const iso = Utilities.formatDate(value, 'America/Sao_Paulo', 'yyyy-MM-dd');
    return { start: iso, end: iso };
  }
  const text = String(value || '');
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/g;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    found.push({ at: m.index, iso: y + '-' + pad_(mo) + '-' + pad_(d) });
  }
  if (!found.length) return { start: null, end: null };

  const mark = text.search(/fina|termin/i);
  let end = found[found.length - 1];
  let start = null;
  if (mark >= 0) {
    const after = found.filter(function (f) { return f.at >= mark; });
    const before = found.filter(function (f) { return f.at < mark; });
    if (after.length) end = after[after.length - 1];
    if (before.length) start = before[0];
    else if (/iniciado\s+e\s+/i.test(text)) start = end;
  } else {
    start = found.length > 1 ? found[0] : null;
  }
  return { start: start ? start.iso : null, end: end.iso };
}

function pad_(n) {
  return (n < 10 ? '0' : '') + n;
}
