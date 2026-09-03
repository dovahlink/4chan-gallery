/* ===========================================================
   CONFIGURARE  —  singurul fisier pe care il editezi
   ===========================================================

   De ce e nevoie de configurare: JSON-ul cu lista de fisiere a unui
   thread NU se poate citi direct din browser. a.4cdn.org trimite

       Access-Control-Allow-Origin: http://boards.4chan.org

   deci CORS blocheaza orice alta origine. Cineva trebuie sa faca
   cererea in locul browserului. Pozele si video-urile se incarca
   direct de pe CDN, deci "cineva" cara doar cateva zeci de KB
   pe thread.

   Aplicatia incearca, in ordine:

     1. /api/thread pe originea proprie
        - acasa: serverul din serve.py
        - gazduit pe Vercel / Cloudflare Pages / Netlify: functia
          din api/thread.js
        Nu trebuie sa configurezi nimic pentru asta.

     2. `api` de mai jos, daca il completezi.

     3. `fallbacks` — proxy-uri publice. Sunt fragile: cad, cer
        chei, au limite pe IP. Vezi SETUP.md.

   =========================================================== */

window.GALLERY_CONFIG = {

  /* Adresa proxy-ului tau, daca ai unul. Doua forme acceptate:

     a) adresa unui deploy al acestui repo (cel cu folderul api/).
        Se completeaza singura cu /api/boards, /api/catalog si
        /api/thread, dupa ce e nevoie:
          api: "https://galeria-mea.vercel.app"

     b) proxy CORS generic — pune {url} unde trebuie sa intre
        adresa completa, URL-encodata, a JSON-ului de la 4chan:
          api: "https://exemplu-proxy.com/?url={url}"

     Gol => se sare peste pasul 2.                                  */
  api: "",

  /* Proxy-uri publice de rezerva, incercate in ordine.
     Verificate pe 2026-09-03: TOATE erau cazute, cereau API key
     sau raspundeau 429. Le las pentru cazul in care revin, dar nu
     te baza pe ele — SETUP.md are varianta care chiar merge.       */
  fallbacks: [
    "https://api.allorigins.win/raw?url={url}",
    "https://api.codetabs.com/v1/proxy?quest={url}",
    "https://api.cors.lol/?url={url}",
    "https://cors.eu.org/{urlPlain}"
  ],

  /* Cat asteptam o sursa inainte sa trecem la urmatoarea (ms). */
  timeout: 9000
};
