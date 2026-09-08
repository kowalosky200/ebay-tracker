/* RETRADE persistent bottom action shell.
 *
 * The bottom navigation + centre FAB are application chrome. They stay mounted
 * across route changes, while genuine user scrolling can still collapse them.
 *
 * Critical distinction: app-core restores each page's saved scroll position after
 * navigation. Its legacy nav-hidden tracker cannot distinguish that programmatic
 * jump from a finger scroll, so it can hide the shell immediately after a route.
 * This layer therefore treats legacy nav-hidden as informational only and owns
 * the visual collapse from an explicitly user-driven scroll session.
 *
 * UI-only: no item/accounting/lifecycle/persistence behaviour lives here.
 */
(function(){
  'use strict';

  if(window.__RT_FAB_SYSTEM)return;
  var BUILD='20260908-fab-system-5';
  var repairing=false;
  var routeActive=false;
  var routeTimer=0;
  var userScrollActive=false;
  var userScrollEndTimer=0;
  var scrollRaf=0;
  var lastUserY=window.scrollY||window.pageYOffset||0;

  var nativeOptions=(typeof _fabOptionsForPage==='function')?_fabOptionsForPage:null;
  var universal;
  try{
    universal=(typeof _FAB_ALL_OPTIONS!=='undefined'&&Array.isArray(_FAB_ALL_OPTIONS))
      ?_FAB_ALL_OPTIONS.slice()
      :['list','sourced','sourcerun','expense','trip'];
  }catch(_e){
    universal=['list','sourced','sourcerun','expense','trip'];
  }

  /* No signed-in route is allowed to remove the FAB. Unmapped/read-only routes
     inherit the universal Command Centre launcher. */
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
      return fallback();
    };
  }

  function moreSheetOpen(){
    var sheet=document.getElementById('more-sheet');
    return !!(sheet&&sheet._msOpen===true);
  }

  function appShellIsAvailable(){
    var dial=document.getElementById('fab-dial');
    if(!dial)return false;
    /* display:none is the deliberate auth/entry gate. */
    return dial.style.display!=='none';
  }

  function clearPresentationHide(el){
    if(!el)return;
    if(el.__rtFabHideTimer){clearTimeout(el.__rtFabHideTimer);el.__rtFabHideTimer=0;}
    el.classList.remove('rt-fab-motion-hidden');
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

      if(appShellIsAvailable()&&!moreSheetOpen()){
        var dial=document.getElementById('fab-dial');
        var search=document.getElementById('search-fab');
        clearPresentationHide(dial);
        clearPresentationHide(search);
        if(dial&&dial.style.visibility==='hidden')dial.style.visibility='';
        if(search&&search.style.visibility==='hidden')search.style.visibility='';
      }
    }finally{
      repairing=false;
    }
  }

  function setScrollCollapsed(hidden){
    var body=document.body;
    if(!body)return;
    body.classList.toggle('rt-shell-scroll-hidden',!!hidden);
  }

  function endUserScrollSoon(){
    if(userScrollEndTimer)clearTimeout(userScrollEndTimer);
    userScrollEndTimer=setTimeout(function(){
      userScrollEndTimer=0;
      userScrollActive=false;
      lastUserY=window.scrollY||window.pageYOffset||0;
    },180);
  }

  function beginUserScroll(){
    if(routeActive)return;
    if(!userScrollActive){
      userScrollActive=true;
      lastUserY=window.scrollY||window.pageYOffset||0;
    }
    endUserScrollSoon();
  }

  function processUserScroll(){
    scrollRaf=0;
    var y=window.scrollY||window.pageYOffset||0;

    /* Programmatic page scroll restoration lands here too, but without a preceding
       touchmove/wheel session it can only update the baseline, never hide chrome. */
    if(routeActive||!userScrollActive){
      lastUserY=y;
      return;
    }

    var diff=y-lastUserY;
    if(y<10){
      setScrollCollapsed(false);
    }else if(diff>8){
      setScrollCollapsed(true);
    }else if(diff<-8){
      setScrollCollapsed(false);
    }
    lastUserY=y;
    endUserScrollSoon();
  }

  /* A real drag/wheel opens the user-scroll session. Plain taps do not. Momentum
     continues to count because every resulting scroll event extends the short
     session until scrolling actually settles. */
  window.addEventListener('touchmove',beginUserScroll,{passive:true});
  window.addEventListener('wheel',beginUserScroll,{passive:true});
  window.addEventListener('scroll',function(){
    if(scrollRaf)return;
    scrollRaf=requestAnimationFrame(processUserScroll);
  },{passive:true});

  function beginRouteHandoff(){
    routeActive=true;
    userScrollActive=false;
    if(userScrollEndTimer){clearTimeout(userScrollEndTimer);userScrollEndTimer=0;}
    setScrollCollapsed(false);
    keepShellMounted();
    lastUserY=window.scrollY||window.pageYOffset||0;
    if(routeTimer)clearTimeout(routeTimer);
    /* Only guards the synchronous render/scroll-restore transaction. No visual
       timeout is involved: the shell is visible from the first route frame. */
    routeTimer=setTimeout(function(){
      routeTimer=0;
      routeActive=false;
      lastUserY=window.scrollY||window.pageYOffset||0;
      keepShellMounted();
    },120);
  }

  /* Legacy nav-hidden is deliberately neutralised. Its private scroll baseline is
     reset to zero during routing, then page scroll is restored, so it is inherently
     unable to distinguish a route jump from user intent. Only rt-shell-scroll-hidden
     below is allowed to move app chrome off screen. */
  if(!document.getElementById('rt-persistent-bottom-shell')){
    var style=document.createElement('style');
    style.id='rt-persistent-bottom-shell';
    style.textContent=[
      '@media(max-width:999px){',
      '#bottom-nav.nav-hidden{transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      'body:has(#bottom-nav.nav-hidden) #fab-dial,body:has(#bottom-nav.nav-hidden) .fab-dial{transform:translateX(-50%)!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      'body:has(#bottom-nav.nav-hidden) #search-fab{transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}',
      '#fab-dial.rt-fab-motion-hidden{opacity:1!important;scale:1!important;visibility:visible!important}',
      'body.rt-shell-scroll-hidden #bottom-nav{transform:translateY(100%)!important;opacity:0!important;pointer-events:none!important}',
      'body.rt-shell-scroll-hidden #fab-dial,body.rt-shell-scroll-hidden .fab-dial{transform:translateX(-50%) translateY(150%)!important;opacity:0!important;pointer-events:none!important}',
      'body.rt-shell-scroll-hidden #search-fab{transform:translateY(150%)!important;opacity:0!important;pointer-events:none!important}',
      '}',
      '@media(prefers-reduced-motion:reduce){#bottom-nav,#fab-dial,#search-fab{transition:none!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  /* motion-system/app-core may still ask whether the FAB belongs on a route. It
     always does once signed in; context changes only affect the option set. */
  try{
    if(typeof _syncFabVisibility==='function'){
      _syncFabVisibility=function(){keepShellMounted();};
    }
  }catch(_e3){}

  /* Start route protection before native handlers can call scrollTo/restore scroll. */
  document.addEventListener('pointerdown',function(e){
    var target=e.target&&e.target.closest?e.target.closest('#bottom-nav button,[data-tab],#more-sheet .more-sheet-row'):null;
    if(target)beginRouteHandoff();
  },true);

  ['goToTab','activatePage','openItemPage','openAccountPage','exitItemPage','backToAccountsList'].forEach(function(name){
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

  /* More deliberately hides the floating actions while its sheet owns the lower
     screen. On close, restore immediately; no observer/timer is needed. */
  function wrapMore(name){
    try{
      var base=window[name];
      if(typeof base!=='function'||base._rtFabMoreWrapped)return;
      var wrapped=function(){
        var out=base.apply(this,arguments);
        if(!moreSheetOpen())keepShellMounted();
        return out;
      };
      wrapped._rtFabMoreWrapped=true;
      window[name]=wrapped;
    }catch(_e){}
  }
  wrapMore('toggleMoreSheet');
  wrapMore('closeMoreSheet');

  keepShellMounted();
  requestAnimationFrame(keepShellMounted);
  window.addEventListener('pageshow',function(){setScrollCollapsed(false);keepShellMounted();});
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      setScrollCollapsed(false);
      keepShellMounted();
      lastUserY=window.scrollY||window.pageYOffset||0;
    }
  });

  window.__RT_FAB_SYSTEM={
    build:BUILD,
    universal:function(){return fallback();},
    repair:keepShellMounted,
    routeHandoff:beginRouteHandoff,
    snapshot:function(){return{
      routeActive:routeActive,
      userScrollActive:userScrollActive,
      collapsed:!!(document.body&&document.body.classList.contains('rt-shell-scroll-hidden')),
      y:window.scrollY||window.pageYOffset||0,
      legacyHidden:!!(document.getElementById('bottom-nav')&&document.getElementById('bottom-nav').classList.contains('nav-hidden'))
    };}
  };
  console.info('[RETRADE] persistent bottom action shell loaded',BUILD);
})();
