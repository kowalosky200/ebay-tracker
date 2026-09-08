/* RETRADE sourced-stock panel profit coherence.
 *
 * The unlisted/sourced item slide panel already shows an estimated sale price,
 * but historically its small “est +£x” helper was only sale price minus capital.
 * That is not the app's real expected-profit estimate because it ignores the
 * canonical estimated platform/promo/fulfilment drag and any partner share.
 *
 * This layer keeps the compact panel in sync with Full Details by reusing
 * _estPotentialNet() / _estPartnerCut(). It does not define accounting rules.
 */
(function(){
  'use strict';

  if(window.__RETRADE_STOCK_DETAIL_PROFIT__)return;
  window.__RETRADE_STOCK_DETAIL_PROFIT__='20260907-1';

  var active=null;
  var scheduled=false;

  function itemFor(m,id){
    try{return (DB[m]||[]).find(function(x){return x&&x.id===id;})||null;}
    catch(_){return null;}
  }
  function money(v){
    try{return typeof fmt==='function'?fmt(Number(v)||0):('£'+(Number(v)||0).toFixed(2));}
    catch(_){return '£'+(Number(v)||0).toFixed(2);}
  }
  function panelToken(panel,id){
    var wanted='tok-estSalePrice-'+id;
    var nodes=panel.querySelectorAll('.ip-token');
    for(var i=0;i<nodes.length;i++)if(nodes[i].id===wanted)return nodes[i];
    return null;
  }
  function profitToken(panel,id){
    var wanted='tok-estProfit-'+id;
    var nodes=panel.querySelectorAll('[data-sourced-est-profit]');
    for(var i=0;i<nodes.length;i++)if(nodes[i].id===wanted)return nodes[i];
    return null;
  }
  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text;}

  function syncPanel(m,id){
    var panel=document.getElementById('panel-content');
    var item=itemFor(m,id);
    if(!panel||!item||item.state!=='sourced')return;

    var saleToken=panelToken(panel,id);
    if(!saleToken)return; // no estimate yet -> no estimated-profit claim

    // The old helper was a naive sale-price-minus-capital delta and could look
    // like profit while disagreeing with the app's real forecast. Keep this card
    // purely as the editable expected sale value.
    var saleSub=saleToken.querySelector('.ip-token-sub');
    if(saleSub)setText(saleSub,'✎ Tap to edit');

    var net=null,cut=null;
    try{net=(typeof _estPotentialNet==='function')?_estPotentialNet(item):null;}catch(_){net=null;}
    try{cut=(typeof _estPartnerCut==='function')?_estPartnerCut(item):null;}catch(_){cut=null;}

    var existing=profitToken(panel,id);
    if(net===null||net===undefined||!isFinite(Number(net))){
      if(existing)existing.remove();
      return;
    }

    var grid=saleToken.parentElement;
    if(!grid)return;
    if(!existing){
      existing=document.createElement('div');
      existing.className='ip-token locked';
      existing.id='tok-estProfit-'+id;
      existing.setAttribute('data-sourced-est-profit','true');
      existing.innerHTML='<div class="ip-token-label">Est. Profit</div><div class="ip-token-val" data-est-profit-value></div><div class="ip-token-sub" data-est-profit-sub></div>';
      grid.appendChild(existing); // fourth cell: balances the existing 2-column grid
    }else if(existing.parentElement!==grid){
      grid.appendChild(existing);
    }

    var n=Number(net)||0;
    var value=(n>=0?'+':'')+money(n);
    var margin=(Number(item.estSalePrice)||0)>0?Math.round((n/Number(item.estSalePrice))*100):null;
    var sub=(cut!==null&&cut!==undefined&&isFinite(Number(cut))&&Number(cut)>0)
      ?('after '+money(cut)+' partner share')
      :(margin!==null?(margin+'% margin est.'):'after estimated costs');

    var valueEl=existing.querySelector('[data-est-profit-value]');
    var subEl=existing.querySelector('[data-est-profit-sub]');
    setText(valueEl,value);
    setText(subEl,sub);
    if(valueEl)valueEl.style.color=n>=0?'var(--green)':'var(--red)';
  }

  function scheduleSync(){
    if(scheduled||!active)return;
    scheduled=true;
    requestAnimationFrame(function(){
      scheduled=false;
      if(active)syncPanel(active.m,active.id);
    });
  }

  // Reconcile every time the sourced item panel is rendered/re-rendered. This
  // covers account assignment changes because core deliberately reopens the panel.
  if(typeof window.openItemDetail==='function'){
    var coreOpenItemDetail=window.openItemDetail;
    window.openItemDetail=function(m,id,noHistory){
      var item=itemFor(m,id);
      active=(item&&item.state==='sourced')?{m:m,id:id}:null;
      var out=coreOpenItemDetail.apply(this,arguments);
      if(active)syncPanel(m,id);
      return out;
    };
  }

  // Parts/expenses can be added inline without rebuilding the whole panel.
  // Recalculate expected profit immediately so it never lags behind those costs.
  if(typeof window.refreshPanelParts==='function'){
    var coreRefreshPanelParts=window.refreshPanelParts;
    window.refreshPanelParts=function(m,id){
      var out=coreRefreshPanelParts.apply(this,arguments);
      var item=itemFor(m,id);
      if(item&&item.state==='sourced'){
        active={m:m,id:id};
        syncPanel(m,id);
      }
      return out;
    };
  }

  // Token editing mutates the Est. Sale card in place. A tiny observer scoped to
  // the slide-panel content catches that specific DOM change (and panel rebuilds)
  // without observing document/global style mutations.
  var panel=document.getElementById('panel-content');
  if(panel&&typeof MutationObserver!=='undefined'){
    var observer=new MutationObserver(function(){scheduleSync();});
    observer.observe(panel,{childList:true,subtree:true,characterData:true});
  }
})();
