# Galerie 4chan

Vizualizator de poze pentru 4chan. Îți trage singur lista de boarduri, alegi
un board, alegi un thread și dai swipe prin toate pozele și video-urile din el,
în ordinea din thread. Instalabil pe iPhone ca aplicație (Add to Home Screen).

Pentru instalare pe telefon și găzduire, vezi [SETUP.md](SETUP.md).

## Acasă, pe calculator

Dublu-click pe `start.bat` (sau `python serve.py`). Se deschide pe
`http://localhost:8777`. Alt port: `python serve.py 9000`.

Serverul ascultă pe toată rețeaua și îți afișează la pornire și adresa LAN, deci
poți intra și de pe telefon dacă e pe același Wi-Fi și PC-ul e pornit.

## Folosire

Aplicația are trei ecrane, iar butonul `‹` din stânga titlului urcă un nivel:

**Boarduri** → toate cele 77 de boarduri, aduse din `boards.json`. Ai o căutare
care merge și după cod și după titlu: `wsg`, `anime`, `technology`. Scrise cu
slash-uri (`/g/`) caută exact boardul acela; fără slash-uri, rezultatele se
ordonează după relevanță. Butonul `Doar SFW` ascunde cele 24 de boarduri pe care
4chan nu le marchează worksafe. Lista se ține în telefon 7 zile, deci ecranul
se deschide instant; `↻` o reîmprospătează.

**Threaduri** → threadurile active ale boardului, cu miniatura și titlul primei
postări, numărul de răspunsuri și de poze. Threadurile fixate au 📌.

**Galerie** → pozele și video-urile threadului. Aici sunt gesturile de mai jos.

Poți sări direct la un thread lipind linkul în bara de sus
(`https://boards.4chan.org/g/thread/109688681`) sau scurt `g/109688681`.
Threadurile deschise recent apar pe primul ecran, sub lista de boarduri.

| Gest / tastă | Efect |
|---|---|
| Swipe stânga / dreapta | Media următoare / anterioară |
| Swipe jos | Închide viewer-ul |
| Dublu-tap | Zoom 2.5x (încă un dublu-tap revine) |
| Pinch | Zoom liber; când e zoomat, drag face pan |
| Tap simplu | Ascunde / arată butoanele |
| ← → , Space | Navigare (desktop) |
| Home / End | Prima / ultima |
| Esc | Închide |
| M | Sunet on/off (se ține minte) |
| S | Salvează fișierul curent |
| P | Slideshow |
| F | Fullscreen |

Butoanele `Tot / Poze / Video` filtrează galeria, iar `↻` reîncarcă ecranul
curent — util la threaduri active, ca să prinzi pozele noi.

Video-urile pornesc singure, fără sunet, în buclă; cel de care pleci se oprește
și se resetează. Butonul de sunet ține minte alegerea.

## Cum funcționează

Două particularități ale 4chan dictează toată arhitectura.

**1. Listele nu se pot citi direct din browser.** `a.4cdn.org` trimite
`Access-Control-Allow-Origin: http://boards.4chan.org`, deci CORS blochează
orice altă origine. Cineva trebuie să facă cererea în locul browserului: acasă
`serve.py`, găzduit funcțiile din `api/`, sau un proxy pus în `config.js`.
Asta e valabil pentru toate trei listele — boarduri, threaduri, fișiere. Din
același motiv aplicația **nu** merge deschisă ca fișier de pe disc (`file://`).

Traficul prin proxy rămâne mic: `boards.json` are 35 KB și se ia o dată la 7
zile, un catalog de board 280–430 KB, iar lista de fișiere a unui thread vreo
100 KB.

Aplicația încearcă sursele în ordine — server propriu → `api` din `config.js` →
proxy-uri publice — reține care a răspuns și pornește cu ea data viitoare. Dacă
toate pică, ecranul de eroare arată exact ce a încercat și de ce a picat fiecare.

**2. Fișierele full-size au hotlink protection.** `i.4cdn.org` răspunde `403`
dacă `Referer` e alt site, dar miniaturile sunt scutite — de aici un simptom
foarte înșelător, în care grila se încarcă perfect și doar poza mare crapă.
Fixul e `<meta name="referrer" content="no-referrer">`: fără `Referer`, CDN-ul
servește normal. Așa că pozele și video-urile se încarcă **direct** de pe CDN,
fără proxy, inclusiv cu seek în video (CDN-ul suportă `Range`). Proxy-ul cară
doar JSON-ul, câteva zeci de KB pe thread.

Dacă un fișier e totuși refuzat, viewer-ul reîncearcă o dată prin serverul
propriu, când acesta există.

## Fișiere

| Fișier | Ce e |
|---|---|
| `index.html` | interfața și stilurile |
| `app.js` | toată logica |
| `config.js` | **singurul fișier pe care îl editezi** — sursa de JSON |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | partea de aplicație instalabilă |
| `serve.py`, `start.bat` | serverul local pentru acasă |
| `api/boards.js`, `api/catalog.js`, `api/thread.js`, `api/file.js` | proxy pentru găzduire (inert pe GitHub Pages) |
| `make-icons.py` | regenerează iconițele; se rulează o singură dată |

Fără dependențe și fără build: HTML, CSS și JavaScript simplu, plus biblioteca
standard Python pentru server.
