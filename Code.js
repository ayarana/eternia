const CONFIG = {
  SPREADSHEET_ID: '',
  SHEET_GAMES: 'Lista de Jogos',
  CACHE_SECONDS: 120,
  CACHE_KEY: 'retro-chorume:data:v2',
};

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Retrô Chorume')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
    throw new Error('Falta o ID da planilha. Preencha CONFIG.SPREADSHEET_ID em Code.gs ou a propriedade de script SPREADSHEET_ID.');
  }

  const ss = SpreadsheetApp.openById(id);
  const gamesSheet = ss.getSheetByName(CONFIG.SHEET_GAMES);
  if (!gamesSheet) {
    throw new Error('Não encontrei a aba "' + CONFIG.SHEET_GAMES + '" na planilha.');
  }

  return {
    games: parseGames_(gamesSheet.getDataRange().getValues()),
    updatedAt: new Date().toISOString(),
  };
}

function parseGames_(rows) {
  const games = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const raw = String(row[0] || '').trim();
    if (!raw || raw === 'Jogo') continue;

    const split = splitTitle_(raw);
    games.push({
      title: split.title,
      done: split.done,
      console: String(row[1] || '').trim(),
      viewer: String(row[2] || '').trim() || null,
      score: parseScore_(row[3]),
    });
  }
  return games;
}

function splitTitle_(raw) {
  const done = /\(zerado\)/i.test(raw);
  return { title: raw.replace(/\s*\(zerado\)\s*/gi, ' ').trim(), done: done };
}

function parseScore_(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = parseFloat(value.replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  return null;
}
