/* RETRADE listing-flow coherence.
 * Keeps the generic quick-list and sourced->listed forms semantically identical:
 * both are listing workflows, both say "List Item", and a successful submit must
 * leave no stale popup scroll/interaction state behind.
 *
 * UI/workflow only — no listing calculations, persistence or lifecycle rules.
 */
(function(){
  'use strict';

  if(window.__RT_LISTING_FLOW)return;
  var BUILD='20260908-listing-flow-1';

  function submitButton(){return document.getElementById('qa-submit-btn');}

  function isListingSubmit(btn){
    if(!btn)return false;
    var action=btn.getAttribute('onclick')||'';
    return action.indexOf('submitQuickAdd')>=0||action.indexOf('submitListFromSourced')>=0;
  }

  function normalizeSubmitCopy(){
    var btn=submitButton();
    if(!isListingSubmit(btn))return;
    btn.textContent=btn.disabled?'List Item — locked':'List Item';
    btn.setAttribute('aria-label',btn.disabled?'List item unavailable':'List item');
  }

  function reconcileAfterListingClose(){
    var panel=document.getElementById('slide-panel');
    if(panel&&panel.classList.contains('on'))return;
    try{
      if(window.__RT_INTERACTION_HEALTH&&typeof window.__RT_INTERACTION_HEALTH.reconcileScrollLocks==='function'){
        window.__RT_INTERACTION_HEALTH.reconcileScrollLocks();
      }
      if(window.__RT_SURFACE_OWNERSHIP&&typeof window.__RT_SURFACE_OWNERSHIP.reconcile==='function'){
        window.__RT_SURFACE_OWNERSHIP.reconcile();
      }
    }catch(e){console.warn('[RETRADE] listing close reconcile failed',e);}
  }

  function wrap(name,make,flag){
    var base=window[name];
    if(typeof base!=='function'||base[flag])return;
    var next=make(base);
    next[flag]=true;
    window[name]=next;
  }

  /* Core's shared platform-state helper used to rewrite the sourced listing
     button from "List Item" back to "Add Item" immediately after the form
     opened. Keep the shared disabled/live behaviour, then restore task-accurate
     copy for either listing route. */
  wrap('_refreshQuickAddSubmitState',function(base){
    return function(){
      var out=base.apply(this,arguments);
      normalizeSubmitCopy();
      return out;
    };
  },'_rtListingCopyWrapped');

  wrap('openQuickAdd',function(base){
    return function(){
      var out=base.apply(this,arguments);
      normalizeSubmitCopy();
      return out;
    };
  },'_rtListingOpenWrapped');

  wrap('openListFromSourced',function(base){
    return function(){
      var out=base.apply(this,arguments);
      normalizeSubmitCopy();
      return out;
    };
  },'_rtSourcedListingOpenWrapped');

  /* closePanel is already repaired globally. These route-specific checks make
     the critical popup -> listing -> detail journey self-contained as well: a
     successful submit that closed the panel cannot leave an old body lock or
     surface owner behind. Validation failures keep the panel open and therefore
     deliberately skip the reconcile. */
  ['submitQuickAdd','submitListFromSourced'].forEach(function(name){
    wrap(name,function(base){
      return function(){
        var out=base.apply(this,arguments);
        reconcileAfterListingClose();
        return out;
      };
    },'_rtListingSubmitWrapped');
  });

  normalizeSubmitCopy();

  window.__RT_LISTING_FLOW={
    build:BUILD,
    normalizeSubmitCopy:normalizeSubmitCopy,
    reconcile:reconcileAfterListingClose
  };
  console.info('[RETRADE] listing flow loaded',BUILD);
})();