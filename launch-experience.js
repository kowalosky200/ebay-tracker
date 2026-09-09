/* RETRADE cold-start / wake coordinator v1.4.59
 *
 * Goals:
 * - show the real RETRADE layout as the launch surface; never a separate splash
 * - keep chrome + labels stable while only dynamic data is pending
 * - avoid a shimmer flash on fast loads; motion begins only if loading persists
 * - replace many blurred element reveals with one calm, coordinated wake-up
 * - shorten the artificial minimum boot hold without changing cloud/data safety
 * - keep privacy-safe, local-only startup timing diagnostics for performance work
 *
 * No accounting, lifecycle, sync writes, auth state, forecast maths or Supabase
 * schema/data is changed by this file.
 */
(function(){
  'use strict';

  var VERSION='20260909-v1459';
  var root=document.documentElement;
  var t0=(window.performance&&performance.now)?performance.now():Date.now();
  var bodyObserver=null;
  var longTimer=0;
  var releaseTimer=0;
  var loadingSeen=false;
  var revealingSeen=false;
  var readySeen=false;
  var lastLoading=false;
  var lastRevealing=false;

  root.classList.add('rt-app-cold');

  var perf=window.__rtLaunchPerf=window.__rtLaunchPerf||{};
  perf.version=VERSION;
  perf.startedAt=t0;
  perf.shellAt=null;
  perf.revealAt=null;
  perf.readyAt=null;
  perf.fcp=null;
  perf.longTasks=0;
  perf.longTaskMs=0;
  perf.loaderLongPhase=false;

  function stamp(){return ((window.performance&&performance.now)?performance.now():Date.now())-t0;}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }

  function installStyles(){
    if(document.getElementById('rt-launch-experience-css'))return;
    var s=document.createElement('style');
    s.id='rt-launch-experience-css';
    s.textContent='\
@keyframes rtWakeSheen{0%{background-position:185% 0}100%{background-position:-85% 0}}\
@keyframes rtWakePulse{from{opacity:.48}to{opacity:.76}}\
@keyframes rtWakePage{0%{opacity:.94;transform:translate3d(0,3px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}\
@keyframes rtWakeValue{0%{opacity:.34;transform:translate3d(0,1px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}\
@keyframes rtWakeChart{0%{opacity:.10;transform:translate3d(0,2px,0) scale(.9985)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}\
html.rt-app-cold .page.on{animation:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-label-loading{color:inherit!important;text-shadow:inherit!important;background:none!important;overflow:visible!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-label-loading::after{display:none!important;animation:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-data-loading,\
html.rt-app-cold body.rt-real-layout-loading .rt-loading-line{animation:none!important;background:color-mix(in srgb,var(--surface2) 72%,var(--border))!important;background-image:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-chart-loading::after,\
html.rt-app-cold body.rt-real-layout-loading .cat-donut-chart::before,\
html.rt-app-cold body.rt-real-layout-loading .cat-donut-legend::before{animation:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-chart-loading::after{opacity:.36!important;background:linear-gradient(110deg,transparent 20%,color-mix(in srgb,var(--border) 38%,transparent) 48%,transparent 76%)!important;background-size:220% 100%!important;}\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .rt-data-loading,\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .rt-loading-line{background:linear-gradient(90deg,color-mix(in srgb,var(--surface2) 78%,var(--border)) 0%,color-mix(in srgb,var(--border) 82%,var(--surface2)) 47%,color-mix(in srgb,var(--surface2) 78%,var(--border)) 100%)!important;background-size:220% 100%!important;animation:rtWakeSheen 1.85s cubic-bezier(.4,0,.2,1) infinite!important;}\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .rt-chart-loading::after{animation:rtWakeSheen 2.05s cubic-bezier(.4,0,.2,1) infinite!important;opacity:.48!important;}\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .cat-donut-chart::before,\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .cat-donut-legend::before{animation:rtWakePulse 1.55s ease-in-out infinite alternate!important;}\
body.rt-launch-waking.rt-real-layout-revealing .page.on{animation:rtWakePage 300ms cubic-bezier(.22,.61,.36,1) both!important;}\
body.rt-launch-waking.rt-real-layout-revealing .rt-data-reveal{filter:none!important;animation:rtWakeValue 220ms cubic-bezier(.22,.61,.36,1) both!important;}\
body.rt-launch-waking.rt-real-layout-revealing .rt-chart-reveal{filter:none!important;animation:rtWakeChart 300ms cubic-bezier(.22,.61,.36,1) both!important;}\
body.rt-launch-waking.rt-real-layout-revealing .rt-loading-overlay-exit{transition:opacity 220ms cubic-bezier(.22,.61,.36,1)!important;}\
html.rt-app-cold #fab-dial,html.rt-app-cold #search-fab{transition:none!important;}\
@media(prefers-reduced-motion:reduce){\
 html.rt-app-cold body.rt-real-layout-loading .rt-data-loading,html.rt-app-cold body.rt-real-layout-loading .rt-loading-line,html.rt-app-cold body.rt-real-layout-loading .rt-chart-loading::after,html.rt-app-cold body.rt-real-layout-loading .cat-donut-chart::before,html.rt-app-cold body.rt-real-layout-loading .cat-donut-legend::before{animation:none!important;}\
 body.rt-launch-waking.rt-real-layout-revealing .page.on,body.rt-launch-waking.rt-real-layout-revealing .rt-data-reveal,body.rt-launch-waking.rt-real-layout-revealing .rt-chart-reveal{animation:none!important;filter:none!important;transform:none!important;opacity:1!important;}\
 body.rt-launch-waking.rt-real-layout-revealing .rt-loading-overlay-exit{transition:none!important;opacity:0!important;}\
}\
';
    document.head.appendChild(s);
  }
  installStyles();

  /* Startup timing stays on-device only. This is for diagnosis from DevTools;
     nothing is transmitted anywhere. */
  try{
    if('PerformanceObserver' in window){
      try{
        var paintObserver=new PerformanceObserver(function(list){
          list.getEntries().forEach(function(e){if(e.name==='first-contentful-paint'&&perf.fcp==null)perf.fcp=e.startTime;});
        });
        paintObserver.observe({type:'paint',buffered:true});
      }catch(_){}
      try{
        var longObserver=new PerformanceObserver(function(list){
          if(readySeen)return;
          list.getEntries().forEach(function(e){perf.longTasks++;perf.longTaskMs+=Number(e.duration)||0;});
        });
        longObserver.observe({type:'longtask',buffered:true});
      }catch(_){}
    }
  }catch(_){}

  function clearLongTimer(){if(longTimer){clearTimeout(longTimer);longTimer=0;}}
  function beginLoading(body){
    if(loadingSeen)return;
    loadingSeen=true;
    perf.shellAt=stamp();
    body.classList.add('rt-launch-shell');
    clearLongTimer();
    if(!reducedMotion()){
      longTimer=setTimeout(function(){
        longTimer=0;
        if(body.classList.contains('rt-real-layout-loading')&&!readySeen){
          body.classList.add('rt-launch-long');
          perf.loaderLongPhase=true;
        }
      },240);
    }
  }
  function beginReveal(body){
    if(revealingSeen)return;
    revealingSeen=true;
    perf.revealAt=stamp();
    clearLongTimer();
    body.classList.remove('rt-launch-long');
    body.classList.add('rt-launch-waking');
  }
  function finishWake(body){
    if(readySeen)return;
    readySeen=true;
    perf.readyAt=stamp();
    clearLongTimer();
    body.classList.remove('rt-launch-long','rt-launch-shell');
    if(releaseTimer)clearTimeout(releaseTimer);
    releaseTimer=setTimeout(function(){
      body.classList.remove('rt-launch-waking');
      root.classList.remove('rt-app-cold');
      root.classList.add('rt-app-awake');
      releaseTimer=0;
    },reducedMotion()?0:340);
  }
  function inspectBody(body){
    if(!body)return;
    var loading=body.classList.contains('rt-real-layout-loading');
    var revealing=body.classList.contains('rt-real-layout-revealing');
    if(loading&&!lastLoading)beginLoading(body);
    if(revealing&&!lastRevealing)beginReveal(body);
    if(!loading&&lastLoading)finishWake(body);
    lastLoading=loading;
    lastRevealing=revealing;
  }
  function observeBody(){
    var body=document.body;
    if(!body){requestAnimationFrame(observeBody);return;}
    inspectBody(body);
    try{
      bodyObserver=new MutationObserver(function(){inspectBody(body);});
      bodyObserver.observe(body,{attributes:true,attributeFilter:['class']});
    }catch(_){}
    /* Auth/login or an unexpected boot path must never leave cold-start styling
       armed forever. */
    setTimeout(function(){if(!loadingSeen&&!readySeen){readySeen=true;root.classList.remove('rt-app-cold');root.classList.add('rt-app-awake');}},4500);
  }
  observeBody();

  /* app-core intentionally kept a 440ms minimum skeleton duration to prevent a
     flash. The launch coordinator now solves that flash structurally: fast loads
     remain still and only long loads shimmer. Reduce the artificial floor to
     ~180ms, while leaving real network time untouched. */
  (function patchBootHold(attempt){
    attempt=attempt||0;
    try{
      if(typeof finishRealLayoutLoading==='function'&&!finishRealLayoutLoading.__rtWakeWrapped){
        var baseFinish=finishRealLayoutLoading;
        var wrapped=function(tab){
          try{
            if(typeof _realLayoutLoadingStartedAt!=='undefined'&&_realLayoutLoadingStartedAt){
              var n=(window.performance&&performance.now)?performance.now():Date.now();
              var elapsed=Math.max(0,n-_realLayoutLoadingStartedAt);
              var desiredRemaining=Math.max(0,180-elapsed);
              /* app-core's current floor is 440ms. Rebase only the presentation
                 clock; cloud loading and all data work remain untouched. */
              _realLayoutLoadingStartedAt=n-(440-desiredRemaining);
            }
          }catch(_){}
          return baseFinish.apply(this,arguments);
        };
        wrapped.__rtWakeWrapped=true;
        finishRealLayoutLoading=wrapped;
        perf.bootHoldPatched=true;
        return;
      }
    }catch(_){}
    if(attempt<260)setTimeout(function(){patchBootHold(attempt+1);},8);
  })(0);
})();
