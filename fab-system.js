/* RETRADE persistent bottom action shell.
 *
 * The bottom navigation + centre FAB are application chrome, not page content.
 * They stay mounted across route changes, while the existing intentional
 * scroll-down collapse remains available on mobile. Route handoff must never be
 * mistaken for user scrolling: page changes keep the shell visible; a genuine
 * later downward scroll may collapse it again.
 *
 * UI-only: no item/accounting/lifecycle/persistence behaviour lives here.
 */
(function(){
  'use strict';

  if(window.__RT_FAB_SYSTEM)return;
  var BUILD='20260908-fab-system-4';
  var repairing=false;
  var routeTimer=0;

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
     the universal launcher instead, so route context never removes app chrome. */
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

  function keepShellMounted(){
    if(repairing)return;
    repairing=true;
    try{
      var nav=document.getElementById('bottom-nav');
      if(nav){
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

  /* Route changes often reset/restore scroll position. The legacy scroll handler
     can interpret that synthetic movement as a downward scroll and add nav-hidden
     during the same handoff, creating the one-frame blink. Protect only the short
     route transaction. At the end we clear nav-hidden once more; from then on the
     next real user scroll is free to collapse the shell normally. */
  function beginRouteHandoff(){
    var body=document.body;
    var nav=document.getElementById('bottom-nav');
    if(!body||!nav)return;
    body.classList.add('rt-bottom-route-handoff');
    nav.classList.remove('nav-hidden');
    keepShellMounted();
    if(routeTimer)clearTimeout(routeTimer);
    routeTimer=setTimeout(function(){
      routeTimer=0;
      var current=document.getElementById('bottom-nav');
      if(current)current.classList.remove('nav-hidden');
      document.body.classList.remove('rt-bottom-route-handoff');
    },220);
  }

  /* Keep the original scroll collapse, but neutralise it only while a page route
     is being committed. No scroll listener or polling is added here: the existing
     nav-hidden class remains the single scroll-direction signal. */
  if(!document.getElementById('rt-persistent-bottom-shell')){
    var style=document.createElement('style');
    style.id='rt-persistent-bottom-shell';
    style.textContent=[
      '@media(max-width:999px){',
      'body:not(.rt-bottom-route-handoff):has(#bottom-nav.nav-hidden) #bottom-nav{transform:translateY(110%)!important;opacity:0!important;pointer-events:none!important}',
      'body:not(.rt-bottom-route-handoff):has(#bottom-nav.nav-hidden) #fab-dial,body:not(.rt-bottom-route-handoff):has(#bottom-nav.nav-hidden) .fab-dial{transform:translateX(-50%) translateY(150%)!important;opacity:0!important;pointer-events:none!important}',
      'body:not(.rt-bottom-route-handoff):has(#bottom-nav.nav-hidden) #search-fab{transform:translateY(150%)!important;opacity:0!important;pointer-events:none!important}',
      'body.rt-bottom-route-handoff #bottom-nav{transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      'body.rt-bottom-route-handoff #fab-dial,body.rt-bottom-route-handoff .fab-dial{transform:translateX(-50%)!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      'body.rt-bottom-route-handoff #search-fab{transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      'body.rt-bottom-route-handoff #fab-dial.rt-fab-motion-hidden{opacity:1!important;scale:1!important;visibility:visible!important;pointer-events:auto!important}',
      '}',
      '@media(prefers-reduced-motion:reduce){#bottom-nav,#fab-dial,#search-fab{transition:none!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  /* motion-system used to own page-based FAB visibility. Signed-in routes always
     have a FAB now; the visibility helper merely repairs stale presentation state.
     Scroll collapse is separate and continues to be represented by nav-hidden. */
  try{
    if(typeof _syncFabVisibility==='function'){
      _syncFabVisibility=function(){keepShellMounted();};
    }
  }catch(_e3){}

  /* Start the route guard before ordinary click handlers can reset scroll or swap
     pages. This covers bottom-nav taps, More-sheet destinations and data-tab links.
     Programmatic routes are also covered by wrapping the common route functions
     when they exist. */
  document.addEventListener('pointerdown',function(e){
    var target=e.target&&e.target.closest?e.target.closest('#bottom-nav button,[data-tab],#more-sheet .more-sheet-row'):null;
    if(target)beginRouteHandoff();
  },true);

  ['goToTab','activatePage','openItemPage','openAccountPage'].forEach(function(name){
    try{
      var base=window[name];
      if(typeof base!=='function'||base._rtBottomShellRouteWrapped)return;
      var wrapped=function(){
        beginRouteHandoff();
        return base.apply(this,arguments);
      };
      wrapped._rtBottomShellRouteWrapped=true;
      window[name]=wrapped;
    }catch(_e){}
  });

  keepShellMounted();
  requestAnimationFrame(keepShellMounted);

  /* Observe only direct stale presentation mutations. Do not observe bottom-nav
     class changes: user scroll intentionally toggles nav-hidden. */
  function watch(el,attrs){
    if(!el)return;
    var obs=new MutationObserver(function(){keepShellMounted();});
    obs.observe(el,{attributes:true,attributeFilter:attrs});
  }
  watch(document.getElementById('bottom-nav'),['style','aria-hidden']);
  watch(document.getElementById('fab-dial'),['class','style','aria-hidden']);
  watch(document.getElementById('search-fab'),['class','style','aria-hidden']);

  window.addEventListener('pageshow',keepShellMounted);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible')keepShellMounted();
  });

  window.__RT_FAB_SYSTEM={
    build:BUILD,
    universal:function(){return fallback();},
    repair:keepShellMounted,
    routeHandoff:beginRouteHandoff
  };
  console.info('[RETRADE] persistent bottom action shell loaded',BUILD);
})();
