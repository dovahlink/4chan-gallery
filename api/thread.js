/* Proxy pentru lista de fisiere a unui thread.
   Necesar pentru ca a.4cdn.org trimite
       Access-Control-Allow-Origin: http://boards.4chan.org
   deci browserul nu poate citi JSON-ul de pe alta origine.

   Formatul de aici e pentru Vercel (Edge Functions). Pe GitHub Pages
   fisierul e inert — sta degeaba, nu strica nimic. Pentru Cloudflare
   Pages sau Netlify, vezi SETUP.md (aceeasi logica, alt ambalaj).

   Traficul e mic: cateva zeci de KB pe thread. Pozele si video-urile
   NU trec prin aici, se incarca direct de pe i.4cdn.org. */

export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
           'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS'
};

const err = (msg, status) => new Response(JSON.stringify({ error: msg }), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
});

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board') || '';
  const thread = searchParams.get('thread') || '';

  if (!/^[a-z0-9]{1,10}$/i.test(board) || !/^\d{1,20}$/.test(thread)) {
    return err('board sau thread invalid', 400);
  }

  let up;
  try {
    up = await fetch(`https://a.4cdn.org/${board}/thread/${thread}.json`, {
      headers: { 'user-agent': UA, accept: 'application/json' }
    });
  } catch (e) {
    return err('nu am putut contacta 4chan: ' + e.message, 502);
  }

  if (up.status === 404) return err('thread inexistent sau arhivat', 404);
  if (!up.ok) return err('4chan a raspuns ' + up.status, up.status);

  return new Response(up.body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS
    }
  });
}
