/* RETRADE workflow coherence layer.
 * Keeps navigation intent and item editing stable without touching accounting,
 * lifecycle calculations, or Supabase persistence.
 */
(function(){
  'use strict';

  var BUILD='20260907-workflow-4';
  var accountPanelOrigin=null;
  var fullPageFromPanel=false;
  var openingFromPanel=false;
  var saveTimers=new Map();

  function getItem(month,id){
    try{return (DB[month]||[]).find(function(x){return x&&x.id===id;})||null;}catch(e){return null;}
  }

  function resetStockNavToListed(){
    try{
      STOCK_STATE_FILTER='listed';
      STOCK_FILTER='all';
      STOCK_SOURCED_FILTER='all';
      STOCK_SEARCH='';
      if(typeof _scrollMap!=='undefined')delete _scrollMap.stock;
    }catch(e){}
  }

  /* A deliberate tap on Stock is a fresh operating destination: Listed.
     Internal routes such as “view Unlisted” still work because they call
     goToTab() programmatically and never pass through this user-click hook. */
  document.addEventListener('click',function(e){
    var target=e.target&&e.target.closest?e.target.closest('[data-tab="stock"]'):null;
    if(!target)return;
    resetStockNavToListed();
  },true);

  function queueSave(key){
    if(saveTimers.has(key))clearTimeout(saveTimers.get(key));
    saveTimers.set(key,setTimeout(function(){
      saveTimers.delete(key);
      try{if(typeof saveDB==='function')saveDB();}catch(err){console.error('[RETRADE] workflow save failed',err);}
    },0));
  }

  function recomputeItem(item){
    try{
      if(item&&(item.dateSold||item.isReturned||item.resaleSalePrice)&&typeof calcGrossProfit==='function'){
        item.grossProfit=calcGrossProfit(item);
      }
    }catch(e){}
  }

  function tokenFieldFromId(tokenId,itemId){
    var suffix='-'+itemId;
    if(!tokenId||tokenId.slice(-suffix.length)!==suffix)return null;
    var field=tokenId.slice(4,-suffix.length);
    return ['salePrice','costPrice','promoPercent','estSalePrice'].indexOf(field)>=0?field:null;
  }

  function rawTokenValue(item,field){
    if(field==='promoPercent')return +((Number(item.promoPercent)||0)*100).toFixed(2);
    var v=item[field];
    return v==null?'':+Number(v).toFixed(2);
  }

  function applyTokenValue(item,field,raw){
    var txt=String(raw==null?'':raw).trim().replace(',','.');
    var n=txt===''?0:parseFloat(txt);
    if(!isFinite(n))n=0;
    n=Math.max(0,n);
    if(field==='promoPercent')item.promoPercent=+(n/100).toFixed(4);
    else item[field]=+n.toFixed(2);
    recomputeItem(item);
  }

  function pageOwnsItem(id){
    var page=document.getElementById('p-item');
    return !!(page&&page.classList.contains('on')&&page.dataset.rtWorkflowView==='item'&&page.dataset.rtWorkflowItem===String(id));
  }

  function panelIsSuspended(){
    var panel=document.getElementById('slide-panel');
    return !!(panel&&panel.dataset.rtWorkflowSuspended==='true');
  }

  function suspendPanelForFullItem(){
    var panel=document.getElementById('slide-panel');
    if(!panel||panel.dataset.rtWorkflowSuspended==='true')return;

    var active=document.activeElement;
    if(active&&panel.contains(active)){
      try{active.blur();}catch(e){}
    }

    panel.dataset.rtWorkflowSuspended='true';
    panel.setAttribute('aria-hidden','true');
    try{panel.inert=true;}catch(e){}

    /* Full Details and the slide-out render the same token IDs. While Full Details
       owns the item, remove the popup copies from the document ID namespace so no
       legacy document.getElementById() call can silently edit the hidden popup. */
    panel.querySelectorAll('[id^="tok-"]').forEach(function(el){
      if(el.dataset.rtOriginalId)return;
      el.dataset.rtOriginalId=el.id;
      el.removeAttribute('id');
    });
  }

  function restoreSuspendedPanel(){
    var panel=document.getElementById('slide-panel');
    if(!panel||panel.dataset.rtWorkflowSuspended!=='true')return;

    panel.querySelectorAll('[data-rt-original-id]').forEach(function(el){
      el.id=el.dataset.rtOriginalId;
      delete el.dataset.rtOriginalId;
    });
    delete panel.dataset.rtWorkflowSuspended;
    panel.removeAttribute('aria-hidden');
    try{panel.inert=false;}catch(e){}
  }

  function activeItemRoot(id){
    if(pageOwnsItem(id))return document.getElementById('p-item');
    var panel=document.getElementById('slide-panel');
    if(panel&&!panelIsSuspended())return panel;
    return null;
  }

  function tokenInRoot(root,field,id){
    if(!root)return null;
    var wanted='tok-'+field+'-'+id;
    var tokens=root.querySelectorAll('.ip-token[id]');
    for(var n=0;n<tokens.length;n++)if(tokens[n].id===wanted)return tokens[n];
    return null;
  }

  function updateReceiptMirror(root,item,field){
    if(!root||field!=='salePrice')return;
    var mirror=root.querySelector('.rt-receipt-price-mirror');
    if(mirror)mirror.textContent='£'+(Number(item.salePrice)||0).toFixed(2);
  }

  function selectNativeInput(input){
    if(!input)return;
    try{input.focus({preventScroll:true});}catch(e){try{input.focus();}catch(_e){}}
    try{input.select();}catch(e2){
      try{input.setSelectionRange(0,String(input.value||'').length);}catch(_e2){}
    }
    setTimeout(function(){
      if(document.activeElement!==input)return;
      try{input.select();}catch(e3){
        try{input.setSelectionRange(0,String(input.value||'').length);}catch(_e3){}
      }
    },0);
  }

  function makeNativeTokenInput(token,item,field,month,id,root){
    if(!token||token.classList.contains('locked'))return;
    var val=token.querySelector('.ip-token-val');
    if(!val)return;
    var existing=val.querySelector('.rt-token-native');
    if(existing)return;

    var input=document.createElement('input');
    input.className='rt-token-native';
    input.type='text';
    input.inputMode='decimal';
    input.autocomplete='off';
    input.spellcheck=false;
    input.setAttribute('autocorrect','off');
    input.setAttribute('autocapitalize','off');
    input.setAttribute('aria-label',(token.querySelector('.ip-token-label')||{}).textContent||field);
    input.value=rawTokenValue(item,field);
    input.dataset.lastCommitted=String(input.value);

    val.textContent='';
    val.appendChild(input);
    token.classList.add('rt-native-edit');
    token.dataset.rtNativeEditor='1';

    /* The stable input replaces app-core's temporary inject/blur/re-render editor.
       A card can never invoke both editing systems. */
    token.removeAttribute('onpointerdown');
    token.removeAttribute('onclick');
    try{token.onpointerdown=null;token.onclick=null;}catch(e){}

    /* Live input owns the visible value. Do not normalise the text while typing:
       values such as `49.` must remain visible exactly as entered until Done/blur. */
    var live=function(){
      applyTokenValue(item,field,input.value);
      input.dataset.rtDirty='1';
      updateReceiptMirror(root,item,field);
    };

    var commit=function(){
      var dirty=input.dataset.rtDirty==='1';
      var now=String(input.value);
      if(!dirty&&now===input.dataset.lastCommitted)return false;
      applyTokenValue(item,field,now);
      input.value=rawTokenValue(item,field);
      input.dataset.lastCommitted=String(input.value);
      delete input.dataset.rtDirty;
      updateReceiptMirror(root,item,field);
      queueSave(month+'|'+id);
      return true;
    };

    var cancel=function(){
      input.value=input.dataset.lastCommitted;
      applyTokenValue(item,field,input.value);
      delete input.dataset.rtDirty;
      updateReceiptMirror(root,item,field);
    };

    input.addEventListener('input',live);
    input.addEventListener('pointerdown',function(e){e.stopPropagation();});
    input.addEventListener('click',function(e){e.stopPropagation();});
    input.addEventListener('focus',function(){token.classList.add('rt-native-focused');});
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'){
        e.preventDefault();
        commit();
        input.blur();
      }
      if(e.key==='Escape'){
        e.preventDefault();
        cancel();
        input.blur();
      }
    });
    input.addEventListener('blur',function(){
      token.classList.remove('rt-native-focused');
      commit();
      /* Deliberately no render/navigation here. A field edit changes data only.
         Full Details stays Full Details; Back is the only action that restores
         the originating popup. This also removes a costly full-page rebuild from
         the common one-number edit path. */
    });

    /* Fallback independent of workflow-qol: the entire card is a real focus
       target and the current value is selected in the same user gesture. */
    token.addEventListener('click',function(e){
      if(e.target===input)return;
      selectNativeInput(input);
    });
  }

  function clarifyCurrentPrice(root,item){
    if(!root||!item)return;
    var activeListing=!item.dateSold&&!item.resaleSalePrice&&!item.isReturned&&item.state!=='sourced'&&!item.scrappedAt;
    if(activeListing){
      var saleTok=tokenInRoot(root,'salePrice',item.id);
      if(saleTok){
        var label=saleTok.querySelector('.ip-token-label');
        if(label)label.textContent='Asking Price';
      }
    }

    /* Fresh active listings previously exposed TWO live Sale Price editors: the
       headline card and the P&L receipt. Keep one obvious editor (the headline)
       and make the receipt a read-only mirror. Sold items and historical Sale 1
       snapshots stay editable for correction. */
    var hasFullReturn=(item.returnHistory||[]).some(function(r){return r&&(/^full_/.test(String(r.type||'')));});
    if(activeListing&&!hasFullReturn){
      var receiptInput=root.querySelector('.rcpt-s1-price-input');
      if(receiptInput){
        var parent=receiptInput.parentElement;
        if(parent){
          var mirror=document.createElement('span');
          mirror.className='rt-receipt-price-mirror';
          mirror.textContent='£'+(Number(item.salePrice)||0).toFixed(2);
          parent.textContent='';
          parent.appendChild(mirror);
        }
      }
    }
  }

  function markItemView(month,id){
    var page=document.getElementById('p-item');
    if(!page)return;
    page.dataset.rtWorkflowView='item';
    page.dataset.rtWorkflowItem=id||'';
    page.removeAttribute('data-rt-workflow-account');
  }

  function markAccountView(acct){
    var page=document.getElementById('p-item');
    if(!page)return;
    page.dataset.rtWorkflowView='account';
    page.dataset.rtWorkflowAccount=acct&&acct.id?acct.id:'';
    page.removeAttribute('data-rt-workflow-item');
  }

  function enhanceTokenEditors(root,month,id){
    if(!root)return;
    var item=getItem(month,id);
    if(!item)return;
    var tokens=root.querySelectorAll('.ip-token[id^="tok-"]');
    tokens.forEach(function(token){
      var field=tokenFieldFromId(token.id,id);
      if(field)makeNativeTokenInput(token,item,field,month,id,root);
    });
    clarifyCurrentPrice(root,item);
  }

  function installViewMarkers(){
    if(typeof window._renderAccountPage==='function'&&!window._renderAccountPage._rtWorkflowWrapped){
      var baseAccountRender=window._renderAccountPage;
      var wrappedAccountRender=function(acct){
        var out=baseAccountRender.apply(this,arguments);
        markAccountView(acct);
        return out;
      };
      wrappedAccountRender._rtWorkflowWrapped=true;
      window._renderAccountPage=wrappedAccountRender;
    }

    if(typeof window._acctCurrentAcct==='function'&&!window._acctCurrentAcct._rtWorkflowWrapped){
      var baseCurrentAcct=window._acctCurrentAcct;
      var wrappedCurrentAcct=function(){
        var page=document.getElementById('p-item');
        if(page&&page.dataset.rtWorkflowView==='item')return null;
        if(page&&page.dataset.rtWorkflowView==='account'&&page.dataset.rtWorkflowAccount&&typeof _accounts!=='undefined'){
          var marked=_accounts.find(function(a){return a&&a.id===page.dataset.rtWorkflowAccount;});
          if(marked)return marked;
        }
        return baseCurrentAcct.apply(this,arguments);
      };
      wrappedCurrentAcct._rtWorkflowWrapped=true;
      window._acctCurrentAcct=wrappedCurrentAcct;
    }
  }

  function installItemRenderEnhancer(){
    if(typeof window.renderItemPage==='function'&&!window.renderItemPage._rtWorkflowWrapped){
      var baseRender=window.renderItemPage;
      var wrappedRender=function(month,id){
        var out=baseRender.apply(this,arguments);
        markItemView(month,id);
        try{enhanceTokenEditors(document.getElementById('p-item'),month,id);}catch(e){console.error('[RETRADE] item editor enhancement failed',e);}
        return out;
      };
      wrappedRender._rtWorkflowWrapped=true;
      window.renderItemPage=wrappedRender;
    }

    if(typeof window.openItemDetail==='function'&&!window.openItemDetail._rtWorkflowWrapped){
      var baseDetail=window.openItemDetail;
      var wrappedDetail=function(month,id){
        /* While Full Details owns this item, stale save/render callbacks are not
           allowed to resurrect the popup underneath or above it. */
        if(panelIsSuspended()&&pageOwnsItem(id))return;
        var out=baseDetail.apply(this,arguments);
        try{enhanceTokenEditors(document.getElementById('slide-panel'),month,id);}catch(e){console.error('[RETRADE] panel editor enhancement failed',e);}
        return out;
      };
      wrappedDetail._rtWorkflowWrapped=true;
      window.openItemDetail=wrappedDetail;
    }

    if(typeof window.openTokenEdit==='function'&&!window.openTokenEdit._rtWorkflowWrapped){
      var baseOpenToken=window.openTokenEdit;
      var wrappedOpenToken=function(month,id,field){
        var root=activeItemRoot(id);
        var tok=tokenInRoot(root,field,id);
        var native=tok&&tok.querySelector('.rt-token-native');
        if(native){
          selectNativeInput(native);
          return;
        }
        /* Do not fall through to app-core while a Full Details page owns the item;
           core uses a global ID lookup and can target a duplicate popup token. */
        if(pageOwnsItem(id))return;
        return baseOpenToken.apply(this,arguments);
      };
      wrappedOpenToken._rtWorkflowWrapped=true;
      window.openTokenEdit=wrappedOpenToken;
    }
  }

  function installAccountPanelReturnFix(){
    if(typeof window.openItemPageFromPanel==='function'&&!window.openItemPageFromPanel._rtWorkflowWrapped){
      var baseFromPanel=window.openItemPageFromPanel;
      var wrappedFromPanel=function(month,id){
        var acct=null;
        try{if(typeof _acctCurrentAcct==='function')acct=_acctCurrentAcct();}catch(e){}
        accountPanelOrigin=acct?{accountId:acct.id,month:month,id:id}:null;
        fullPageFromPanel=true;
        openingFromPanel=true;
        var out;
        try{
          out=baseFromPanel.apply(this,arguments);
        }finally{
          openingFromPanel=false;
        }
        /* The base route has finished using the popup; Full Details now becomes
           the exclusive owner until Back explicitly unwinds the route. */
        suspendPanelForFullItem();
        markItemView(month,id);
        try{enhanceTokenEditors(document.getElementById('p-item'),month,id);}catch(e){console.error('[RETRADE] full-page editor enhancement failed',e);}
        return out;
      };
      wrappedFromPanel._rtWorkflowWrapped=true;
      window.openItemPageFromPanel=wrappedFromPanel;
    }

    if(typeof window.openItemPage==='function'&&!window.openItemPage._rtWorkflowWrapped){
      var baseOpenPage=window.openItemPage;
      var wrappedOpenPage=function(){
        if(!openingFromPanel){
          accountPanelOrigin=null;
          fullPageFromPanel=false;
          restoreSuspendedPanel();
        }
        return baseOpenPage.apply(this,arguments);
      };
      wrappedOpenPage._rtWorkflowWrapped=true;
      window.openItemPage=wrappedOpenPage;
    }

    if(typeof window.exitItemPage==='function'&&!window.exitItemPage._rtWorkflowWrapped){
      var baseExit=window.exitItemPage;
      var wrappedExit=function(){
        /* Back, not an edit commit, is what re-enables the originating popup. */
        if(fullPageFromPanel)restoreSuspendedPanel();

        if(accountPanelOrigin){
          try{
            var acct=(typeof _accounts!=='undefined'?_accounts:[]).find(function(a){return a&&a.id===accountPanelOrigin.accountId;});
            if(acct&&typeof _renderAccountPage==='function'){
              /* p-item is shared by account detail and item detail. Restore the
                 account DOM BEFORE app-core reactivates the saved panel origin. */
              _renderAccountPage(acct);
            }
          }catch(e){console.error('[RETRADE] account return restore failed',e);}
        }

        var hadAccountOrigin=!!accountPanelOrigin;
        var out=baseExit.apply(this,arguments);
        if(hadAccountOrigin){
          try{
            document.querySelectorAll('.tab,.bnt,.side-nav-item').forEach(function(el){
              el.classList.toggle('on',el.dataset&&el.dataset.tab==='accounts');
            });
            if(typeof handleNavResize==='function')handleNavResize();
            if(typeof _syncFabVisibility==='function')_syncFabVisibility();
          }catch(e){}
        }
        accountPanelOrigin=null;
        fullPageFromPanel=false;
        return out;
      };
      wrappedExit._rtWorkflowWrapped=true;
      window.exitItemPage=wrappedExit;
    }
  }

  function flushFocusedWorkflowInput(){
    var active=document.activeElement;
    if(active&&active.classList&&active.classList.contains('rt-token-native')){
      try{active.blur();}catch(e){}
    }
  }

  function injectStyles(){
    if(document.getElementById('rt-workflow-styles'))return;
    var style=document.createElement('style');
    style.id='rt-workflow-styles';
    style.textContent=[
      '#slide-panel[data-rt-workflow-suspended="true"]{pointer-events:none!important}',
      '.ip-token.rt-native-edit{cursor:text;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      '.ip-token.rt-native-edit .ip-token-val{display:flex;align-items:center;min-width:0;overflow:visible}',
      '.rt-token-native{display:block;width:100%;min-width:0;margin:0;padding:0;border:0;outline:0;background:transparent;color:var(--text)!important;-webkit-text-fill-color:var(--text)!important;font:inherit;font-weight:inherit;line-height:inherit;letter-spacing:inherit;-webkit-appearance:none;appearance:none;touch-action:manipulation;opacity:1!important;caret-color:var(--accent)}',
      '.rt-token-native:focus{outline:none;color:var(--text)!important;-webkit-text-fill-color:var(--text)!important}',
      '.rt-token-native::selection{background:var(--accent);color:#111827;-webkit-text-fill-color:#111827}',
      '.ip-token.rt-native-edit:focus-within{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-dim)}',
      '.ip-token.rt-native-edit:focus-within .ip-token-sub{color:var(--accent)}',
      '.rt-receipt-price-mirror{font-weight:600;color:var(--green);white-space:nowrap}',
      '@media(max-width:600px){.ip-token.rt-native-edit{min-height:92px}.rt-token-native{font-size:inherit!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  injectStyles();
  installViewMarkers();
  installItemRenderEnhancer();
  installAccountPanelReturnFix();
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flushFocusedWorkflowInput();});
  window.addEventListener('pagehide',flushFocusedWorkflowInput);
  window.__RT_WORKFLOW_SYSTEM_BUILD=BUILD;
  console.info('[RETRADE] workflow coherence layer loaded',BUILD);
})();
