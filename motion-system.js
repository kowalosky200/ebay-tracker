/* RETRADE global motion coherence v1.4.49
 * Presentation-only layer loaded last.
 *
 * Goals:
 * - one calm easing language across page switches, panels, sheets and confirms
 * - immediate interaction acknowledgement with short finishing motion
 * - no global mutation work caused by unrelated chart/content updates
 * - respect reduced motion
 *
 * No accounting, sync, lifecycle, forecast maths or persisted data is touched.
 */
(function(){
  'use strict';

  var EASE='cubic-bezier(.22,.61,.36,1)';
  var FAST=135;
  var visibilityIntent=new WeakMap();

  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }

  function installStyles(){
    ['rt-global-motion-v1447','rt-global-motion-v1449'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-global-motion-v1449';
    s.textContent='\
:root{--rt-motion-ease:'+EASE+';--rt-motion-fast:135ms;--rt-motion-med:185ms;}\
@keyframes rtPageEnterV1449{from{opacity:0;transform:translate3d(0,3px,0)}to{opacity:1;transform:translate3d(0,0,0)}}\
@keyframes rtSurfaceEnterV1449{from{opacity:0;transform:translate3d(0,4px,0)}to{opacity:1;transform:translate3d(0,0,0)}}\
@keyframes rtOverlayInV1449{from{opacity:0}to{opacity:1}}\
@keyframes rtConfirmInV1449{from{opacity:0;transform:translate3d(0,4px,0) scale(.99)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}\
.page.on:not(.rt-boot-noanim){animation:rtPageEnterV1449 165ms var(--rt-motion-ease) both!important;}\
#panel-content{animation:rtSurfaceEnterV1449 175ms var(--rt-motion-ease) both!important;}\
.slide-panel{transition:transform 195ms var(--rt-motion-ease)!important;}\
#more-sheet{transition:transform 185ms var(--rt-motion-ease)!important;}\
.country-panel{transition:opacity 120ms ease-out,transform 175ms var(--rt-motion-ease)!important;}\
#confirm-modal.open{animation:rtOverlayInV1449 120ms ease-out both!important;}\
#confirm-modal.open .confirm-box{animation:rtConfirmInV1449 175ms var(--rt-motion-ease) both!important;}\
.fab-dial-item{transition:opacity 120ms ease-out,transform 165ms var(--rt-motion-ease)!important;}\
#fab-dial,#search-fab{transition-property:opacity,scale,transform,bottom!important;transition-duration:120ms,150ms,150ms,165ms!important;transition-timing-function:ease-out,var(--rt-motion-ease),var(--rt-motion-ease),var(--rt-motion-ease)!important;}\
#fab-dial.rt-fab-motion-hidden,#search-fab.rt-fab-motion-hidden{opacity:0!important;scale:.96;pointer-events:none!important;}\
.tab,.bnt,.nav-more-btn,.more-sheet-row{transition-property:color,background-color,opacity!important;transition-duration:110ms!important;transition-timing-function:ease-out!important;}\
.tab svg,.bnt svg,.nav-more-btn svg{transition:transform 135ms var(--rt-motion-ease),color 110ms ease-out!important;}\
.tab.on svg,.bnt.on svg{transform:translateY(-1px);}\
/* Command Centre bars acknowledge the range immediately and finish their entire\
   left-to-right reveal in roughly half a second even on 30 daily columns. The\
   prior stack could exceed a second once stagger + animation duration combined. */\
#p-summary svg.rt-chart-draw .rt-chart-primary-bar:not(.rt-chart-profit-bar):not(.rt-chart-forecast-shell),\
#p-summary svg.rt-chart-draw .rt-chart-primary-actual{animation-duration:280ms!important;animation-delay:calc(var(--bar-i,0) * 7ms)!important;}\
#p-summary svg.rt-chart-draw .rt-chart-profit-bar:not(.rt-chart-forecast-shell),\
#p-summary svg.rt-chart-draw .rt-chart-profit-actual{animation-duration:245ms!important;animation-delay:calc(var(--bar-i,0) * 7ms + 32ms)!important;}\
#p-summary svg.rt-chart-draw .rt-chart-forecast-shell{animation-duration:220ms!important;animation-delay:calc(var(--bar-i,0) * 7ms + 80ms)!important;}\
#p-summary svg.rt-chart-draw .rt-chart-refund-dot{animation-duration:135ms!important;animation-delay:125ms!important;}\
button,.tab,.bnt,.nav-more-btn,.more-sheet-row,.fab-dial-item{touch-action:manipulation;}\
@media(prefers-reduced-motion:reduce){\
 .page.on:not(.rt-boot-noanim),#panel-content,#confirm-modal.open,#confirm-modal.open .confirm-box{animation:none!important;}\
 .slide-panel,#more-sheet,.country-panel,.fab-dial-item,#fab-dial,#search-fab,.tab,.bnt,.nav-more-btn,.more-sheet-row,.tab svg,.bnt svg,.nav-more-btn svg{transition:none!important;}\
 #fab-dial.rt-fab-motion-hidden,#search-fab.rt-fab-motion-hidden{scale:1;}\
}';
    document.head.appendChild(s);
  }
  installStyles();

  function clearHideTimer(el){
    if(!el)return;
    if(el.__rtFabHideTimer){clearTimeout(el.__rtFabHideTimer);el.__rtFabHideTimer=0;}
  }

  function motionVisibility(el,visible){
    if(!el)return;
    visible=!!visible;
    var previous=visibilityIntent.get(el);
    clearHideTimer(el);

    /* The production visibility helper can be called repeatedly during a render.
       Do no DOM work at all when the intended state has not changed. */
    if(previous===visible)return;
    visibilityIntent.set(el,visible);

    if(reducedMotion()){
      el.classList.toggle('rt-fab-motion-hidden',!visible);
      el.style.visibility=visible?'':'hidden';
      if(visible)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden','true');
      return;
    }

    if(visible){
      /* Visibility/pointer availability changes immediately; motion is only the
         visual finish. No synchronous layout read and no artificial timeout. */
      el.classList.add('rt-fab-motion-hidden');
      el.style.visibility='';
      el.removeAttribute('aria-hidden');
      requestAnimationFrame(function(){
        if(visibilityIntent.get(el)===true)el.classList.remove('rt-fab-motion-hidden');
      });
    }else{
      el.setAttribute('aria-hidden','true');
      el.classList.add('rt-fab-motion-hidden');
      el.__rtFabHideTimer=setTimeout(function(){
        el.__rtFabHideTimer=0;
        if(visibilityIntent.get(el)===false)el.style.visibility='hidden';
      },FAST+20);
    }
  }

  /* Replace the visibility snap in the production helper while preserving its
     page/context rules. If those internals ever change, fall back to the native
     helper instead of guessing. */
  try{
    if(typeof _syncFabVisibility==='function'){
      var nativeSyncFab=_syncFabVisibility;
      _syncFabVisibility=function(){
        var dial=document.getElementById('fab-dial');
        if(!dial)return;
        try{
          if(dial.style.display==='none' && typeof DB!=='undefined' && !DB._userOwned && !(typeof _previewMode!=='undefined'&&_previewMode))return;
        }catch(_){}
        var activePage=(document.querySelector('.page.on')||{id:''}).id;
        var hidden;
        try{
          hidden=_FAB_HIDDEN_PAGES.has(activePage)||_fabOptionsForPage(activePage).length===0;
        }catch(e){
          return nativeSyncFab.apply(this,arguments);
        }
        var searchFab=document.getElementById('search-fab');
        if(hidden)dial.classList.remove('open');
        motionVisibility(dial,!hidden);
        motionVisibility(searchFab,!hidden);
      };
      requestAnimationFrame(function(){try{_syncFabVisibility();}catch(_){};});
    }
  }catch(_){}

  /* Watch only page class changes. The old document-wide class observer woke up
     for every unrelated component/chart class mutation and then queried the page
     tree again. Direct page observers keep navigation in phase at negligible
     steady-state cost. */
  try{
    var watchedPages=new WeakSet();
    var pageSyncPending=false;
    var lastPage=(document.querySelector('.page.on')||{id:''}).id;

    function syncPage(){
      pageSyncPending=false;
      var current=(document.querySelector('.page.on')||{id:''}).id;
      if(current===lastPage)return;
      lastPage=current;
      try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}
    }
    function schedulePageSync(){
      if(pageSyncPending)return;
      pageSyncPending=true;
      requestAnimationFrame(syncPage);
    }
    function watchPage(page){
      if(!page||watchedPages.has(page))return;
      watchedPages.add(page);
      var obs=new MutationObserver(schedulePageSync);
      obs.observe(page,{attributes:true,attributeFilter:['class']});
    }
    function scanPages(root){
      if(!root||root.nodeType!==1)return;
      if(root.matches&&root.matches('.page'))watchPage(root);
      if(root.querySelectorAll)root.querySelectorAll('.page').forEach(watchPage);
    }

    document.querySelectorAll('.page').forEach(watchPage);
    var pageStructureObserver=new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(scanPages);});
    });
    pageStructureObserver.observe(document.documentElement,{subtree:true,childList:true});
  }catch(_){}

  window.__RT_GLOBAL_MOTION_BUILD='20260907-motion-system-3';
})();