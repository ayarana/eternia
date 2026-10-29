
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const fail = (msg) => { console.error('Erro: ' + msg); process.exit(1); };

const demo = process.argv.includes('--demo');
if (demo && process.env.CI) fail('--demo não pode ser usado no deploy.');

const URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+\/|macros\/)s\/[\w-]+\/exec$/;
const checkUrl = (name, url) => {
  if (url && !URL_RE.test(url)) fail(`${name} não parece o endereço de uma implantação (https://script.google.com/macros/s/<ID>/exec).`);
};

const apiUrl = demo ? '/demo.json' : (process.env.APPS_SCRIPT_URL || '').trim();
const zeradosUrl = demo ? '/demo-zerados.json' : (process.env.APPS_SCRIPT_ZERADOS_URL || '').trim();
if (demo) {
  console.log('Modo demo: as páginas vão mostrar os dados de site/demo.json e jogos-zerados/demo.json.');
} else if (!apiUrl) {
  if (process.env.CI) fail('falta APPS_SCRIPT_URL (no GitHub, defina a variável DEPLOYMENT_ID).');
  console.warn('Aviso: APPS_SCRIPT_URL não definida; o app vai abrir mostrando erro de carregamento.');
} else {
  checkUrl('APPS_SCRIPT_URL', apiUrl);
}
if (!demo) checkUrl('APPS_SCRIPT_ZERADOS_URL', zeradosUrl);
const hasZerados = !!zeradosUrl;

const menu = JSON.parse(read('site', 'menu.json')).filter((m) => !m.only || (m.only === 'zerados' && hasZerados));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nav = (current) =>
  '<nav class="sitenav" aria-label="Menu do site">' +
  menu.map((m) => `<a href="${esc(m.href)}"${m.href === current ? ' aria-current="page"' : ''}>${esc(m.label)}</a>`).join('') +
  '</nav>';

const home = read('site', 'index.html');

const favicon =
  `  <link rel="icon" type="image/png" href="/assets/favicon.png">\n` +
  `  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n`;

const buildApp = ({ dir, route, url, global, label }) => {
  let html = read(dir, 'index.html').replace(/<\?!=\s*include\('([\w-]+)'\)\s*\?>/g, (_, name) => {
    if (!existsSync(join(root, dir, name + '.html'))) fail(`${dir}/index.html pede include('${name}'), mas ${dir}/${name}.html não existe.`);
    return read(dir, name + '.html');
  });
  html = html
    .replace(/\s*<base target="_top">/, '')
    .replace('</head>', favicon +
      `  <link rel="stylesheet" href="/assets/nav.css">\n` +
      (url ? `  <script>window.${global} = ${JSON.stringify(url)};</script>\n` : '') + '</head>')
    .replace(/<body>/, '<body>\n  ' + nav(route));
  if (html.includes('<?')) fail(`sobrou um trecho <? ?> do Apps Script na página ${label}.`);
  if (!html.includes('class="sitenav"')) fail(`não consegui colocar o menu na página ${label} (procurei por <body>).`);
  return html;
};

const app = buildApp({ dir: 'retro-chorume', route: '/retro-chorume/', url: apiUrl, global: 'RETRO_API_URL', label: 'do Retrô Chorume' });
const zerados = hasZerados
  ? buildApp({ dir: 'jogos-zerados', route: '/jogos-zerados/', url: zeradosUrl, global: 'ZERADOS_API_URL', label: 'de jogos zerados' })
  : null;

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'retro-chorume'), { recursive: true });
if (zerados) mkdirSync(join(dist, 'jogos-zerados'), { recursive: true });
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
if (demo) {
  cpSync(join(root, 'site', 'demo.json'), join(dist, 'demo.json'));
  cpSync(join(root, 'jogos-zerados', 'demo.json'), join(dist, 'demo-zerados.json'));
}

const SOON = /<span class="cta cta--soon[\s\S]*?<\/span>\s*(?=<a class="cta cta--chorume)/;
const zeradosCta =
  '<a class="cta cta--zerados reveal" href="/jogos-zerados/">\n' +
  '        <span class="cta__bar"><span>zerados.lst</span><i aria-hidden="true"></i></span>\n' +
  '        <span class="cta__body">\n' +
  '          <span class="cta__label">Jogos zerados</span>\n' +
  '          <span class="cta__sub">todos os terminados</span>\n' +
  '        </span>\n' +
  '      </a>\n      ';
let homeHtml = home.replace('<!--nav-->', nav(''));
if (zerados) {
  if (!SOON.test(homeHtml)) fail('não encontrei o botão "EM BREVE" de jogos zerados em site/index.html.');
  homeHtml = homeHtml.replace(SOON, zeradosCta);
}
writeFileSync(join(dist, 'index.html'), homeHtml);
writeFileSync(join(dist, 'retro-chorume', 'index.html'), app);
if (zerados) writeFileSync(join(dist, 'jogos-zerados', 'index.html'), zerados);

console.log('dist/ pronto.' + (rndFiles.length ? ` (${rndFiles.length} imagens aleatórias)` : ''));
const where = (u, file) => (u ? '(dados de ' + (demo ? file : u.replace(/\/s\/[\w-]+\//, '/s/…/')) + ')' : '(sem endereço de dados)');
console.log('  retro-chorume:', Math.round(app.length / 1024) + ' KB', where(apiUrl, 'demo.json'));
console.log('  jogos-zerados:', zerados ? Math.round(zerados.length / 1024) + ' KB ' + where(zeradosUrl, 'demo-zerados.json') : 'desligada (sem APPS_SCRIPT_ZERADOS_URL)');
