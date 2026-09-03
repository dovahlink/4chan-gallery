/* Service worker — porneste instant si merge offline (doar interfata).

   ATENTIE, doua categorii de cereri NU trebuie atinse:

   1. /api/... — lista de fisiere a thread-ului trebuie sa fie mereu
      proaspata, altfel nu mai apar pozele noi la reincarcare.
   2. i.4cdn.org — pozele si video-urile. Sunt sute de MB pe thread;
      in cache ar umple spatiul telefonului degeaba. Browserul le
       tine oricum in cache-ul lui HTTP.
*/

var CACHE = 'galerie-v1';
var ASSETS = [
  './', './index.html', './app.js', './config.js',
  './manifest.webmanifest',
  './icon-180.png', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(ASSETS); })
      .then(function(){ return self.skipWaiting(); })
      .catch(function(){})
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
                            .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;

  var url;
  try{ url = new URL(e.request.url); }catch(err){ return; }

  /* alta origine (i.4cdn.org, proxy-uri) => direct la retea, neatins */
  if(url.origin !== self.location.origin) return;

  /* endpoint-ul de date => niciodata din cache */
  if(url.pathname.indexOf('/api/') !== -1) return;

  /* interfata: stale-while-revalidate — porneste din cache,
     aduce versiunea noua in fundal pentru data viitoare */
  e.respondWith(
    caches.match(e.request).then(function(hit){
      var net = fetch(e.request).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); }).catch(function(){});
        }
        return res;
      }).catch(function(){
        return hit || caches.match('./index.html');
      });
      return hit || net;
    })
  );
});
