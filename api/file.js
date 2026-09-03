/* Proxy pentru fisiere — folosit doar in doua situatii:

   1. Descarcare cu numele original al fisierului. Un link cross-origin
      cu atributul download nu are efect, browserul doar deschide poza.
   2. Rezerva, daca CDN-ul refuza un fisier (403 hotlink protection).
      In mod normal nu se intampla: pagina trimite
      <meta name="referrer" content="no-referrer">, iar fara Referer
      i.4cdn.org serveste normal.

   Trimite Referer de 4chan (obligatoriu cand cererea vine de pe alt
   origin) si paseaza Range, ca sa functioneze seek-ul in video.

   Format Vercel (Edge). Inert pe GitHub Pages. */

export const config = { runtime: 'edge' };

const CORS = { 'access-control-allow-origin': '*' };
const EXT = /^\.(jpg|jpeg|png|gif|webm|mp4)$/i;

const err = (msg, status) => new Response(JSON.stringify({ error: msg }), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
});

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const board = searchParams.get('board') || '';
  const tim = searchParams.get('tim') || '';
  const ext = searchParams.get('ext') || '';
  const name = searchParams.get('name') || (tim + ext);
  const inline = searchParams.get('inline') === '1';

  if (!/^[a-z0-9]{1,10}$/i.test(board) || !/^\d{5,25}$/.test(tim) || !EXT.test(ext)) {
    return err('parametri invalizi', 400);
  }

  const range = req.headers.get('range');
  let up;
  try {
    up = await fetch(`https://i.4cdn.org/${board}/${tim}${ext}`, {
      headers: {
        referer: 'https://boards.4chan.org/',
        ...(range ? { range } : {})
      }
    });
  } catch (e) {
    return err('eroare la descarcare: ' + e.message, 502);
  }
  if (!up.ok && up.status !== 206) return err('fisierul nu mai exista pe server', up.status);

  const safe = name.replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 120);
  const h = {
    'content-type': up.headers.get('content-type') || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'content-disposition': inline ? 'inline' : `attachment; filename="${safe}"`,
    ...CORS
  };
  for (const k of ['content-length', 'content-range']) {
    const v = up.headers.get(k);
    if (v) h[k] = v;
  }

  return new Response(up.body, { status: up.status, headers: h });
}
