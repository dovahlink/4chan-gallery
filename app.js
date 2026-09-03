'use strict';
/* Galerie 4chan — vizualizator de thread cu swipe.
   Vezi README.md pentru cele doua particularitati ale 4chan care
   dicteaza arhitectura (CORS pe JSON, hotlink protection pe media). */

const $ = id => document.getElementById(id);
const CFG = window.GALLERY_CONFIG || {};
const CDN = 'https://i.4cdn.org';
const FILE  = (b,tim,ext) => `${CDN}/${b}/${tim}${ext}`;
const THUMB = (b,tim)     => `${CDN}/${b}/${tim}s.jpg`;
const VID = /^\.(webm|mp4)$/i;
const OK  = /^\.(jpg|jpeg|png|gif|webm|mp4)$/i;
const SERVED = location.protocol === 'http:' || location.protocol === 'https:';

const LS = {
  get(k,d){ try{ const v=localStorage.getItem('fcg.'+k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('fcg.'+k, JSON.stringify(v)); }catch(e){} }
};

let cur = null;                        // {board, thread, sub, all[], view[]}
let filter = LS.get('filter','all');
let muted  = LS.get('muted',true);
let localApi = false;                  // a raspuns /api de pe originea proprie?

/* ---------------- utils ---------------- */
function bytes(n){
  if(!n) return '';
  if(n < 1024) return n+' B';
  if(n < 1048576) return (n/1024).toFixed(0)+' KB';
  return (n/1048576).toFixed(1)+' MB';
}
function decodeEnt(s){
  if(!s) return '';
  const d = document.createElement('textarea'); d.innerHTML = s;
  return d.value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
let toastT;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove('on'), 1900);
}
function esc(s){ return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c]); }
function parseTarget(s){
  s = (s||'').trim();
  let m = s.match(/(?:boards\.)?4chan(?:nel)?\.org\/([a-zA-Z0-9]+)\/thread\/(\d+)/);
  if(m) return { board:m[1], thread:m[2] };
  m = s.match(/^\/?([a-zA-Z0-9]{1,4})[\/\s]+(\d{4,})\/?$/);
  if(m) return { board:m[1], thread:m[2] };
  return null;
}
function render(html){ $('body').innerHTML = html; }

/* ---------------- sursele de JSON ---------------- */
/* Vezi config.js. Ordinea: server propriu -> api din config -> proxy-uri publice. */
function sources(board, thread){
  const plain = `https://a.4cdn.org/${board}/thread/${thread}.json`;
  const enc = encodeURIComponent(plain);
  const fill = tpl => tpl.includes('{url}')      ? tpl.replace('{url}', enc)
                    : tpl.includes('{urlPlain}') ? tpl.replace('{urlPlain}', plain)
                    : tpl + (tpl.includes('?')?'&':'?') + `board=${board}&thread=${thread}`;
  const host = u => { try{ return new URL(u, location.href).hostname; }catch(e){ return u.slice(0,30); } };

  const list = [];
  if(SERVED) list.push({ name:'server propriu', own:true,
                         url:`api/thread?board=${encodeURIComponent(board)}&thread=${encodeURIComponent(thread)}` });
  if(CFG.api) list.push({ name:'config.js: '+host(CFG.api), own:!CFG.api.includes('{url'), url:fill(CFG.api) });
  for(const f of (CFG.fallbacks || [])) list.push({ name:'rezerva: '+host(f), url:fill(f) });
  return list;
}

/* Unele proxy-uri impacheteaza raspunsul: {contents:"{...}"}. */
function unwrap(txt){
  let j;
  try{ j = JSON.parse(txt); }catch(e){ throw new Error('raspuns care nu e JSON'); }
  if(j && Array.isArray(j.posts)) return j;
  if(j && typeof j.contents === 'string'){
    try{ const inner = JSON.parse(j.contents); if(Array.isArray(inner.posts)) return inner; }catch(e){}
  }
  throw new Error('JSON fara lista de postari');
}

async function getThreadJSON(board, thread, log){
  const list = sources(board, thread);
  if(!list.length) throw new Error('nicio sursa configurata');

  const preferred = LS.get('src', null);
  list.sort((a,b) => (b.name===preferred) - (a.name===preferred));

  for(const s of list){
    const t0 = Date.now();
    try{
      const c = new AbortController();
      const to = setTimeout(()=>c.abort(), CFG.timeout || 9000);
      let r;
      try{ r = await fetch(s.url, {signal:c.signal, cache:'no-store'}); }
      finally{ clearTimeout(to); }

      if(r.status === 404 && s.own){
        const e = new Error('Thread-ul nu exista sau a fost arhivat (404).');
        e.fatal = true; throw e;
      }
      if(!r.ok) throw new Error('HTTP ' + r.status);

      const data = unwrap(await r.text());
      log.push({ name:s.name, ok:true, ms:Date.now()-t0 });
      LS.set('src', s.name);
      localApi = !!s.own;   // stim din sursa care a raspuns, fara cerere in plus
      return data;
    }catch(e){
      if(e.fatal) throw e;
      const why = e.name === 'AbortError' ? 'timeout' : e.message;
      log.push({ name:s.name, ok:false, ms:Date.now()-t0, why });
    }
  }
  const e = new Error('toate sursele au picat');
  e.allFailed = true;
  throw e;
}

/* ---------------- incarcarea thread-ului ---------------- */
async function loadThread(board, thread, quiet){
  if(!SERVED){
    render(`<div class="state err"><b>Deschide aplicatia prin http(s)</b>
      Direct de pe disc (file://) nu merge: JSON-ul thread-ului are nevoie de o
      cerere pe care browserul nu o poate face singur.<br><br>
      Acasa: ruleaza <code>start.bat</code> si intra pe <code>http://localhost:8777</code>.
      </div>`);
    return;
  }
  if(!quiet) render('<div class="state"><div class="spin"></div>Se incarca thread-ul...</div>');

  const log = [];
  let data;
  try{
    data = await getThreadJSON(board, thread, log);
  }catch(e){
    const tried = log.map(l =>
      `<div>${l.ok?'&#10003;':'&#10007;'} ${esc(l.name)} — ${esc(l.ok?'ok':l.why)} <i>(${l.ms} ms)</i></div>`).join('');
    if(e.allFailed){
      render(`<div class="state err"><b>Nicio sursa de date nu a raspuns</b>
        Pozele si video-urile se incarca direct de pe 4chan, dar lista de fisiere a
        thread-ului are nevoie de un proxy — vezi <code>SETUP.md</code>, apoi pune
        adresa lui in <code>config.js</code>.
        <div class="tried">${tried}</div></div>`);
    }else{
      render(`<div class="state err"><b>Nu am putut incarca</b>${esc(e.message)}
        ${tried?`<div class="tried">${tried}</div>`:''}</div>`);
    }
    return;
  }

  const posts = data.posts || [];
  const op = posts[0] || {};
  const all = [];
  for(const p of posts){
    if(!p.tim || !p.ext || p.filedeleted) continue;
    if(!OK.test(p.ext)) continue;
    all.push({
      no:p.no, tim:p.tim, ext:p.ext, board,
      name:(p.filename||'file') + p.ext,
      w:p.w, h:p.h, size:p.fsize,
      video: VID.test(p.ext),
      url:FILE(board,p.tim,p.ext), thumb:THUMB(board,p.tim)
    });
  }

  cur = { board, thread, all, view:[],
          sub: decodeEnt(op.sub) || decodeEnt(op.com).slice(0,90) || `/${board}/ thread` };

  const h = `#/${board}/${thread}`;
  if(location.hash !== h) history.replaceState(null, '', h);
  $('url').value = `https://boards.4chan.org/${board}/thread/${thread}`;

  const recent = LS.get('recent',[]).filter(r => !(r.board===board && r.thread===thread));
  recent.unshift({ board, thread, sub:cur.sub, n:all.length, t:Date.now() });
  LS.set('recent', recent.slice(0,12));

  applyFilter();
}

function applyFilter(){
  if(!cur) return;
  V.reset();
  cur.view = cur.all.filter(m => filter==='all' || (filter==='vid' ? m.video : !m.video));

  const nv = cur.all.filter(m=>m.video).length;
  const ni = cur.all.length - nv;
  const tot = cur.all.reduce((a,m)=>a+(m.size||0),0);
  $('meta').classList.add('on');
  $('hint').style.display = 'none';
  $('sub').innerHTML = `<b>${esc(cur.sub)}</b> &middot; ${ni} poze, ${nv} video &middot; ${bytes(tot)}`;
  [...$('chips').children].forEach(c => c.classList.toggle('on', c.dataset.f===filter));
  renderGrid();
}

function renderGrid(){
  if(!cur.view.length){
    render('<div class="state">Nimic de afisat pentru filtrul ales.</div>');
    return;
  }
  const g = document.createElement('div');
  g.className = 'grid';
  cur.view.forEach((m,i) => {
    const b = document.createElement('button');
    b.className = 'cell';
    const img = document.createElement('img');
    img.loading = 'lazy'; img.decoding = 'async';
    img.referrerPolicy = 'no-referrer'; img.src = m.thumb; img.alt = '';
    img.addEventListener('load', ()=>img.classList.add('rdy'));
    img.addEventListener('error', ()=>{ img.classList.add('rdy'); img.style.opacity=.25; });
    b.appendChild(img);
    if(m.video || /gif/i.test(m.ext)){
      const t = document.createElement('div');
      t.className = 'tag' + (m.video ? ' vid' : '');
      t.textContent = m.video ? '▶ ' + m.ext.slice(1).toUpperCase() : 'GIF';
      b.appendChild(t);
    }
    b.addEventListener('click', ()=>V.open(i));
    g.appendChild(b);
  });
  render(''); $('body').appendChild(g);
}

function renderHome(){
  const recent = LS.get('recent',[]);
  let h = `<div class="state"><b>Galerie 4chan</b>Lipeste linkul unui thread mai sus.</div>`;
  if(recent.length){
    h += '<div class="recent"><h3>Recente</h3>' + recent.map((r,i)=>
      `<button class="ritem" data-i="${i}"><em>/${esc(r.board)}/</em>
       <span>${esc(r.sub||'')}</span>
       <span style="flex:none">${r.n}</span></button>`).join('') + '</div>';
  }
  render(h);
  document.querySelectorAll('.ritem').forEach(el => el.addEventListener('click', ()=>{
    const r = LS.get('recent',[])[+el.dataset.i];
    if(r) loadThread(r.board, r.thread);
  }));
}

/* ---------------- viewer ---------------- */
const V = {
  idx:0, on:false, slides:new Map(),
  drag:false, axis:null, sx:0, sy:0, dx:0, dy:0, t0:0,
  pts:new Map(), pinch:null, zoom:1, panX:0, panY:0,
  lastTap:0, show:true, slideT:null,

  items(){ return cur ? cur.view : []; },

  open(i){
    if(!this.items().length) return;
    this.idx = Math.max(0, Math.min(i, this.items().length-1));
    this.on = true;
    $('viewer').classList.add('on');
    document.body.style.overflow = 'hidden';
    this.resetZoom(); this.chrome(true);
    this.build(); this.place(false); this.info(); this.media();
  },

  /* Lista de media s-a schimbat (filtru sau thread nou): slide-urile
     existente arata fisiere din lista veche, deci se arunca. */
  reset(){
    this.stopShow();
    this.slides.forEach(s => s.remove());
    this.slides.clear();
    this.idx = 0; this.zoom = 1; this.panX = 0; this.panY = 0;
    if(this.on){
      this.on = false;
      $('viewer').classList.remove('on');
      document.body.style.overflow = '';
    }
  },

  close(){
    this.on = false; this.stopShow();
    $('viewer').classList.remove('on');
    document.body.style.overflow = '';
    this.slides.forEach(s => s.remove());
    this.slides.clear();
    const c = document.querySelectorAll('.grid .cell')[this.idx];
    if(c) c.scrollIntoView({block:'center'});
  },

  build(){
    const items = this.items();
    for(const [k,el] of this.slides){
      if(Math.abs(k-this.idx) > 2){ el.remove(); this.slides.delete(k); }
    }
    for(let k=this.idx-1; k<=this.idx+1; k++){
      if(k<0 || k>=items.length || this.slides.has(k)) continue;
      this.slides.set(k, this.makeSlide(items[k], k));
    }
    const nx = items[this.idx+1];
    if(nx && !nx.video){ const im = new Image(); im.referrerPolicy='no-referrer'; im.src = nx.url; }
  },

  makeSlide(m, k){
    const s = document.createElement('div');
    s.className = 'slide';
    const ph = document.createElement('div'); ph.className = 'ph';
    s.appendChild(ph);

    let el;
    if(m.video){
      el = document.createElement('video');
      el.loop = true; el.playsInline = true; el.controls = true;
      el.muted = muted; el.preload = (k===this.idx) ? 'auto' : 'metadata';
      el.poster = m.thumb;
      // Fara asta, elementul se dimensioneaza dupa poster (miniatura de ~125px).
      if(m.w && m.h){ el.width = m.w; el.height = m.h; }
      el.addEventListener('loadeddata', ()=>ph.remove());
    }else{
      el = document.createElement('img');
      el.decoding = 'async';
      el.addEventListener('load', ()=>ph.remove());
    }
    el.className = 'media';
    el.referrerPolicy = 'no-referrer';
    el.src = m.url;

    // Daca CDN-ul refuza totusi (403 hotlink), incearca o data prin serverul propriu.
    let retried = false;
    el.addEventListener('error', ()=>{
      if(!retried && localApi){
        retried = true;
        el.src = `api/file?board=${m.board}&tim=${m.tim}&ext=${encodeURIComponent(m.ext)}&inline=1`;
        return;
      }
      ph.remove();
      const f = document.createElement('div'); f.className='fail';
      f.textContent = 'Fisierul nu s-a putut incarca (probabil sters de pe server).';
      s.appendChild(f);
    });
    s.appendChild(el);
    $('track').appendChild(s);
    return s;
  },

  place(anim){
    const w = window.innerWidth;
    for(const [k,el] of this.slides){
      el.classList.toggle('anim', !!anim);
      const off = (k - this.idx) * w + this.dx;
      const y = (k === this.idx) ? this.dy : 0;
      el.style.transform = `translate3d(${off}px,${y}px,0)`;
      el.style.opacity = (k === this.idx && this.dy > 0)
        ? String(Math.max(0, 1 - this.dy/(window.innerHeight*0.6))) : '1';
    }
  },

  go(d){
    const n = this.items().length;
    const t = this.idx + d;
    if(t < 0 || t >= n){ this.dx = 0; this.place(true); return; }
    this.idx = t;
    this.resetZoom();
    this.dx = 0; this.dy = 0;
    this.build(); this.place(true); this.info(); this.media();
  },

  media(){
    for(const [k,el] of this.slides){
      const v = el.querySelector('video');
      if(!v) continue;
      if(k === this.idx){
        v.muted = muted; v.preload = 'auto';
        const p = v.play(); if(p && p.catch) p.catch(()=>{});
      }else{
        v.pause();
        try{ v.currentTime = 0; }catch(e){}
      }
    }
  },

  el(){ const s = this.slides.get(this.idx); return s ? s.querySelector('.media') : null; },

  resetZoom(){
    this.zoom = 1; this.panX = 0; this.panY = 0;
    for(const [,s] of this.slides){
      const m = s.querySelector('.media');
      if(m) m.style.transform = '';
    }
  },
  applyZoom(anim){
    const m = this.el(); if(!m) return;
    m.style.transition = anim ? 'transform .22s ease-out' : 'none';
    m.style.transform = `translate3d(${this.panX}px,${this.panY}px,0) scale(${this.zoom})`;
  },
  clampPan(){
    const m = this.el(); if(!m) return;
    const r = m.getBoundingClientRect();
    const ow = r.width / this.zoom, oh = r.height / this.zoom;
    const mx = Math.max(0, (ow*this.zoom - window.innerWidth)/2);
    const my = Math.max(0, (oh*this.zoom - window.innerHeight)/2);
    this.panX = Math.max(-mx, Math.min(mx, this.panX));
    this.panY = Math.max(-my, Math.min(my, this.panY));
  },

  info(){
    const m = this.items()[this.idx];
    if(!m) return;
    $('count').textContent = `${this.idx+1} / ${this.items().length}`;
    $('fname').innerHTML = `${esc(m.name)} <i>&middot; ${m.w}×${m.h} &middot; ${bytes(m.size)}</i>`;
    $('mute').innerHTML = muted ? '&#128263;' : '&#128266;';

    const n = this.items().length, max = Math.min(n, Math.floor(window.innerWidth/9));
    let h = '';
    if(n > 1 && max > 1){
      const step = n / max;
      for(let i=0;i<max;i++){
        const at = Math.floor(i*step), nt = Math.floor((i+1)*step);
        h += `<span class="${this.idx>=at && this.idx<Math.max(nt,at+1) ? 'on':''}"></span>`;
      }
    }
    $('dots').innerHTML = h;
  },

  chrome(v){ this.show = v; $('chrome').classList.toggle('hide', !v); },

  toggleShow(){ if(this.slideT) this.stopShow(); else this.startShow(); },
  startShow(){
    $('play').classList.add('on'); $('play').innerHTML = '&#10074;&#10074;';
    const tick = ()=>{
      const m = this.items()[this.idx];
      let wait = 3500;
      if(m && m.video){
        const v = this.el();
        const d = v && isFinite(v.duration) ? v.duration*1000 : 6000;
        wait = Math.min(Math.max(d, 2000), 20000);
      }
      this.slideT = setTimeout(()=>{
        if(this.idx >= this.items().length-1){ this.idx = -1; }
        this.go(1); tick();
      }, wait);
    };
    tick();
    toast('Slideshow pornit');
  },
  stopShow(){
    clearTimeout(this.slideT); this.slideT = null;
    $('play').classList.remove('on'); $('play').innerHTML = '&#9654;';
  }
};

/* ---------------- gesturi ---------------- */
const track = $('track');

track.addEventListener('pointerdown', e => {
  V.pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(V.pts.size === 2){
    const [a,b] = [...V.pts.values()];
    V.pinch = { d:Math.hypot(a.x-b.x, a.y-b.y), z:V.zoom };
    V.drag = false; V.axis = null;
    return;
  }
  V.drag = true; V.axis = null;
  V.sx = e.clientX; V.sy = e.clientY; V.dx = 0; V.dy = 0; V.t0 = Date.now();
  V.stopShow();
});

track.addEventListener('pointermove', e => {
  if(!V.pts.has(e.pointerId)) return;
  V.pts.set(e.pointerId, {x:e.clientX, y:e.clientY});

  if(V.pinch && V.pts.size >= 2){
    const [a,b] = [...V.pts.values()];
    const d = Math.hypot(a.x-b.x, a.y-b.y);
    V.zoom = Math.max(1, Math.min(6, V.pinch.z * (d/V.pinch.d)));
    if(V.zoom === 1){ V.panX = 0; V.panY = 0; }
    V.clampPan(); V.applyZoom(false);
    return;
  }
  if(!V.drag) return;

  const dx = e.clientX - V.sx, dy = e.clientY - V.sy;

  if(V.zoom > 1){
    V.panX += e.movementX || dx - V.dx;
    V.panY += e.movementY || dy - V.dy;
    V.dx = dx; V.dy = dy;
    V.clampPan(); V.applyZoom(false);
    return;
  }
  if(!V.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)){
    V.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if(V.axis === 'x'){ V.dx = dx; V.dy = 0; V.place(false); }
  else if(V.axis === 'y'){ V.dy = Math.max(0, dy); V.dx = 0; V.place(false); }
});

function endPointer(e){
  V.pts.delete(e.pointerId);
  if(V.pts.size < 2) V.pinch = null;
  if(!V.drag){ if(V.pts.size === 0) V.drag = false; return; }
  if(V.pts.size > 0) return;
  V.drag = false;

  const dt = Date.now() - V.t0;
  const moved = Math.abs(V.dx) > 10 || Math.abs(V.dy) > 10;

  if(V.axis === 'y' && (V.dy > 110 || (V.dy > 45 && dt < 260))){ V.close(); return; }

  if(V.axis === 'x'){
    const thr = window.innerWidth * 0.22;
    const fast = dt < 280 && Math.abs(V.dx) > 45;
    if(V.dx <= -thr || (fast && V.dx < 0)) return V.go(1);
    if(V.dx >=  thr || (fast && V.dx > 0)) return V.go(-1);
  }

  if(!moved && !(e.target && e.target.closest('video'))){
    const now = Date.now();
    if(now - V.lastTap < 300){
      V.lastTap = 0;
      const m = V.el();
      if(m && m.tagName === 'IMG'){
        if(V.zoom > 1){ V.resetZoom(); V.applyZoom(true); }
        else{ V.zoom = 2.5; V.panX = 0; V.panY = 0; V.applyZoom(true); }
      }
    }else{
      V.lastTap = now;
      setTimeout(()=>{ if(V.lastTap && Date.now()-V.lastTap >= 290){ V.lastTap=0; V.chrome(!V.show); } }, 300);
    }
  }

  V.dx = 0; V.dy = 0; V.axis = null;
  V.place(true);
}
track.addEventListener('pointerup', endPointer);
track.addEventListener('pointercancel', endPointer);
track.addEventListener('dblclick', e => e.preventDefault());

$('viewer').addEventListener('wheel', e => {
  if(!V.on) return;
  e.preventDefault();
  if(e.ctrlKey){
    V.zoom = Math.max(1, Math.min(6, V.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    if(V.zoom === 1){ V.panX=0; V.panY=0; }
    V.clampPan(); V.applyZoom(false);
  }else if(V.zoom === 1){
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) V.go(e.deltaX > 0 ? 1 : -1);
  }else{
    V.panX -= e.deltaX; V.panY -= e.deltaY;
    V.clampPan(); V.applyZoom(false);
  }
}, {passive:false});

/* ---------------- butoane ---------------- */
const currentItem = () => V.items()[V.idx];

$('close').onclick = () => V.close();
$('navL').onclick  = () => V.go(-1);
$('navR').onclick  = () => V.go(1);
$('play').onclick  = () => V.toggleShow();
$('mute').onclick  = () => {
  muted = !muted; LS.set('muted', muted);
  const v = V.el(); if(v && v.tagName === 'VIDEO'){ v.muted = muted; if(!muted) v.play().catch(()=>{}); }
  V.info();
  toast(muted ? 'Sunet oprit' : 'Sunet pornit');
};
$('orig').onclick = () => {
  const m = currentItem(); if(m) window.open(m.url, '_blank', 'noopener');
};
$('save').onclick = () => {
  const m = currentItem(); if(!m) return;
  if(!localApi){
    // Fara server propriu, atributul download nu are efect cross-origin.
    // Pe iPhone: tine apasat pe poza -> "Add to Photos".
    window.open(m.url, '_blank', 'noopener');
    toast('Tine apasat pe poza pentru a o salva');
    return;
  }
  const a = document.createElement('a');
  a.href = `api/file?board=${m.board}&tim=${m.tim}&ext=${encodeURIComponent(m.ext)}` +
           `&name=${encodeURIComponent(m.name)}`;
  a.download = m.name;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Se descarca ' + m.name);
};
$('copy').onclick = async () => {
  const m = currentItem(); if(!m) return;
  try{ await navigator.clipboard.writeText(m.url); toast('Link copiat'); }
  catch(e){ toast(m.url); }
};

$('form').addEventListener('submit', e => {
  e.preventDefault();
  $('url').blur();
  const t = parseTarget($('url').value);
  if(!t){ toast('Link invalid. Ex: boards.4chan.org/g/thread/123 sau g/123'); return; }
  loadThread(t.board, t.thread);
});
$('reload').onclick = () => {
  if(cur){ loadThread(cur.board, cur.thread); toast('Se reincarca...'); }
};
[...$('chips').children].forEach(c => c.addEventListener('click', () => {
  filter = c.dataset.f; LS.set('filter', filter); applyFilter();
}));

document.addEventListener('keydown', e => {
  if(!V.on) return;
  const k = e.key;
  if(k === 'Escape') V.close();
  else if(k === 'ArrowRight' || k === ' ' || k === 'PageDown'){ e.preventDefault(); V.go(1); }
  else if(k === 'ArrowLeft' || k === 'PageUp'){ e.preventDefault(); V.go(-1); }
  else if(k === 'Home') V.go(-V.idx);
  else if(k === 'End') V.go(V.items().length-1-V.idx);
  else if(k.toLowerCase() === 'm') $('mute').click();
  else if(k.toLowerCase() === 's') $('save').click();
  else if(k.toLowerCase() === 'p') V.toggleShow();
  else if(k.toLowerCase() === 'f'){
    if(document.fullscreenElement) document.exitFullscreen();
    else if($('viewer').requestFullscreen) $('viewer').requestFullscreen();
  }
});

window.addEventListener('resize', () => { if(V.on){ V.place(false); V.info(); } });
window.addEventListener('hashchange', boot);

/* ---------------- pornire ---------------- */
function boot(){
  const m = location.hash.match(/^#\/([a-zA-Z0-9]+)\/(\d+)/);
  if(m && (!cur || cur.board !== m[1] || cur.thread !== m[2])) loadThread(m[1], m[2]);
  else if(!m && !cur) renderHome();
}

if('serviceWorker' in navigator && location.protocol === 'https:'){
  window.addEventListener('load', ()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

boot();
