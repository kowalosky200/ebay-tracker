/* RETRADE Sales undo affordances.
 *
 * Adds Undo Sale to Sales multi-select controls and per-item ⋮ menus.
 * Both entry points reuse RETRADE's existing dependency-aware Activity undo;
 * no sale fields, accounting values or lifecycle history are rewritten here.
 * A legacy item with no Activity snapshot can still use the existing stepBack()
 * lifecycle path from its individual ⋮ action.
 */
(function(){
  'use strict';

  if(window.__RT_SALES_UNDO)return;
  var BUILD='20260908-sales-undo-2';

  function recordFor(itemId){
    try{return typeof _findItemRecordById==='function'?_findItemRecordById(itemId):null;}catch(_e){return null;}
  }

  function isSold(item){
    if(!item)return false;
    try{if(typeof _itemLifecycleState==='function')return _itemLifecycleState(item)==='sold';}catch(_e){}
    return !!((item.dateSold||item.resaleSalePrice)&&!item.isReturned&&!item.scrappedAt);
  }

  function latestActiveIds(){
    var out={},stamp={};
    var logs=[];
    try{logs=(DB&&Array.isArray(DB.activityLog))?DB.activityLog:[];}catch(_e){return out;}
    logs.forEach(function(log,idx){
      if(!log||log.undone||!log.itemId)return;
      var ts=Number(log.ts)||0,prev=stamp[log.itemId];
      if(!prev||ts>prev.ts||(ts===prev.ts&&idx>prev.idx)){
        stamp[log.itemId]={ts:ts,idx:idx};
        out[log.itemId]=log.id;
      }
    });
    return out;
  }

  /* A Sales undo must reverse the sale itself, not merely whatever historical
     Activity row happens to be latest. Restrict the canonical snapshot to a
     latest transition whose destination/action is sold or resold. */
  function latestSaleUndo(itemId){
    if(!itemId)return null;
    var rec=recordFor(itemId);
    if(!rec||!isSold(rec.item))return null;

    var ids=latestActiveIds(),logs=[];
    try{logs=(DB&&Array.isArray(DB.activityLog))?DB.activityLog:[];}catch(_e){return null;}
    var log=logs.find(function(row){return row&&row.id===ids[itemId];});
    if(!log)return null;
    var transition=String(log.toState||log.action||'').toLowerCase();
    if(transition!=='sold'&&transition!=='resold')return null;

    if(typeof _activityUndoState==='function'){
      var state=_activityUndoState(log,ids);
      return state&&state.ok?{log:log,state:state}:null;
    }
    if(log.undone||!log.undoable||!log.before)return null;
    return {log:log,state:{ok:true,reason:''}};
  }

  function fallbackTitle(itemId){
    var rec=recordFor(itemId);
    if(!rec||!isSold(rec.item)||typeof _stepBackTitle!=='function')return null;
    try{return _stepBackTitle(rec.item)||null;}catch(_e){return null;}
  }

  function canUndoSingle(itemId){return !!latestSaleUndo(itemId)||!!fallbackTitle(itemId);}

  function refreshSales(){
    try{if(typeof renderMonth==='function')renderMonth();}catch(e){console.warn('[RETRADE] Sales undo refresh failed',e);}
  }

  async function undoSingle(itemId){
    var safe=latestSaleUndo(itemId),rec=recordFor(itemId);
    if(safe&&typeof undoActivity==='function'){
      var itemName=(rec&&rec.item&&rec.item.item)||safe.log.itemName||'this item';
      var label=String(safe.log.toState||safe.log.action||'sold').toLowerCase()==='resold'?'re-sale':'sale';
      var ok=typeof showConfirm==='function'
        ?await showConfirm('Undo '+label+'?',itemName+' will return to its exact state immediately before this '+label+'.',{icon:'revert',okLabel:'Undo '+label,danger:false})
        :true;
      if(!ok)return false;

      var before=!!safe.log.undone;
      undoActivity(safe.log.id);
      var changed=!before&&safe.log.undone===true;
      if(changed){
        try{if(typeof SELECTED_ITEMS!=='undefined'&&SELECTED_ITEMS)SELECTED_ITEMS.delete(itemId);}catch(_e){}
        refreshSales();
      }
      return changed;
    }

    /* Older sale created before Activity snapshots existed: use the established
       lifecycle dispatcher rather than reconstructing Sale 1 / Sale 2+ here. */
    if(rec&&typeof stepBack==='function'&&fallbackTitle(itemId))return stepBack(rec.month,itemId);
    if(typeof toast==='function')toast('No safe sale undo is available for this item','err');
    return false;
  }

  async function bulkUndo(){
    var ids=[];
    try{ids=Array.from(typeof SELECTED_ITEMS!=='undefined'?SELECTED_ITEMS:[]);}catch(_e){}
    if(!ids.length)return;

    var sold=ids.filter(function(id){var rec=recordFor(id);return !!(rec&&isSold(rec.item));});
    var eligible=[];
    sold.forEach(function(id){var u=latestSaleUndo(id);if(u)eligible.push({id:id,undo:u});});
    if(!eligible.length){
      if(typeof toast==='function')toast('These selected sales need individual undo from ⋮ or Full details','err');
      return;
    }

    var blocked=sold.length-eligible.length,n=eligible.length;
    var noun=n===1?'sale':'sales';
    var msg='Restore '+n+' selected '+noun+' to the exact state before '+(n===1?'it was':'they were')+' sold.';
    if(blocked)msg+=' '+blocked+' protected/older '+(blocked===1?'sale will':'sales will')+' be left unchanged.';
    var ok=typeof showConfirm==='function'
      ?await showConfirm('Undo '+n+' '+noun+'?',msg,{icon:'revert',okLabel:'Undo '+noun,danger:false})
      :true;
    if(!ok)return;

    var changed=0;
    eligible.forEach(function(entry){
      try{
        var was=!!entry.undo.log.undone;
        undoActivity(entry.undo.log.id);
        if(!was&&entry.undo.log.undone===true)changed++;
      }catch(e){console.warn('[RETRADE] bulk sale undo failed for',entry.id,e);}
    });

    if(changed){
      try{SELECTED_ITEMS.clear();SELECTION_MODE=false;}catch(_e){}
      refreshSales();
      if(typeof toast==='function')toast('Undid '+changed+' '+(changed===1?'sale':'sales')+(blocked?' · '+blocked+' left unchanged':''));
    }
  }

  function itemIdFromDd(wrap){
    if(!wrap||!wrap.id||wrap.id.indexOf('dd-')!==0)return null;
    /* Sales rows can suffix the dropdown ID with -sN for Sale N. Item IDs are
       otherwise preserved verbatim (e.g. R-0274). */
    return wrap.id.slice(3).replace(/-s\d+$/,'');
  }

  function undoSvg(){
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>';
  }

  function enhanceMenus(root){
    root=root||document.getElementById('p-monthly');
    if(!root)return;
    root.querySelectorAll('.ddwrap[id^="dd-"]').forEach(function(wrap){
      var itemId=itemIdFromDd(wrap),existing=wrap.querySelector('[data-rt-sales-undo-row]');
      if(!itemId||!recordFor(itemId)||!canUndoSingle(itemId)){
        if(existing)existing.remove();
        return;
      }
      if(existing)return;
      var menu=wrap.querySelector('.ddmenu');
      if(!menu)return;

      var btn=document.createElement('button');
      btn.type='button';
      btn.className='rt-sales-undo-item';
      btn.setAttribute('data-rt-sales-undo-row','1');
      btn.innerHTML=undoSvg()+' Undo sale';
      btn.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        try{if(typeof toggleDD==='function')toggleDD(wrap.id);}catch(_e){}
        undoSingle(itemId);
      });

      var danger=menu.querySelector('button.danger');
      if(danger)menu.insertBefore(btn,danger);else menu.appendChild(btn);
    });
  }

  function enhanceBulk(root){
    root=root||document.getElementById('p-monthly');
    if(!root)return;
    var toolbar=root.querySelector('.list-toolbar');
    if(!toolbar)return;
    var selected=0;
    try{selected=typeof SELECTED_ITEMS!=='undefined'?SELECTED_ITEMS.size:0;}catch(_e){}
    var existing=toolbar.querySelector('[data-rt-sales-undo-bulk]');
    if(!selected){if(existing)existing.remove();return;}
    if(existing)return;

    var eligible=0;
    try{eligible=Array.from(SELECTED_ITEMS).filter(function(id){return !!latestSaleUndo(id);}).length;}catch(_e2){}
    var btn=document.createElement('button');
    btn.type='button';
    btn.className='bulk-ctrl rt-sales-bulk-undo';
    btn.setAttribute('data-rt-sales-undo-bulk','1');
    btn.disabled=eligible===0;
    btn.title=eligible?('Undo '+eligible+' selected sale'+(eligible===1?'':'s')):'Selected sales need individual undo';
    btn.innerHTML=undoSvg()+' Undo sale';
    btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();bulkUndo();});

    var del=toolbar.querySelector('.bulk-ctrl.is-danger');
    if(del)toolbar.insertBefore(btn,del);else toolbar.appendChild(btn);
  }

  function installStyle(){
    if(document.getElementById('rt-sales-undo-style'))return;
    var style=document.createElement('style');
    style.id='rt-sales-undo-style';
    style.textContent='.rt-sales-bulk-undo{color:var(--text-secondary)!important}.rt-sales-bulk-undo:not(:disabled){border-color:color-mix(in srgb,var(--accent) 36%,var(--border))!important;color:var(--text)!important}.rt-sales-bulk-undo:disabled{opacity:.42;cursor:not-allowed}.rt-sales-undo-item{color:var(--accent)!important}@media(max-width:520px){.rt-sales-bulk-undo{padding-left:12px!important;padding-right:12px!important}}';
    document.head.appendChild(style);
  }

  function enhance(){
    var page=document.getElementById('p-monthly');
    if(!page)return;
    enhanceBulk(page);
    enhanceMenus(page);
  }

  /* Selection toggles and list refreshes already funnel through renderMonth().
     Enhance immediately after that render; no global observer/polling is needed. */
  try{
    if(typeof renderMonth==='function'&&!renderMonth._rtSalesUndoWrapped){
      var baseRenderMonth=renderMonth;
      var wrapped=function(){var out=baseRenderMonth.apply(this,arguments);enhance();return out;};
      wrapped._rtSalesUndoWrapped=true;
      window.renderMonth=wrapped;
    }
  }catch(e){console.warn('[RETRADE] sales undo render hook failed',e);}

  installStyle();
  enhance();

  window.rtUndoSalesItem=undoSingle;
  window.rtBulkUndoSales=bulkUndo;
  window.__RT_SALES_UNDO={build:BUILD,enhance:enhance,latestSaleUndo:latestSaleUndo};
  console.info('[RETRADE] sales undo loaded',BUILD);
})();
