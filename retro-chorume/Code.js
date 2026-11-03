const CONFIG = {
  SPREADSHEET_ID: '',
  SHEET_GAMES: 'Lista de Jogos',
  CACHE_SECONDS: 120,
  CACHE_KEY: 'retro-chorume:data:v2',
  MAX_SCORE: 10,
};

function doGet(e) {
  if (e && e.parameter && e.parameter.format === 'json') return jsonResponse_();
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Retrô Chorume')
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

function gamesSheet_() {
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
  return gamesSheet;
}

function readData_() {
  return {
    games: parseGames_(gamesSheet_().getDataRange().getValues()),
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

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = verifyIdToken_(body.idToken);
    if (!user.admin) throw new Error('Acesso negado: esta conta não é admin do Retrô Chorume.');

    if (body.action === 'whoami') return postResponse_({ ok: true, email: user.email, admin: true });
    if (body.action === 'add') return postResponse_(addGame_(body.game || {}, user.email));
    if (body.action === 'rate') return postResponse_(rateGame_(body.game || {}, user.email));
    throw new Error('Ação desconhecida.');
  } catch (err) {
    return postResponse_({ ok: false, error: String((err && err.message) || err) });
  }
}

function postResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function verifyIdToken_(idToken) {
  if (!idToken || String(idToken).split('.').length !== 3) throw new Error('Faça login com o Google primeiro.');
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID não configurado nas propriedades do script.');

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Login inválido ou expirado. Entre de novo.');
  const t = JSON.parse(res.getContentText());

  if (t.aud !== clientId) throw new Error('Token emitido para outro site.');
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw new Error('Emissor inválido.');
  if (Number(t.exp) * 1000 < Date.now()) throw new Error('Login expirado. Entre de novo.');
  if (String(t.email_verified) !== 'true') throw new Error('E-mail não verificado.');

  const email = String(t.email || '').toLowerCase();
  const admins = String(props.getProperty('ADMIN_EMAILS') || '')
    .split(/[,;\s]+/).map(function (a) { return a.trim().toLowerCase(); }).filter(String);
  return { email: email, admin: admins.indexOf(email) > -1 };
}

function authorize() {
  const sheet = gamesSheet_();
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', { muteHttpExceptions: true });
  CacheService.getScriptCache().get('x');
  LockService.getScriptLock();
  Logger.log('Autorizado! Aba: ' + sheet.getName());
}

function clean_(v) {
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
}

function key_(v) {
  return clean_(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function addGame_(g, email) {
  const title = clean_(g.jogo).slice(0, 150);
  const platform = clean_(g.console).slice(0, 60);
  const viewer = clean_(g.viewer).slice(0, 60);
  if (!title) throw new Error('Faltou o nome do jogo.');
  if (!platform) throw new Error('Faltou o console.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = gamesSheet_();

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const raw = clean_(rows[i][0]);
      if (!raw || raw === 'Jogo') continue;
      if (key_(splitTitle_(raw).title) === key_(title) && key_(rows[i][1]) === key_(platform)) {
        throw new Error('Esse jogo já está na lista (' + platform + ').');
      }
    }

    const colA = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
    let last = 0;
    for (let i = 0; i < colA.length; i++) if (clean_(colA[i][0])) last = i + 1;

    const row = last + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    if (last >= 2) {
      sheet.getRange(last, 1, 1, 4).copyTo(sheet.getRange(row, 1, 1, 4), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    const target = sheet.getRange(row, 1, 1, 3);
    target.setNumberFormat('@');
    target.setValues([[title, platform, viewer]]);
    SpreadsheetApp.flush();

    CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);
    console.log('Jogo adicionado por ' + email + ': ' + title + ' (linha ' + row + ')');
    return { ok: true, row: row };
  } finally {
    lock.releaseLock();
  }
}

function rateGame_(g, email) {
  const title = clean_(g.jogo);
  const platform = clean_(g.console);
  const score = Number(g.nota);
  if (!title || !platform) throw new Error('Faltou dizer qual jogo receber a nota.');
  if (!(score >= 0.5 && score <= CONFIG.MAX_SCORE) || Math.round(score * 2) !== score * 2) {
    throw new Error('Nota inválida: use de 0,5 a ' + CONFIG.MAX_SCORE + ', de meio em meio ponto.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = gamesSheet_();
    const rows = sheet.getDataRange().getValues();

    let found = -1;
    let rated = false;
    for (let i = 1; i < rows.length; i++) {
      const raw = clean_(rows[i][0]);
      if (!raw || raw === 'Jogo') continue;
      if (key_(splitTitle_(raw).title) !== key_(title) || key_(rows[i][1]) !== key_(platform)) continue;
      if (parseScore_(rows[i][3]) === null) { found = i + 1; break; }
      rated = true;
    }
    if (found === -1) throw new Error(rated ? 'Esse jogo já tem nota.' : 'Não achei esse jogo na lista. Atualize a página.');

    sheet.getRange(found, 4).setValue(score);
    SpreadsheetApp.flush();

    CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);
    console.log('Nota ' + score + ' dada por ' + email + ': ' + title + ' (linha ' + found + ')');
    return { ok: true, row: found };
  } finally {
    lock.releaseLock();
  }
}
