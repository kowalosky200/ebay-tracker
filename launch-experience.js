/* RETRADE cold-start / wake coordinator v1.4.61
 *
 * Launch principle: the real application is already there and quietly wakes up.
 * The startup path therefore favours one coordinated page-level handoff over
 * dozens of independent value/chart animations.
 *
 * Performance changes in this pass:
 * - no 8ms polling loop while the 1.6MB core is downloading/evaluating
 * - no per-value/per-chart hydration animations competing on the first frame
 * - shorter presentation-only boot floor (~90ms instead of the legacy 440ms)
 * - static child cache is warmed only AFTER the app is awake/idle
 * - local-only first-paint/long-task diagnostics are retained
 *
 * No accounting, lifecycle, sync writes, auth state, forecast maths or Supabase
 * schema/data is changed by this file.
 */
(function(){
  'use strict';

  var VERSION='20260909-v1461';
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
  var warmScheduled=false;

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
  perf.bootHoldPatched=false;

  function stamp(){return ((window.performance&&performance.now)?performance.now():Date.now())-t0;}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }

  function installStyles(){
    var old=document.getElementById('rt-launch-experience-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-launch-experience-css';
    s.textContent='\
@keyframes rtWakeSheen{0%{background-position:185% 0}100%{background-position:-85% 0}}\
@keyframes rtWakePulse{from{opacity:.48}to{opacity:.76}}\
@keyframes rtWakePage{0%{opacity:.965;transform:translate3d(0,2px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}\
html.rt-app-cold .page.on{animation:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-label-loading{color:inherit!important;text-shadow:inherit!important;background:none!important;overflow:visible!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-label-loading::after{display:none!important;animation:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-data-loading,html.rt-app-cold body.rt-real-layout-loading .rt-loading-line{animation:none!important;background:color-mix(in srgb,var(--surface2) 72%,var(--border))!important;background-image:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-chart-loading::after,html.rt-app-cold body.rt-real-layout-loading .cat-donut-chart::before,html.rt-app-cold body.rt-real-layout-loading .cat-donut-legend::before{animation:none!important;}\
html.rt-app-cold body.rt-real-layout-loading .rt-chart-loading::after{opacity:.30!important;background:linear-gradient(110deg,transparent 20%,color-mix(in srgb,var(--border) 34%,transparent) 48%,transparent 76%)!important;background-size:220% 100%!important;}\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .rt-data-loading,html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .rt-loading-line{background:linear-gradient(90deg,color-mix(in srgb,var(--surface2) 80%,var(--border)) 0%,color-mix(in srgb,var(--border) 78%,var(--surface2)) 47%,color-mix(in srgb,var(--surface2) 80%,var(--border)) 100%)!important;background-size:220% 100%!important;animation:rtWakeSheen 2.0s cubic-bezier(.4,0,.2,1) infinite!important;}\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .rt-chart-loading::after{animation:rtWakeSheen 2.15s cubic-bezier(.4,0,.2,1) infinite!important;opacity:.42!important;}\
html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .cat-donut-chart::before,html.rt-app-cold body.rt-launch-long.rt-real-layout-loading .cat-donut-legend::before{animation:rtWakePulse 1.7s ease-in-out infinite alternate!important;}\
/* One composited wake for the page. Do not animate every KPI/value/chart child. */\
body.rt-launch-waking.rt-real-layout-revealing .page.on{animation:rtWakePage 220ms cubic-bezier(.22,.61,.36,1) both!important;}\
body.rt-launch-waking.rt-real-layout-revealing .rt-data-reveal,body.rt-launch-waking.rt-real-layout-revealing .rt-chart-reveal{filter:none!important;animation:none!important;transform:none!important;}\
body.rt-launch-waking.rt-real-layout-revealing .rt-loading-overlay-exit{transition:opacity 160ms cubic-bezier(.22,.61,.36,1)!important;}\
html.rt-app-cold #fab-dial,html.rt-app-cold #search-fab{transition:none!important;}\
@media(prefers-reduced-motion:reduce){\
 html.rt-app-cold body.rt-real-layout-loading .rt-data-loading,html.rt-app-cold body.rt-real-layout-loading .rt-loading-line,html.rt-app-cold body.rt-real-layout-loading .rt-chart-loading::after,html.rt-app-cold body.rt-real-layout-loading .cat-donut-chart::before,html.rt-app-cold body.rt-real-layout-loading .cat-donut-legend::before{animation:none!important;}\
 body.rt-launch-waking.rt-real-layout-revealing .page.on{animation:none!important;transform:none!important;opacity:1!important;}\
 body.rt-launch-waking.rt-real-layout-revealing .rt-loading-overlay-exit{transition:none!important;opacity:0!important;}\
}\
';
    document.head.appendChild(s);
  }
  installStyles();

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
  function scheduleStaticWarm(){
    if(warmScheduled)return;warmScheduled=true;
    var run=function(){
      try{
        if(!('serviceWorker' in navigator))return;
        navigator.serviceWorker.ready.then(function(reg){
          try{if(reg&&reg.active)reg.active.postMessage({type:'RT_WARM_STATIC',build:VERSION});}catch(_){}
        }).catch(function(){});
      }catch(_){}
    };
    try{
      if('requestIdleCallback' in window){requestIdleCallback(run,{timeout:1800});return;}
    }catch(_){}
    setTimeout(run,850);
  }
  function beginLoading(body){
    if(loadingSeen)return;
    loadingSeen=true;perf.shellAt=stamp();body.classList.add('rt-launch-shell');
    clearLongTimer();
    if(!reducedMotion()){
      longTimer=setTimeout(function(){
        longTimer=0;
        if(body.classList.contains('rt-real-layout-loading')&&!readySeen){body.classList.add('rt-launch-long');perf.loaderLongPhase=true;}
      },260);
    }
  }
  function beginReveal(body){
    if(revealingSeen)return;
    revealingSeen=true;perf.revealAt=stamp();clearLongTimer();
    body.classList.remove('rt-launch-long');body.classList.add('rt-launch-waking');
  }
  function finishWake(body){
    if(readySeen)return;
    readySeen=true;perf.readyAt=stamp();clearLongTimer();body.classList.remove('rt-launch-long','rt-launch-shell');
    if(releaseTimer)clearTimeout(releaseTimer);
    releaseTimer=setTimeout(function(){
      body.classList.remove('rt-launch-waking');root.classList.remove('rt-app-cold');root.classList.add('rt-app-awake');releaseTimer=0;scheduleStaticWarm();
    },reducedMotion()?0:235);
  }
  function inspectBody(body){
    if(!body)return;
    var loading=body.classList.contains('rt-real-layout-loading');
    var revealing=body.classList.contains('rt-real-layout-revealing');
    if(loading&&!lastLoading)beginLoading(body);
    if(revealing&&!lastRevealing)beginReveal(body);
    if(!loading&&lastLoading)finishWake(body);
    lastLoading=loading;lastRevealing=revealing;
  }
  function observeBody(){
    var body=document.body;
    if(!body){requestAnimationFrame(observeBody);return;}
    inspectBody(body);
    try{bodyObserver=new MutationObserver(function(){inspectBody(body);});bodyObserver.observe(body,{attributes:true,attributeFilter:['class']});}catch(_){}
    setTimeout(function(){if(!loadingSeen&&!readySeen){readySeen=true;root.classList.remove('rt-app-cold');root.classList.add('rt-app-awake');scheduleStaticWarm();}},4200);
  }
  observeBody();

  /* Called exactly once by app.js after app-core has evaluated. This replaces
     the previous 8ms polling loop that could wake hundreds of times while the
     large core was still being fetched/compiled. */
  window.__rtInstallLaunchCoreHooks=function(){
    try{
      if(typeof finishRealLayoutLoading!=='function'||finishRealLayoutLoading.__rtWakeWrapped)return !!(finishRealLayoutLoading&&finishRealLayoutLoading.__rtWakeWrapped);
      var baseFinish=finishRealLayoutLoading;
      var wrapped=function(tab){
        try{
          if(typeof _realLayoutLoadingStartedAt!=='undefined'&&_realLayoutLoadingStartedAt){
            var n=(window.performance&&performance.now)?performance.now():Date.now();
            var elapsed=Math.max(0,n-_realLayoutLoadingStartedAt);
            var desiredRemaining=Math.max(0,90-elapsed);
            _realLayoutLoadingStartedAt=n-(440-desiredRemaining);
          }
        }catch(_){}
        return baseFinish.apply(this,arguments);
      };
      wrapped.__rtWakeWrapped=true;finishRealLayoutLoading=wrapped;perf.bootHoldPatched=true;return true;
    }catch(_){return false;}
  };
})();
