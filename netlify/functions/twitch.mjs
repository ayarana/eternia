const CHANNEL = 'nathanmad77';

let token = null;

async function getToken(id, secret) {
  const r = await fetch(
    'https://id.twitch.tv/oauth2/token?' + new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
    { method: 'POST' }
  );
  if (!r.ok) throw new Error('token ' + r.status);
  token = (await r.json()).access_token;
}

async function getStream(id, secret, retry = true) {
  if (!token) await getToken(id, secret);
  const r = await fetch('https://api.twitch.tv/helix/streams?user_login=' + CHANNEL, {
    headers: { 'Client-Id': id, Authorization: 'Bearer ' + token },
  });
  if (r.status === 401 && retry) { token = null; return getStream(id, secret, false); }
  if (!r.ok) throw new Error('streams ' + r.status);
  return (await r.json()).data[0] || null;
}

const reply = (body, status = 200, cache = 'public, max-age=30') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'Netlify-CDN-Cache-Control': cache.replace('max-age', 's-maxage') },
  });

export default async () => {
  const id = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return reply({ error: 'Twitch não configurada.' }, 503, 'no-store');
  try {
    const s = await getStream(id, secret);
    if (!s || s.type !== 'live') return reply({ live: false });
    return reply({ live: true, viewers: s.viewer_count, title: s.title, game: s.game_name });
  } catch (e) {
    return reply({ error: 'Não foi possível falar com a Twitch.' }, 502, 'no-store');
  }
};
