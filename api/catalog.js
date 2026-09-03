/* Proxy pentru catalogul unui board ({board}/catalog.json) — lista de
   threaduri active, cu miniatura si titlul primei postari.

   Cam 280-430 KB per board (150-200 threaduri). Nu il cachem: threadurile
   se schimba des, iar un catalog vechi arata poze care nu mai exista.

   Boilerplate repetat intentionat — vezi comentariul din boards.js.

   Pentru Cloudflare Pages: muta in functions/api/catalog.js si inlocuieste
   ultima linie cu
       export const onRequestGet = ({ request }) => handle(request); */

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

async function handle(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const board = new URL(request.url).searchParams.get('board') || '';
  if (!/^[a-z0-9]{1,10}$/i.test(board)) return err('board invalid', 400);

  let up;
  try {
    up = await fetch(`https://a.4cdn.org/${board}/catalog.json`, {
      headers: { 'user-agent': UA, accept: 'application/json' }
    });
  } catch (e) {
    return err('nu am putut contacta 4chan: ' + e.message, 502);
  }
  if (up.status === 404) return err('boardul nu exista', 404);
  if (!up.ok) return err('4chan a raspuns ' + up.status, up.status);

  // Catalogul e mare, deci il pasam ca stream, fara sa-l tinem in memorie.
  return new Response(up.body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS
    }
  });
}

export default { fetch: handle };
