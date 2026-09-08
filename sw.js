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

function requestURL(request){
  try{return new URL(request.url);}catch(_){return null;}
}

function isImmutableRuntime(request){
  if(request.method!=='GET')return false;
  const url=requestURL(request);
  if(!url||url.origin!==self.location.origin)return false;
  if(!/\.js$/i.test(url.pathname))return false;
  return /^[a-f0-9]{8}$/i.test(url.searchParams.get('v')||'');
}

function isMutableEntrypoint(request){
  const url=requestURL(request);
  return !!(url&&url.origin===self.location.origin&&/\/app\.js$/i.test(url.pathname));
}

async function planRuntime(request){
  const cache=await caches.open(RUNTIME_CACHE);
  const cached=await cache.match(request);
  if(cached)return {response:cached,settle:Promise.resolve()};

  const response=await fetch(request);
  if(!response||!response.ok)return {response,settle:Promise.resolve()};

  const copy=response.clone();
  // Cache work runs under fetch-event waitUntil, not on the response path. The
  // user gets the network response as soon as it arrives while the immutable copy
  // is stored in the background for the next launch.
  const settle=(async()=>{
    const wanted=new URL(request.url);
    const keys=await cache.keys();
    await Promise.all(keys.map(key=>{
      const prior=new URL(key.url);
      return prior.pathname===wanted.pathname&&prior.href!==wanted.href?cache.delete(key):Promise.resolve(false);
    }));
    await cache.put(request,copy);
  })();

  return {response,settle};
}

self.addEventListener('fetch', event => {
  if(event.request.method!=='GET')return;

  if(isImmutableRuntime(event.request)){
    const plan=planRuntime(event.request);
    // Both hooks are registered synchronously while the ExtendableEvent is live.
    // The response does not wait for the background CacheStorage write.
    event.respondWith(plan.then(result=>result.response));
    event.waitUntil(plan.then(result=>result.settle));
    return;
  }

  if(isMutableEntrypoint(event.request)){
    // app.js is tiny and owns the content hashes above. Always revalidate it so a
    // deploy changes runtime URLs immediately instead of waiting on a browser TTL;
    // an unchanged file can still complete cheaply with normal HTTP validation.
    event.respondWith(fetch(event.request,{cache:'no-cache'}));
    return;
  }

  // Everything else mutable stays network-first. Browser HTTP caching may still
  // revalidate efficiently, but RETRADE never serves Supabase/data from this cache.
  event.respondWith(fetch(event.request));
});
