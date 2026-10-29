const LIST_RE = /^[\w-]{13,64}$/;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Cookie: 'SOCS=CAI; CONSENT=YES+1',
};

const reply = (body, status = 200, cache = 'public, max-age=300') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'Netlify-CDN-Cache-Control': cache.replace('max-age', 's-maxage') + (status === 200 ? ', stale-while-revalidate=86400' : ''),
    },
  });

const timeout = (ms) => AbortSignal.timeout(ms);

export function parseIds(html) {
  const seen = new Set();
  const grab = (re) => {
    for (const m of html.matchAll(re)) seen.add(m[1]);
  };
  grab(/"playlistVideoRenderer":\{"videoId":"([\w-]{11})"/g);
  if (!seen.size) grab(/"videoId":"([\w-]{11})"/g);
  return [...seen];
}

async function playlistIds(list) {
  const r = await fetch('https://www.youtube.com/playlist?hl=pt-BR&list=' + list, { headers: HEADERS, signal: timeout(8000) });
  if (!r.ok) throw new Error('playlist ' + r.status);
  return parseIds(await r.text());
}

async function embeddable(id) {
  try {
    const r = await fetch(
      'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id),
      { headers: HEADERS, signal: timeout(4000) }
    );
    return r.ok;
  } catch (e) {
    return true;
  }
}

async function filterEmbeddable(ids) {
  const out = new Array(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      out[i] = await embeddable(ids[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, ids.length) }, worker));
  return ids.filter((_, i) => out[i]);
}

export default async (req) => {
  const list = new URL(req.url).searchParams.get('list') || '';
  if (!LIST_RE.test(list)) return reply({ error: 'Playlist inválida.' }, 400, 'no-store');
  try {
    const all = await playlistIds(list);
    if (!all.length) return reply({ error: 'Nenhum vídeo encontrado na playlist.' }, 502, 'no-store');
    const ids = await filterEmbeddable(all);
    return reply({ ids, total: all.length });
  } catch (e) {
    return reply({ error: 'Não foi possível ler a playlist.' }, 502, 'no-store');
  }
};
