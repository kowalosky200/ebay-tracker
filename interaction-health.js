/* RETRADE interaction hit-test health.
 *
 * A closing surface stops owning input IMMEDIATELY. Its visual fade/slide may
 * finish afterwards, but it must never keep the underlying page inert or keep a
 * transparent full-screen backdrop in the hit-test path while iOS is busy.
 *
 * This is deliberately UI-only: no data, accounting, lifecycle or sync rules.
 */
(function(){
  'use strict';

  if(window.__RT_INTERACTION_HEALTH)return;
  var BUILD='20260907-interaction-health-1';
  var repairs=0;
  var healing=false;
  var scrollHealQueued=false;

  function byId(id){return document.getElementById(id);}
  function ownershipReconcile(){
    try{
      if(window.__RT_SURFACE_OWNERSHIP&&typeof window.__RT_SURFACE_OWNERSHIP.reconcile==='function'){
        window.__RT_SURFACE_OWNERSHIP.reconcile();
      }
    }catch(e){console.warn('[RETRADE] ownership reconcile failed',e);}
  }

  function closeHitTesting(el,aria){
    if(!el)return;
    if(el.style.pointerEvents!=='none'){el.style.pointerEvents='none';repairs++;}
    if(aria&&el.getAttribute('aria-hidden')!=='true'){
      el.setAttribute('aria-hidden','true');
      el.dataset.rtInteractionHealthHidden='1';
      repairs++;
    }
  }

  function openHitTesting(el,aria){
    if(!el)return;
    if(el.style.pointerEvents==='none')el.style.pointerEvents='';
    if(aria&&el.dataset.rtInteractionHealthHidden==='1'){
      el.removeAttribute('aria-hidden');
      delete el.dataset.rtInteractionHealthHidden;
    }
  }

  function moreSheetIsOpen(){
    var sheet=byId('more-sheet');
    return !!(sheet&&sheet._msOpen===true);
  }

  function semanticallyCloseMoreSheet(){
    var sheet=byId('more-sheet');
    var overlay=byId('more-sheet-overlay');
    closeHitTesting(sheet,true);
    closeHitTesting(overlay,false);
    ownershipReconcile();
  }

  function semanticallyOpenMoreSheet(){
    var sheet=byId('more-sheet');
    var overlay=byId('more-sheet-overlay');
    openHitTesting(sheet,true);
    if(overlay)overlay.style.pointerEvents='auto';
    ownershipReconcile();
  }

  function closeTransientBackdrop(id){
    var el=byId(id);
    if(!el)return;
    closeHitTesting(el,false);
  }

  function healLoadingLock(){
    try{
      if(document.body.classList.contains('rt-data-loading-active') &&
         typeof _realLayoutLoading!=='undefined' && !_realLayoutLoading &&
         typeof _enableLoadingControls==='function'){
        _enableLoadingControls();
        repairs++;
      }
    }catch(e){}
  }

  function heal(){
    if(healing)return;
    healing=true;
    try{
      var sheet=byId('more-sheet');
      if(sheet){
        if(sheet._msOpen===true)openHitTesting(sheet,true);
        else{
          closeHitTesting(sheet,true);
          closeTransientBackdrop('more-sheet-overlay');
        }
      }

      var dial=byId('fab-dial');
      if(!dial||!dial.classList.contains('open'))closeTransientBackdrop('fab-backdrop');

      var search=byId('nav-search-expand');
      if(!search||!search.classList.contains('open'))closeTransientBackdrop('search-backdrop');

      var navMore=document.querySelector('.nav-more');
      if(!navMore||!navMore.classList.contains('open')){
        var navBd=byId('nav-more-backdrop');
        if(navBd&&navBd.style.display!=='none'){navBd.style.display='none';repairs++;}
      }

      var panel=byId('slide-panel');
      var panelOverlay=byId('panel-overlay');
      if(panel&&panelOverlay&&!panel.classList.contains('on')&&panelOverlay.classList.contains('on')){
        panelOverlay.classList.remove('on');
        repairs++;
      }

      var cats=byId('all-cats-modal');
      if(cats&&cats.getAttribute('aria-hidden')==='true')closeHitTesting(cats,false);
      var catsPanel=byId('all-cats-panel');
      if(catsPanel&&cats&&cats.getAttribute('aria-hidden')==='true')closeHitTesting(catsPanel,false);

      healLoadingLock();
      ownershipReconcile();
    }finally{
      healing=false;
    }
  }

  function wrap(name,make){
    var base=window[name];
    if(typeof base!=='function'||base._rtInteractionHealthWrapped)return;
    var wrapped=make(base);
    wrapped._rtInteractionHealthWrapped=true;
    window[name]=wrapped;
  }

  /* The More sheet was the primary intermittent-dead-page path. Core keeps the
     sheet display:block for its ~300ms close animation. Surface ownership used
     that visual presence as "still open", which kept .page.on inert. iOS can
     postpone timeout/animation completion while scrolling or during interrupted
     gestures, turning 300ms into an apparently frozen page. Semantic close now
     ends ownership synchronously; the slide animation is free to finish later. */
  wrap('closeMoreSheet',function(base){
    return function(){
      var out=base.apply(this,arguments);
      semanticallyCloseMoreSheet();
      return out;
    };
  });

  wrap('toggleMoreSheet',function(base){
    return function(){
      var opening=!moreSheetIsOpen();
      if(opening)openHitTesting(byId('more-sheet'),true);
      var out=base.apply(this,arguments);
      if(moreSheetIsOpen())semanticallyOpenMoreSheet();
      else semanticallyCloseMoreSheet();
      return out;
    };
  });

  /* The categories drawer has the same visual-close pattern: opacity/transform
     first, DOM removal later. Remove it from hit-testing/ownership first. */
  wrap('closeAllCategoriesModal',function(base){
    return function(){
      var overlay=byId('all-cats-modal');
      var panel=byId('all-cats-panel');
      if(overlay){
        overlay.setAttribute('aria-hidden','true');
        overlay.dataset.rtInteractionHealthHidden='1';
        closeHitTesting(overlay,false);
      }
      closeHitTesting(panel,false);
      ownershipReconcile();
      return base.apply(this,arguments);
    };
  });

  /* Static modal/panel close functions usually update their state correctly,
     but restore ownership in the same task rather than waiting a frame. */
  ['closePanel','closeModal','resolveConfirm'].forEach(function(name){
    wrap(name,function(base){
      return function(){
        var out=base.apply(this,arguments);
        ownershipReconcile();
        return out;
      };
    });
  });

  /* If Safari suspends a timer/transition while the app backgrounds or the user
     starts a scroll, repair semantic hit-testing on return. No polling and no
     global MutationObserver: this work only runs at meaningful interaction edges. */
  window.addEventListener('pageshow',heal);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')heal();});
  window.addEventListener('scroll',function(){
    if(scrollHealQueued)return;
    scrollHealQueued=true;
    requestAnimationFrame(function(){scrollHealQueued=false;heal();});
  },{passive:true});

  /* Capture is only a final safety net. If a stale transparent backdrop receives
     a tap, heal before it can continue blocking subsequent taps. Correct close
     paths above mean this should be rare. */
  document.addEventListener('pointerdown',heal,true);
  document.addEventListener('touchstart',heal,{capture:true,passive:true});

  heal();

  window.__RT_INTERACTION_HEALTH={
    build:BUILD,
    heal:heal,
    repairs:function(){return repairs;},
    snapshot:function(){
      var page=document.querySelector('.page.on');
      return {
        owner:window.__RT_SURFACE_OWNERSHIP&&window.__RT_SURFACE_OWNERSHIP.active?window.__RT_SURFACE_OWNERSHIP.active():null,
        suspended:window.__RT_SURFACE_OWNERSHIP&&window.__RT_SURFACE_OWNERSHIP.suspended?window.__RT_SURFACE_OWNERSHIP.suspended():[],
        page:page?page.id:null,
        pageInert:!!(page&&page.inert),
        moreOpen:moreSheetIsOpen(),
        repairs:repairs
      };
    }
  };
  console.info('[RETRADE] interaction health loaded',BUILD);
})();
