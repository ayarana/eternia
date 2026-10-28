
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const fail = (msg) => { console.error('Erro: ' + msg); process.exit(1); };

const demo = process.argv.includes('--demo');
if (demo && process.env.CI) fail('--demo não pode ser usado no deploy.');
const apiUrl = demo ? '/demo.json' : (process.env.APPS_SCRIPT_URL || '').trim();
if (demo) {
  console.log('Modo demo: o app vai mostrar os dados de mentira de site/demo.json.');
} else if (!apiUrl) {
  if (process.env.CI) fail('falta APPS_SCRIPT_URL (no GitHub, defina a variável DEPLOYMENT_ID).');
  console.warn('Aviso: APPS_SCRIPT_URL não definida; o app vai abrir mostrando erro de carregamento.');
} else if (!/^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+\/|macros\/)s\/[\w-]+\/exec$/.test(apiUrl)) {
  fail('APPS_SCRIPT_URL não parece o endereço de uma implantação (https://script.google.com/macros/s/<ID>/exec).');
}

const menu = JSON.parse(read('site', 'menu.json'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nav = (current) =>
  '<nav class="sitenav" aria-label="Menu do site">' +
  menu.map((m) => `<a href="${esc(m.href)}"${m.href === current ? ' aria-current="page"' : ''}>${esc(m.label)}</a>`).join('') +
  '</nav>';

const home = read('site', 'index.html');

let app = read('index.html').replace(/<\?!=\s*include\('([\w-]+)'\)\s*\?>/g, (_, name) => {
  if (!existsSync(join(root, name + '.html'))) fail(`index.html pede include('${name}'), mas ${name}.html não existe.`);
  return read(name + '.html');
});
app = app
  .replace(/\s*<base target="_top">/, '')
  .replace('</head>', `  <link rel="stylesheet" href="/assets/nav.css">\n` +
    (apiUrl ? `  <script>window.RETRO_API_URL = ${JSON.stringify(apiUrl)};</script>\n` : '') + '</head>')
  .replace(/<body>/, '<body>\n  ' + nav('/retro-chorume/'));
if (app.includes('<?')) fail('sobrou um trecho <? ?> do Apps Script na página do app.');
if (!app.includes('class="sitenav"')) fail('não consegui colocar o menu na página do app (procurei por <body>).');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'retro-chorume'), { recursive: true });
cpSync(join(root, 'site', 'assets'), join(dist, 'assets'), { recursive: true, filter: (src) => !basename(src).startsWith('ghost-') });

const rndDir = join(root, 'site', 'assets', 'aleatorios');
const rndFiles = existsSync(rndDir)
  ? readdirSync(rndDir).filter((f) => /\.(gif|png|jpe?g|webp|avif)$/i.test(f)).sort()
  : [];
if (existsSync(rndDir)) writeFileSync(join(dist, 'assets', 'aleatorios', 'manifest.json'), JSON.stringify(rndFiles));
rndFiles.forEach((f) => {
  const mb = readFileSync(join(rndDir, f)).length / 1e6;
  if (mb > 3) console.warn(`Aviso: aleatorios/${f} tem ${mb.toFixed(1)} MB; imagens grandes deixam o site lento.`);
});
cpSync(join(root, 'site', 'nav.css'), join(dist, 'assets', 'nav.css'));
if (demo) cpSync(join(root, 'site', 'demo.json'), join(dist, 'demo.json'));
writeFileSync(join(dist, 'index.html'), home.replace('<!--nav-->', nav('')));
writeFileSync(join(dist, 'retro-chorume', 'index.html'), app);

console.log('dist/ pronto.' + (rndFiles.length ? ` (${rndFiles.length} imagens aleatórias)` : ''));
console.log('  app:', Math.round(app.length / 1024) + ' KB', apiUrl ? '(dados de ' + (demo ? 'demo.json' : apiUrl.replace(/\/s\/[\w-]+\//, '/s/…/')) + ')' : '(sem endereço de dados)');
