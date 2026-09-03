# Instalare pe iPhone

Se face o singură dată, de pe calculator, apoi telefonul doar deschide un link.

---

## Ce trebuie decis întâi

Ca aplicația să meargă pe telefon **oriunde**, nu doar acasă, are nevoie de un
loc care să-i servească pagina și de cineva care să facă cererea către
`a.4cdn.org` în locul browserului. Motivul e în [README.md](README.md), la
punctul 1: CORS-ul 4chan permite citirea JSON-ului doar de pe `boards.4chan.org`.

Pozele și video-urile **nu** trec prin acel „cineva” — se încarcă direct de pe
CDN-ul 4chan. Deci vorbim de câteva zeci de KB pe thread, nu de sute de MB.

> **Despre proxy-urile publice.** Verificate pe 3 septembrie 2026, din două
> direcții (curl și browser real, cu `Origin` corect): `allorigins.win` și
> `codetabs.com` dădeau timeout (520/522, serviciile căzute), `corsproxy.io`
> cerea API key, iar `cors.lol`, `cors.eu.org` și `test.cors.workers.dev`
> răspundeau `429`. Adică **niciunul nu funcționa**. Sunt lăsate în `config.js`
> ca rezervă, pentru cazul în care revin, dar nu construi pe ele.
>
> Varianta A de mai jos nu cere cont nou: Vercel te lasă să intri **cu contul
> tău de GitHub**, deci nu ai nici email nou, nici parolă nouă.

---

## Varianta A (recomandată) — Vercel, un singur deploy

Servește și pagina și proxy-ul, din același repo. Nu trebuie să editezi nimic:
funcția din `api/thread.js` ajunge pe aceeași origine ca pagina, iar aplicația
o încearcă prima.

1. **Urcă folderul pe GitHub** ca repo nou (poate fi privat — Vercel publică și
   din repo privat pe planul gratuit).
2. Intră pe <https://vercel.com> → **Continue with GitHub**.
3. **Add New → Project** → alege repo-ul → **Deploy**.
   Nu schimba nimic la setări: nu e framework, nu e build.
4. După ~1 minut primești o adresă de forma
   `https://4chan-gallery-xxxx.vercel.app`.
5. Deschide adresa în **Safari** pe iPhone → **Share** → **Add to Home Screen**.

Gata. La fiecare `git push`, Vercel republică singur.

> Costuri: planul gratuit (Hobby) acoperă cu mult un thread deschis din când în
> când. Nu cere card.

### Varianta A′ — Cloudflare Pages

Aceeași idee, dacă preferi Cloudflare (cere însă cont nou, cu email și parolă).
Mută `api/thread.js` în `functions/api/thread.js` și schimbă doar semnătura:

```js
export async function onRequestGet(context) {
  return handler(context.request);   // restul codului rămâne identic
}
```

---

## Varianta B — GitHub Pages + proxy separat

Dacă vrei pagina pe GitHub Pages, ca la proiectul `finante`. GitHub Pages e
găzduire **statică**, deci nu poate rula `api/thread.js`; proxy-ul stă altundeva
și îi pui adresa în `config.js`.

1. Urcă folderul pe GitHub, într-un repo **public**
   (Pages cere plan plătit pentru repo-uri private).
2. Repo → **Settings → Pages** → *Source*: **Deploy from a branch** →
   branch `main`, folder `/ (root)` → **Save**.
3. După ~1 minut aplicația e la
   `https://<utilizatorul-tău>.github.io/4chan-gallery/`.
4. Fă-ți un proxy și pune-i adresa în [`config.js`](config.js):

   ```js
   api: "https://galeria-mea.vercel.app/api/thread",
   ```

   sau, pentru un proxy CORS generic, cu `{url}` acolo unde intră adresa:

   ```js
   api: "https://exemplu-proxy.com/?url={url}",
   ```

5. Commit, așteaptă un minut, apoi Safari → **Share → Add to Home Screen**.

Fără pasul 4, grila nu se va încărca și vei vedea ecranul „Nicio sursă de date
nu a răspuns”, cu lista exactă a ce s-a încercat.

---

## Varianta C — doar acasă, fără găzduire

Rulezi `start.bat` pe calculator și intri de pe telefon la adresa LAN afișată
(`http://192.168.1.x:8777`). Merge, dar cu trei limitări:

- doar în rețeaua de acasă, doar cu PC-ul pornit;
- pe HTTP simplu iOS **nu** înregistrează service worker-ul, deci se instalează
  pe Home Screen dar fără funcționare offline a interfeței;
- descărcarea cu numele original merge (trece prin server).

---

## Note pentru iPhone

- **Instalează pe Home Screen.** În Safari, un swipe de la marginea din stânga
  declanșează navigarea „înapoi" a browserului și intră în conflict cu swipe-ul
  între poze. În modul instalat (standalone) nu există gestul acela, deci
  problema dispare.
- **Salvarea pozelor.** Ține apăsat pe poză → *Add to Photos*. Butonul ⭳
  descarcă cu numele original doar când există server propriu (acasă, sau
  varianta A); altfel deschide originalul, de unde îl salvezi cu ținere apăsată.
- **Sunetul** pornește oprit, ca să poată porni redarea automat — asta cere iOS.
  Îl activezi cu butonul din dreapta sus; alegerea se ține minte.
- **Low Power Mode** oprește redarea automată a video-urilor. Apeși pe play.
- **Actualizări.** După un `git push`, aplicația instalată se actualizează
  singură la următoarea deschidere (service worker-ul aduce versiunea nouă în
  fundal, deci uneori e nevoie de a doua deschidere). Dacă vrei imediat: șterge
  iconița de pe Home Screen, redeschide linkul în Safari, adaugă din nou.

## Dacă nu merge

| Simptom | Cauză probabilă |
|---|---|
| „Nicio sursă de date nu a răspuns" | n-ai proxy — vezi varianta A sau pasul 4 de la B |
| „Thread-ul nu există sau a fost arhivat" | thread-ul chiar a expirat; 4chan le șterge repede |
| Grila se încarcă, dar poza mare nu | `<meta name="referrer">` lipsește din `index.html` |
| „Deschide aplicația prin http(s)" | ai deschis `index.html` direct de pe disc |
| Se instalează, dar nu merge offline | HTTP simplu; service worker-ul cere HTTPS |
| Arată versiunea veche | vezi *Actualizări* mai sus |
