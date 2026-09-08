/* RETRADE persistent bottom action shell.
 *
 * The bottom navigation + centre FAB are application chrome, not page content.
 * They stay mounted and visible while pages, panels and filters change. Page-
 * specific FAB actions may change, but the shell itself must never blink, slide
 * away on scroll, or enter a temporary hidden state during route handoff.
 *
 * UI-only: no item/accounting/lifecycle/persistence behaviour lives here.
 */
(function(){
  'use strict';

  if(window.__RT_FAB_SYSTEM)return;
  var BUILD='20260908-fab-system-3';
  var repairing=false;

  var nativeOptions=(typeof _fabOptionsForPage==='function')?_fabOptionsForPage:null;
  var universal;
  try{
    universal=(typeof _FAB_ALL_OPTIONS!=='undefined'&&Array.isArray(_FAB_ALL_OPTIONS))
      ?_FAB_ALL_OPTIONS.slice()
      :['list','sourced','sourcerun','expense','trip'];
  }catch(_e){
    universal=['list','sourced','sourcerun','expense','trip'];
  }

  /* Read-only/history routes used to deliberately hide the FAB. They now inherit
     the universal launcher instead, so the bottom shell never changes shape. */
  try{
    if(typeof _FAB_HIDDEN_PAGES!=='undefined'&&_FAB_HIDDEN_PAGES&&typeof _FAB_HIDDEN_PAGES.clear==='function'){
      _FAB_HIDDEN_PAGES.clear();
    }
  }catch(_e2){}

  function fallback(){return universal.slice();}

  if(nativeOptions){
    _fabOptionsForPage=function(pageId){
      var options=[];
      try{options=nativeOptions.call(this,pageId)||[];}catch(_e){}
      if(Array.isArray(options)&&options.length)return options.slice();
      /* Includes the synchronous old-page-off -> new-page-on handoff. */
      return fallback();
    };
  }

  function appShellIsAvailable(){
    var dial=document.getElementById('fab-dial');
    if(!dial)return false;
    /* Authentication deliberately uses display:none. Do not surface app chrome
       before the user has entered the application. */
    if(dial.style.display==='none')return false;
    return true;
  }

  function clearPresentationHide(el){
    if(!el)return;
    if(el.__rtFabHideTimer){
      clearTimeout(el.__rtFabHideTimer);
      el.__rtFabHideTimer=0;
    }
    el.classList.remove('rt-fab-motion-hidden');
    if(el.style.visibility==='hidden')el.style.visibility='';
    if(el.style.opacity==='0')el.style.opacity='';
    el.removeAttribute('aria-hidden');
  }

  function keepShellVisible(){
    if(repairing)return;
    repairing=true;
    try{
      var nav=document.getElementById('bottom-nav');
      if(nav){
        /* Do not fight the legacy scroll handler by repeatedly removing its
           nav-hidden state. CSS below makes that state visually inert, so active
           scrolling stays free of MutationObserver/classList ping-pong. */
        if(nav.style.visibility==='hidden')nav.style.visibility='';
        if(nav.style.opacity==='0')nav.style.opacity='';
        nav.removeAttribute('aria-hidden');
      }

      if(appShellIsAvailable()){
        clearPresentationHide(document.getElementById('fab-dial'));
        clearPresentationHide(document.getElementById('search-fab'));
      }
    }finally{
      repairing=false;
    }
  }

  /* Neutralise the legacy CSS route that translated the entire mobile shell off
     screen whenever #bottom-nav acquired .nav-hidden. We intentionally do NOT
     force display:block: desktop/auth layouts keep their existing display rules. */
  if(!document.getElementById('rt-persistent-bottom-shell')){
    var style=document.createElement('style');
    style.id='rt-persistent-bottom-shell';
    style.textContent=[
      '@media(max-width:999px){',
      '#bottom-nav.nav-hidden{transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      'body:has(#bottom-nav.nav-hidden) #fab-dial,body:has(#bottom-nav.nav-hidden) .fab-dial{transform:translateX(-50%)!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      'body:has(#bottom-nav.nav-hidden) #search-fab{transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      '#fab-dial.rt-fab-motion-hidden{opacity:1!important;scale:1!important;visibility:visible!important;pointer-events:auto!important}',
      '}',
      '@media(prefers-reduced-motion:reduce){#bottom-nav,#fab-dial,#search-fab{transition:none!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  /* motion-system used to own FAB visibility. At this point the design contract is
     stronger: signed-in app chrome is always present, so a visibility sync only
     repairs the shell. Context-specific options are still resolved when the FAB
     is opened through _fabOptionsForPage(). This removes the hide -> rAF -> show
     cycle entirely rather than trying to make that cycle faster. */
  try{
    if(typeof _syncFabVisibility==='function'){
      _syncFabVisibility=function(){keepShellVisible();};
    }
  }catch(_e3){}

  keepShellVisible();
  requestAnimationFrame(keepShellVisible);

  /* Observe only direct presentation mutations on the persistent controls. Do
     not observe bottom-nav class changes: scroll code may toggle nav-hidden and
     the CSS override already makes that zero-cost visually. */
  function watch(el,attrs){
    if(!el)return;
    var obs=new MutationObserver(function(){keepShellVisible();});
    obs.observe(el,{attributes:true,attributeFilter:attrs});
  }
  watch(document.getElementById('bottom-nav'),['style','aria-hidden']);
  watch(document.getElementById('fab-dial'),['class','style','aria-hidden']);
  watch(document.getElementById('search-fab'),['class','style','aria-hidden']);

  window.addEventListener('pageshow',keepShellVisible);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible')keepShellVisible();
  });

  window.__RT_FAB_SYSTEM={
    build:BUILD,
    universal:function(){return fallback();},
    repair:keepShellVisible
  };
  console.info('[RETRADE] persistent bottom action shell loaded',BUILD);
})();
