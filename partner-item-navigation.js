/* RETRADE partner item navigation v1.4.60
 * Partner/account item rows are primary navigation, not popup previews.
 *
 * Flow:
 *   Partners -> partner detail -> item row -> full item page -> Back -> same partner
 *
 * Selection mode keeps its existing bulk-select behaviour. Buttons inside a row
 * (settle, edit split, relist, etc.) keep their own actions and do not navigate.
 */
(function(){
  'use strict';

  var returnContext=null;

  function accountById(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }

  function isInteractiveTarget(target){
    if(!target||!target.closest)return false;
    return !!target.closest('button,a,input,select,textarea,[contenteditable="true"]');
  }

  function openAccountItemPage(month,itemId,accountId){
    var acct=accountById(accountId);
    if(!acct){
      try{toast('Partner not found','error');}catch(_){}
      return;
    }

    returnContext={
      accountId:acct.id,
      scrollY:window.scrollY||0
    };

    try{if(typeof closeSearchDropdown==='function')closeSearchDropdown();}catch(_){}
    try{if(typeof closeMoreSheet==='function')closeMoreSheet();}catch(_){}
    try{if(typeof window._resetNavScrollState==='function')window._resetNavScrollState();}catch(_){}

    // The partner detail and item detail intentionally reuse #p-item. Swap the
    // contents in-place so there is no intermediate list page or slide-over.
    _itemPageOrigin='p-account-detail';
    window.scrollTo(0,0);
    renderItemPage(month,itemId);
    try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}
  }
  window.openAccountItemPage=openAccountItemPage;

  function wirePartnerRows(acct){
    var page=document.getElementById('p-item');
    if(!page||!acct)return;

    page.querySelectorAll('.account-group .metric-inline').forEach(function(row){
      var title=row.querySelector('.metric-k.clickable[data-itemid][data-month]');
      if(!title)return; // selection-mode rows intentionally have no clickable title

      var month=title.dataset.month;
      var itemId=title.dataset.itemid;
      if(!month||!itemId)return;

      // Remove the old preview/job-lot inline click. The whole visual row now
      // behaves as one item-navigation target, which is both faster and clearer.
      title.removeAttribute('onclick');
      title.style.cursor='inherit';
      row.style.cursor='pointer';
      row.setAttribute('role','button');
      row.setAttribute('tabindex','0');
      row.setAttribute('aria-label','Open '+(title.textContent||'item'));

      var navigate=function(ev){
        if(ev&&isInteractiveTarget(ev.target))return;
        openAccountItemPage(month,itemId,acct.id);
      };
      row.addEventListener('click',navigate);
      row.addEventListener('keydown',function(ev){
        if(ev.key!=='Enter'&&ev.key!==' ')return;
        if(isInteractiveTarget(ev.target)&&ev.target!==row)return;
        ev.preventDefault();
        openAccountItemPage(month,itemId,acct.id);
      });
    });
  }

  if(typeof _renderAccountPage==='function'){
    var baseRenderAccountPage=_renderAccountPage;
    _renderAccountPage=function(acct){
      var result=baseRenderAccountPage.apply(this,arguments);
      try{wirePartnerRows(acct);}catch(err){console.warn('[RETRADE] partner row navigation polish failed',err);}
      return result;
    };
  }

  if(typeof exitItemPage==='function'){
    var baseExitItemPage=exitItemPage;
    exitItemPage=function(){
      if(returnContext&&_itemPageOrigin==='p-account-detail'){
        var ctx=returnContext;
        returnContext=null;
        var acct=accountById(ctx.accountId);
        if(acct){
          try{if(typeof window._resetNavScrollState==='function')window._resetNavScrollState();}catch(_){}
          try{if(typeof _deactivatePages==='function')_deactivatePages();}catch(_){}
          document.querySelectorAll('.tab,.bnt').forEach(function(el){el.classList.remove('on');});
          var page=document.getElementById('p-item');
          if(page)page.classList.add('on');
          _itemPageOrigin='p-accounts';
          _renderAccountPage(acct);
          requestAnimationFrame(function(){
            requestAnimationFrame(function(){window.scrollTo(0,ctx.scrollY||0);});
          });
          try{if(typeof handleNavResize==='function')handleNavResize();}catch(_){}
          try{if(typeof _syncFabVisibility==='function')_syncFabVisibility();}catch(_){}
          return;
        }
        // Account was removed while the item was open: safely fall back to the
        // normal Partners list rather than leaving an invalid synthetic origin.
        _itemPageOrigin='p-accounts';
      }
      return baseExitItemPage.apply(this,arguments);
    };
  }

  console.info('[RETRADE] v1.4.60 partner item direct navigation loaded');
})();
