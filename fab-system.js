/* RETRADE persistent FAB system.
 *
 * The FAB is part of the application shell, not page content. Context-specific
 * pages can narrow its actions, but navigation must never make the control blink
 * out simply because a route has no bespoke FAB mapping (or because the old page
 * has been deactivated a frame before the new one becomes active).
 *
 * UI-only: no item/accounting/lifecycle/persistence behaviour lives here.
 */
(function(){
  'use strict';

  if(window.__RT_FAB_SYSTEM)return;
  var BUILD='20260908-fab-system-1';

  var nativeOptions=(typeof _fabOptionsForPage==='function')?_fabOptionsForPage:null;
  var universal;
  try{
    universal=(typeof _FAB_ALL_OPTIONS!=='undefined'&&Array.isArray(_FAB_ALL_OPTIONS))
      ?_FAB_ALL_OPTIONS.slice()
      :['list','sourced','sourcerun','expense','trip'];
  }catch(_e){
    universal=['list','sourced','sourcerun','expense','trip'];
  }

  /* The old model deliberately hid the FAB on read-only/history pages. That made
     the app shell visibly change shape and also created a hide -> show flash when
     switching routes. Those pages now use the universal launcher instead. */
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

      /* This also covers the tiny route-handoff window where no .page.on exists.
         Returning the universal set there means visibility never toggles off just
         because navigation is between two synchronous class changes. */
      return fallback();
    };
  }

  function ensureVisible(){
    var dial=document.getElementById('fab-dial');
    if(!dial)return;

    /* Respect the authentication/ownership gate. app-core intentionally keeps the
       FAB display:none until the user has entered the app. */
    try{
      if(dial.style.display==='none'&&typeof DB!=='undefined'&&!DB._userOwned&&
         !(typeof _previewMode!=='undefined'&&_previewMode))return;
    }catch(_e){}

    try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_e2){}

    /* If an older visibility pass ran just before this layer loaded, remove only
       the presentation-level hidden residue. Future page changes stay visible via
       the fallback options above, so this is a one-time recovery rather than a
       per-navigation mutation. */
    dial.classList.remove('rt-fab-motion-hidden');
    dial.style.visibility='';
    dial.removeAttribute('aria-hidden');
  }

  ensureVisible();
  requestAnimationFrame(ensureVisible);
  window.addEventListener('pageshow',ensureVisible);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible')ensureVisible();
  });

  window.__RT_FAB_SYSTEM={
    build:BUILD,
    universal:function(){return fallback();}
  };
  console.info('[RETRADE] persistent FAB system loaded',BUILD);
})();
