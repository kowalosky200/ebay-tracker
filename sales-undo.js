/* RETRADE Sales undo affordances.
 *
 * Adds Undo to Sales bulk-selection controls and per-item ⋮ menus without
 * inventing a second lifecycle engine. Single-item undo prefers the canonical
 * Activity snapshot when it is the latest safe change and falls back to the
 * existing lifecycle stepBack() path. Bulk undo uses only Activity entries that
 * are currently marked safe/undoable, so grouped orders, Job Lots and stale
 * history are never force-reversed.
 *
 * UI/workflow only — no accounting formulas, sale calculations or persistence
 * semantics are redefined here.
 */
(function(){
  'use strict';

  if(window.__RT_SALES_UNDO)return;
  var BUILD='20260908-sales-undo-1';

  function latestActiveIds(){
    var out={};
    var stamp={};
    (DB.activityLog||[]).forEach(function(log,idx){
      if(!log||log.undone||!log.itemId)return;
      var ts=Number(log.ts)||0;
      var prev=stamp[log.itemId];
      if(!prev||ts>prev.ts||(ts===prev.ts&&idx>prev.idx)){
        stamp[log.itemId]={ts:ts,idx:idx};
        out[log.itemId]=log.id;
      }
    });
    return out;
  }

  function latestUndo(itemId){
    if(!itemId)return null;
    var ids=latestActiveIds();
    var log=(DB.activityLog||[]).find(function(row){return row&&row.id===ids[itemId];});
    if(!log)return null;
    if(typeof _activityUndoState==='function'){
      var state=_activityUndoState(log,ids);
      return state&&state.ok?{log:log,state:state}:null;
    }
    if(log.undone||!log.undoable||!log.before)return null;
    return {log:log,state:{ok:true,reason:''}};
  }

  function recordFor(itemId){
    try{return typeof _findItemRecordById==='function'?_findItemRecordById(itemId):null;}catch(_e){return null;}
  }

  function fallbackTitle(itemId){
    var rec=recordFor(itemId);
    if(!rec||!rec.item||typeof _stepBackTitle!=='function')return null;
    try{return _stepBackTitle(rec.item)||null;}catch(_e){return null;}
  }

  function canUndoSingle(itemId){
    return !!latestUndo(itemId)||!!fallbackTitle(itemId);
  }

  async function undoSingle(itemId){
    var safe=latestUndo(itemId);
    var rec=recordFor(itemId);
    if(safe&&typeof undoActivity==='function'){
      var action=String(safe.log.action||'latest change');
      var itemName=(rec&&rec.item&&rec.item.item)||safe.log.itemName||'this item';
      var ok=typeof showConfirm==='function'
        ?await showConfirm('Undo latest change?','Reverse “'+action+'” for '+itemName+' and restore the item to its immediately previous recorded state.',{okLabel:'Undo',danger:false})
        :true;
      if(!ok)return;
      undoActivity(safe.log.id);
      if(document.querySelector('.page.on')&&document.querySelector('.page.on').id==='p-monthly'&&typeof renderMonth==='function')renderMonth();
      return;
    }

    if(rec&&typeof stepBack==='function'&&fallbackTitle(itemId)){
      return stepBack(rec.month,itemId);
    }
    if(typeof toast==='function')toast('No undoable change is available for this item','err');
  }

  async function bulkUndo(){
    var ids=Array.from(typeof SELECTED_ITEMS!=='undefined'?SELECTED_ITEMS:[]);
    if(!ids.length)return;

    var eligible=[];
    ids.forEach(function(id){var u=latestUndo(id);if(u)eligible.push({id:id,undo:u});});
    if(!eligible.length){
      if(typeof toast==='function')toast('None of the selected items has a batch-safe undo. Use ⋮ for an individual lifecycle undo.','err');
      return;
    }

    var blocked=ids.length-eligible.length;
    var n=eligible.length;
    var msg='Restore '+n+(n===1?' selected item':' selected items')+' to the state immediately before '+(n===1?'its':'their')+' latest recorded change.';
    if(blocked)msg+=' '+blocked+' selected item'+(blocked===1?' is':'s are')+' protected or not currently undoable and will be left unchanged.';
    var ok=typeof showConfirm==='function'
      ?await showConfirm('Undo '+n+(n===1?' selected item?':' selected items?'),msg,{okLabel:'Undo selected',danger:false})
      :true;
    if(!ok)return;

    eligible.forEach(function(entry){
      try{undoActivity(entry.undo.log.id);}catch(e){console.warn('[RETRADE] bulk undo failed for',entry.id,e);}
    });

    try{SELECTED_ITEMS.clear();SELECTION_MODE=false;}catch(_e){}
    if(typeof renderMonth==='function')renderMonth();
    if(typeof toast==='function')toast('Undid '+n+(n===1?' selected change':' selected changes')+(blocked?' · '+blocked+' skipped':''));
  }

  function itemIdFromDd(wrap){
    if(!wrap||!wrap.id||wrap.id.indexOf('dd-')!==0)return null;
    return wrap.id.slice(3).replace(/-s\d+$/,'');
  }

  function enhanceMenus(root){
    root=root||document.getElementById('p-monthly');
    if(!root)return;
    root.querySelectorAll('.ddwrap[id^="dd-"]').forEach(function(wrap){
      if(wrap.dataset.rtUndoEnhanced==='1')return;
      var itemId=itemIdFromDd(wrap);
      if(!itemId||!recordFor(itemId)||!canUndoSingle(itemId))return;
      var menu=wrap.querySelector('.ddmenu');
      if(!menu)return;

      var btn=document.createElement('button');
      btn.type='button';
      btn.className='rt-sales-undo-item';
      btn.innerHTML=(typeof icon==='function'?icon('undo',14):'↶')+' Undo latest change';
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        try{if(typeof toggleDD==='function')toggleDD(wrap.id);}catch(_e){}
        undoSingle(itemId);
      });

      var danger=menu.querySelector('button.danger');
      if(danger)menu.insertBefore(btn,danger);else menu.appendChild(btn);
      wrap.dataset.rtUndoEnhanced='1';
    });
  }

  function enhanceBulk(root){
    root=root||document.getElementById('p-monthly');
    if(!root)return;
    var toolbar=root.querySelector('.list-toolbar');
    if(!toolbar)return;
    var selected=typeof SELECTED_ITEMS!=='undefined'?SELECTED_ITEMS.size:0;
    if(!selected)return;
    if(toolbar.querySelector('.rt-sales-bulk-undo'))return;

    var eligible=Array.from(SELECTED_ITEMS).filter(function(id){return !!latestUndo(id);}).length;
    var btn=document.createElement('button');
    btn.type='button';
    btn.className='bulk-ctrl rt-sales-bulk-undo';
    btn.disabled=eligible===0;
    btn.title=eligible?('Undo latest change for '+eligible+' selected item'+(eligible===1?'':'s')):'No selected item has a batch-safe undo';
    btn.innerHTML=(typeof icon==='function'?icon('undo',14):'↶')+' Undo';
    btn.addEventListener('click',function(e){e.stopPropagation();bulkUndo();});

    var del=toolbar.querySelector('.bulk-ctrl.is-danger');
    if(del)toolbar.insertBefore(btn,del);else toolbar.appendChild(btn);
  }

  function installStyle(){
    if(document.getElementById('rt-sales-undo-style'))return;
    var style=document.createElement('style');
    style.id='rt-sales-undo-style';
    style.textContent='.rt-sales-bulk-undo{color:var(--text-secondary)!important}.rt-sales-bulk-undo:not(:disabled){border-color:color-mix(in srgb,var(--accent) 36%,var(--border))!important;color:var(--text)!important}.rt-sales-bulk-undo:disabled{opacity:.42;cursor:not-allowed}@media(max-width:520px){.rt-sales-bulk-undo{padding-left:12px!important;padding-right:12px!important}}';
    document.head.appendChild(style);
  }

  function enhance(){
    var page=document.getElementById('p-monthly');
    if(!page)return;
    enhanceBulk(page);
    enhanceMenus(page);
  }

  try{
    if(typeof renderMonth==='function'&&!renderMonth._rtSalesUndoWrapped){
      var baseRenderMonth=renderMonth;
      var wrapped=function(){
        var out=baseRenderMonth.apply(this,arguments);
        enhance();
        return out;
      };
      wrapped._rtSalesUndoWrapped=true;
      window.renderMonth=wrapped;
    }
  }catch(e){console.warn('[RETRADE] sales undo render hook failed',e);}

  installStyle();
  enhance();

  window.rtUndoSalesItem=undoSingle;
  window.rtBulkUndoSales=bulkUndo;
  window.__RT_SALES_UNDO={build:BUILD,enhance:enhance,latestUndo:latestUndo};
  console.info('[RETRADE] sales undo loaded',BUILD);
})();
