// RETRADE service worker — fresh shell/data, immutable runtime cache.
//
// index/app.js/API traffic remains network-first so deployments and Supabase data
// can never be hidden behind an application cache. app.js gives the large runtime
// scripts their actual Git blob prefix as ?v=xxxxxxxx; those URLs are immutable by
// definition and are therefore safe to serve cache-first on repeat launches.
const RUNTIME_CACHE='retrade-runtime-hashed-v1';

self.addEventListener('install', event => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names
      .filter(name=>name.startsWith('retrade-runtime-hashed-')&&name!==RUNTIME_CACHE)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

function isImmutableRuntime(request){
  if(request.method!=='GET')return false;
  let url;
  try{url=new URL(request.url);}catch(_){return false;}
  if(url.origin!==self.location.origin)return false;
  if(!/\.js$/i.test(url.pathname))return false;
  return /^[a-f0-9]{8}$/i.test(url.searchParams.get('v')||'');
}

async function cacheRuntime(event){
  const request=event.request;
  const cache=await caches.open(RUNTIME_CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;

  const response=await fetch(request);
  if(!response||!response.ok)return response;

  const copy=response.clone();
  // Keep only the newest content-hashed version of each runtime pathname so a
  // long-lived phone installation cannot accumulate old multi-megabyte bundles.
  event.waitUntil((async()=>{
    const wanted=new URL(request.url);
    const keys=await cache.keys();
    await Promise.all(keys.map(key=>{
      const prior=new URL(key.url);
      return prior.pathname===wanted.pathname&&prior.href!==wanted.href?cache.delete(key):Promise.resolve(false);
    }));
    await cache.put(request,copy);
  })());
  return response;
}

self.addEventListener('fetch', event => {
  if(event.request.method!=='GET')return;
  if(isImmutableRuntime(event.request)){
    event.respondWith(cacheRuntime(event));
    return;
  }
  // Everything mutable stays network-first. Browser HTTP caching may still
  // revalidate efficiently, but RETRADE never serves stale HTML, app.js or data.
  event.respondWith(fetch(event.request));
});
