/* Proxy pentru lista de boarduri (boards.json, ~35 KB, 77 boarduri).
   Acelasi motiv ca la thread.js: CORS-ul lui a.4cdn.org permite citirea
   doar de pe boards.4chan.org.

   Boilerplate-ul e repetat intentionat in cele trei fisiere din api/:
   asa fiecare functie e independenta, fara import-uri de bundluit, si
   merge la fel pe Vercel si pe Cloudflare Pages.

   Pentru Cloudflare Pages: muta in functions/api/boards.js si inlocuieste
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

  let up;
  try {
    up = await fetch('https://a.4cdn.org/boards.json', {
      headers: { 'user-agent': UA, accept: 'application/json' }
    });
  } catch (e) {
    return err('nu am putut contacta 4chan: ' + e.message, 502);
  }
  if (!up.ok) return err('4chan a raspuns ' + up.status, up.status);

  const body = await up.text();

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // lista de boarduri se schimba foarte rar; o ora la margine e sigur
      'cache-control': 'public, max-age=3600',
      ...CORS
    }
  });
}

export default { fetch: handle };
