// RETRADE service worker — immutable app-child cache v20260909-v1460.
//
// Safety model:
// - navigation HTML, app.js, CSS, Supabase/auth/data and all cross-origin requests
//   stay network-owned;
// - only same-origin child scripts carrying this exact build query are cached;
// - a new build query can never receive a script from an older cache;
// - install failures are non-fatal so offline/cache work never blocks the app.
const BUILD='20260909-v1460';
const CACHE_PREFIX='retrade-static-';
const CACHE_NAME=CACHE_PREFIX+BUILD;
const CHILD_SCRIPTS=[
  'launch-experience.js',
  'app-core.js',
  'bundle-orders.js',
  'bundle-panel.js',
  'bundle-row-polish.js',
  'cashflow-liabilities.js',
  'performance-system.js',
  'sales-defaults.js',
  'partner-item-navigation.js',
  'chart-polish.js',
  'chart-motion.js',
  'chart-finalize.js',
  'chart-reveal.js',
  'sales-forecast-gate.js',
  'chart-line-motion.js',
  'chart-forecast-sequence.js',
  'motion-system.js'
];
const CHILD_SET=new Set(CHILD_SCRIPTS);

function buildUrl(name){return new URL('./'+name+'?v='+BUILD,self.registration.scope).href;}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE_NAME);
      await Promise.allSettled(CHILD_SCRIPTS.map(async name=>{
        const url=buildUrl(name);
        try{
          /* These exact URLs were normally fetched moments earlier by the page.
             Let the browser reuse its HTTP/memory cache instead of forcing a
             second network burst immediately after first launch. */
          const response=await fetch(new Request(url,{credentials:'same-origin'}));
          if(response&&response.ok)await cache.put(url,response.clone());
        }catch(_){/* Network launch remains authoritative. */}
      }));
    }catch(_){/* Cache API failure must never prevent activation. */}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));
    }catch(_){}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(!request||request.method!=='GET')return;

  let url;
  try{url=new URL(request.url);}catch(_){return;}
  if(url.origin!==self.location.origin)return;
  if(request.destination!=='script')return;
  if(url.searchParams.get('v')!==BUILD)return;

  const name=url.pathname.split('/').pop()||'';
  if(!CHILD_SET.has(name))return;

  event.respondWith((async()=>{
    try{
      const cache=await caches.open(CACHE_NAME);
      const hit=await cache.match(request,{ignoreSearch:false});
      if(hit)return hit;
      const response=await fetch(request);
      if(response&&response.ok){try{await cache.put(request,response.clone());}catch(_){}}
      return response;
    }catch(_){
      return fetch(request);
    }
  })());
});
