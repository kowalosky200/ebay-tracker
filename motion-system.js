/* RETRADE global motion coherence v1.4.55
 * Presentation-only layer loaded last.
 *
 * Performance pass:
 * - keep the same calm motion language but shorten acknowledgement time
 * - remove the forced FAB layout read + double-rAF handoff
 * - observe only page class changes, not every class mutation in the app subtree
 *
 * No accounting, sync, lifecycle, forecast maths or persisted data is touched.
 */
(function(){
  'use strict';

  var EASE='cubic-bezier(.22,.61,.36,1)';
  var FAST=150;
  var MED=210;

  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }

  function installStyles(){
    ['rt-global-motion-v1447','rt-global-motion-v1455'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-global-motion-v1455';
    s.textContent='\
:root{--rt-motion-ease:'+EASE+';--rt-motion-fast:150ms;--rt-motion-med:210ms;}\
@keyframes rtPageEnterV1455{from{opacity:.72;transform:translate3d(0,3px,0)}to{opacity:1;transform:translate3d(0,0,0)}}\
@keyframes rtSurfaceEnterV1455{from{opacity:.8;transform:translate3d(0,4px,0)}to{opacity:1;transform:translate3d(0,0,0)}}\
@keyframes rtOverlayInV1455{from{opacity:0}to{opacity:1}}\
@keyframes rtConfirmInV1455{from{opacity:0;transform:translate3d(0,5px,0) scale(.99)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}\
.page.on:not(.rt-boot-noanim){animation:rtPageEnterV1455 190ms var(--rt-motion-ease) both!important;}\
#panel-content{animation:rtSurfaceEnterV1455 175ms var(--rt-motion-ease) both!important;}\
.slide-panel{transition:transform 240ms var(--rt-motion-ease)!important;}\
#more-sheet{transition:transform 240ms var(--rt-motion-ease)!important;}\
.country-panel{transition:opacity 150ms ease-out,transform 200ms var(--rt-motion-ease)!important;}\
#confirm-modal.open{animation:rtOverlayInV1455 145ms ease-out both!important;}\
#confirm-modal.open .confirm-box{animation:rtConfirmInV1455 205ms var(--rt-motion-ease) both!important;}\
.fab-dial-item{transition:opacity 145ms ease-out,transform 200ms var(--rt-motion-ease)!important;}\
#fab-dial,#search-fab{transition-property:opacity,scale,transform,bottom!important;transition-duration:145ms,190ms,190ms,190ms!important;transition-timing-function:ease-out,var(--rt-motion-ease),var(--rt-motion-ease),var(--rt-motion-ease)!important;}\
#fab-dial.rt-fab-motion-hidden,#search-fab.rt-fab-motion-hidden{opacity:0!important;scale:.95;pointer-events:none!important;}\
.tab,.bnt,.nav-more-btn,.more-sheet-row{transition-property:color,background-color,opacity!important;transition-duration:130ms!important;transition-timing-function:ease-out!important;}\
.tab svg,.bnt svg,.nav-more-btn svg{transition:transform 150ms var(--rt-motion-ease),color 130ms ease-out!important;}\
.tab.on svg,.bnt.on svg{transform:translateY(-1px);}\
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
    clearHideTimer(el);
    if(reducedMotion()){
      el.classList.toggle('rt-fab-motion-hidden',!visible);
      el.style.visibility=visible?'':'hidden';
      if(visible)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden','true');
      return;
    }
    if(visible){
      el.classList.add('rt-fab-motion-hidden');
      el.style.visibility='';
      el.removeAttribute('aria-hidden');
      /* One paint boundary is enough. The old forced layout + two frames made
         every page transition pay unnecessary main-thread work. */
      requestAnimationFrame(function(){el.classList.remove('rt-fab-motion-hidden');});
    }else{
      el.setAttribute('aria-hidden','true');
      el.classList.add('rt-fab-motion-hidden');
      el.__rtFabHideTimer=setTimeout(function(){
        el.__rtFabHideTimer=0;
        if(el.classList.contains('rt-fab-motion-hidden'))el.style.visibility='hidden';
      },FAST+30);
    }
  }

  try{
    if(typeof _syncFabVisibility==='function'){
      var nativeSyncFab=_syncFabVisibility;
      _syncFabVisibility=function(){
        var dial=document.getElementById('fab-dial');
        if(!dial)return;
        try{if(dial.style.display==='none'&&typeof DB!=='undefined'&&!DB._userOwned&&!(typeof _previewMode!=='undefined'&&_previewMode))return;}catch(_){}
        var activePage=(document.querySelector('.page.on')||{id:''}).id,hidden;
        try{hidden=_FAB_HIDDEN_PAGES.has(activePage)||_fabOptionsForPage(activePage).length===0;}
        catch(e){return nativeSyncFab.apply(this,arguments);}
        var searchFab=document.getElementById('search-fab');
        if(hidden)dial.classList.remove('open');
        motionVisibility(dial,!hidden);motionVisibility(searchFab,!hidden);
      };
      requestAnimationFrame(function(){try{_syncFabVisibility();}catch(_){};});
    }
  }catch(_){}

  /* Only page containers can change the active route. Watching every class
     mutation under <html> meant chips, dropdowns, chart classes and row state
     all woke this observer even though the active page had not changed. */
  try{
    var lastPage=(document.querySelector('.page.on')||{id:''}).id;
    function pageChanged(){
      var current=(document.querySelector('.page.on')||{id:''}).id;
      if(current===lastPage)return;
      lastPage=current;
      try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}
    }
    var obs=new MutationObserver(pageChanged);
    Array.prototype.forEach.call(document.querySelectorAll('.page'),function(page){obs.observe(page,{attributes:true,attributeFilter:['class']});});
  }catch(_){}
})();
