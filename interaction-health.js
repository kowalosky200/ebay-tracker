/* RETRADE interaction hit-test health.
 *
 * A closing surface stops owning input IMMEDIATELY. Its visual fade/slide may
 * finish afterwards, but it must never keep the underlying page inert, leave a
 * transparent full-screen backdrop in the hit-test path, or strand the body in
 * the iOS fixed-position scroll lock after the surface is gone.
 *
 * This is deliberately UI-only: no data, accounting, lifecycle or sync rules.
 */
(function(){
  'use strict';

  if(window.__RT_INTERACTION_HEALTH)return;
  var BUILD='20260908-interaction-health-4';
  var repairs=0;
  var healing=false;

  function byId(id){return document.getElementById(id);}
  function ownershipReconcile(){
    try{
      if(window.__RT_SURFACE_OWNERSHIP&&typeof window.__RT_SURFACE_OWNERSHIP.reconcile==='function'){
        window.__RT_SURFACE_OWNERSHIP.reconcile();
      }
    }catch(e){console.warn('[RETRADE] ownership reconcile failed',e);}
  }

  function closeHitTesting(el,aria){
    if(!el)return false;
    var changed=false;
    if(el.style.pointerEvents!=='none'){
      el.style.pointerEvents='none';
      repairs++;changed=true;
    }
    if(aria&&el.getAttribute('aria-hidden')!=='true'){
      el.setAttribute('aria-hidden','true');
      el.dataset.rtInteractionHealthHidden='1';
      repairs++;changed=true;
    }
    return changed;
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
    return closeHitTesting(byId(id),false);
  }

  /* app-core freezes body scrolling by reference count. That is correct for a
     legitimate nested stack (panel -> confirm / panel -> sold modal), but a lost
     close callback leaves _scrollLockCount > 0 forever and iOS then has a page
     that cannot even scroll. Reconcile the count against the tiny set of surfaces
     that ACTUALLY call lockBodyScroll(). This runs only at surface lifecycle edges,
     never on ordinary taps or animation frames. */
  function semanticScrollLockCount(){
    var n=0;
    var panel=byId('slide-panel');
    if(panel&&panel.classList.contains('on'))n++;

    var confirm=byId('confirm-modal');
    if(confirm&&confirm.classList.contains('open'))n++;

    ['sold-modal','resale-modal'].forEach(function(id){
      var modal=byId(id);
      if(!modal)return;
      if(modal.style.display&&modal.style.display!=='none'&&modal.getAttribute('aria-hidden')!=='true')n++;
    });

    var cats=byId('all-cats-modal');
    if(cats&&cats.getAttribute('aria-hidden')!=='true'&&cats.style.pointerEvents!=='none')n++;
    return n;
  }

  function bodyIsFrozen(){
    var b=document.body;
    return !!(b&&(b.style.position==='fixed'||b.style.overflow==='hidden'));
  }

  function freezeBodyAt(y){
    var b=document.body;if(!b)return;
    b.style.position='fixed';
    b.style.top=(-y)+'px';
    b.style.left='0';
    b.style.right='0';
    b.style.width='100%';
    b.style.overflow='hidden';
  }

  function thawBody(y){
    var b=document.body;if(!b)return;
    b.style.position='';
    b.style.top='';
    b.style.left='';
    b.style.right='';
    b.style.width='';
    b.style.overflow='';
    try{window.scrollTo(0,Math.max(0,Number(y)||0));}catch(e){}
  }

  function reconcileScrollLocks(){
    var desired=semanticScrollLockCount();
    try{
      var actual=(typeof _scrollLockCount!=='undefined')?Math.max(0,Number(_scrollLockCount)||0):null;
      var savedY=(typeof _scrollLockY!=='undefined')?Math.max(0,Number(_scrollLockY)||0):(window.pageYOffset||0);

      if(actual!==null&&actual!==desired){
        _scrollLockCount=desired;
        repairs++;
      }

      if(desired===0){
        if(bodyIsFrozen()){
          thawBody(savedY);
          repairs++;
        }
      }else if(!bodyIsFrozen()){
        /* A real locking surface is open but the body escaped its lock. Repair in
           the safe direction too so the background cannot scroll through a modal. */
        var now=window.pageYOffset||document.documentElement.scrollTop||0;
        try{if(typeof _scrollLockY!=='undefined')_scrollLockY=now;}catch(e2){}
        freezeBodyAt(now);
        repairs++;
      }
    }catch(e){console.warn('[RETRADE] scroll-lock reconcile failed',e);}
    return desired;
  }

  function healLoadingLock(){
    try{
      if(document.body.classList.contains('rt-data-loading-active') &&
         typeof _realLayoutLoading!=='undefined' && !_realLayoutLoading &&
         typeof _enableLoadingControls==='function'){
        _enableLoadingControls();
        repairs++;
        return true;
      }
    }catch(e){}
    return false;
  }

  function heal(){
    if(healing)return;
    healing=true;
    var before=repairs;
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
        if(navBd&&navBd.style.display!=='none'){
          navBd.style.display='none';
          repairs++;
        }
      }

      var panel=byId('slide-panel');
      var panelOverlay=byId('panel-overlay');
      if(panel&&panelOverlay&&!panel.classList.contains('on')&&panelOverlay.classList.contains('on')){
        panelOverlay.classList.remove('on');
        panelOverlay.style.pointerEvents='none';
        repairs++;
      }

      var cats=byId('all-cats-modal');
      if(cats&&cats.getAttribute('aria-hidden')==='true')closeHitTesting(cats,false);
      var catsPanel=byId('all-cats-panel');
      if(catsPanel&&cats&&cats.getAttribute('aria-hidden')==='true')closeHitTesting(catsPanel,false);

      reconcileScrollLocks();
      healLoadingLock();
    }finally{
      healing=false;
    }
    /* Reconciliation performs computed-style/layout reads, so recovery only pays
       for it when something was actually repaired. */
    if(repairs!==before)ownershipReconcile();
  }

  function wrap(name,make){
    var base=window[name];
    if(typeof base!=='function'||base._rtInteractionHealthWrapped)return;
    var wrapped=make(base);
    wrapped._rtInteractionHealthWrapped=true;
    window[name]=wrapped;
  }

  /* The More sheet was the first intermittent-dead-page path. Core keeps the
     sheet display:block for its close animation. Semantic close ends ownership
     synchronously; the slide animation is free to finish later. */
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
     first, DOM removal later. Remove it from hit-testing/ownership first. The
     core delayed unlock is retained here because a panel can legitimately sit
     underneath it; the lifecycle heal catches browser-interrupted callbacks. */
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

  /* These closes have synchronous lock/unlock semantics. Immediately reconcile
     the reference counter against visible surfaces so one historical missing
     unlock cannot poison the next popup -> page transition. */
  ['closePanel','closeModal','resolveConfirm','_closeSaleModal'].forEach(function(name){
    wrap(name,function(base){
      return function(){
        var out=base.apply(this,arguments);
        reconcileScrollLocks();
        ownershipReconcile();
        return out;
      };
    });
  });

  /* Recovery stays OUT of the normal gesture path. Page/nav taps go straight to
     their own handler; lifecycle edges are only a fallback for Safari suspension. */
  window.addEventListener('pageshow',heal);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')heal();});
  if('onscrollend' in window)window.addEventListener('scrollend',heal,{passive:true});

  heal();

  window.__RT_INTERACTION_HEALTH={
    build:BUILD,
    heal:heal,
    reconcileScrollLocks:reconcileScrollLocks,
    repairs:function(){return repairs;},
    snapshot:function(){
      var page=document.querySelector('.page.on');
      var lockCount=null;
      try{lockCount=(typeof _scrollLockCount!=='undefined')?_scrollLockCount:null;}catch(e){}
      return {
        owner:window.__RT_SURFACE_OWNERSHIP&&window.__RT_SURFACE_OWNERSHIP.active?window.__RT_SURFACE_OWNERSHIP.active():null,
        suspended:window.__RT_SURFACE_OWNERSHIP&&window.__RT_SURFACE_OWNERSHIP.suspended?window.__RT_SURFACE_OWNERSHIP.suspended():[],
        page:page?page.id:null,
        pageInert:!!(page&&page.inert),
        moreOpen:moreSheetIsOpen(),
        scrollLockCount:lockCount,
        expectedScrollLocks:semanticScrollLockCount(),
        bodyFrozen:bodyIsFrozen(),
        repairs:repairs
      };
    }
  };
  console.info('[RETRADE] interaction health loaded',BUILD);
})();