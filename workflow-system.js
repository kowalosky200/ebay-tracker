/* RETRADE workflow coherence layer.
 * Keeps navigation intent and item editing stable without touching accounting,
 * lifecycle calculations, or Supabase persistence.
 */
(function(){
  'use strict';

  var BUILD='20260907-workflow-1';
  var accountPanelOrigin=null;
  var saveTimers=new Map();

  function getItem(month,id){
    try{return (DB[month]||[]).find(function(x){return x&&x.id===id;})||null;}catch(e){return null;}
  }

  function resetStockNavToListed(){
    try{
      STOCK_STATE_FILTER='listed';
      STOCK_FILTER='all';
      STOCK_SOURCED_FILTER='all';
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

  function anotherWorkflowInputFocused(root,current){
    var a=document.activeElement;
    return !!(a&&a!==current&&root&&root.contains(a)&&a.classList&&a.classList.contains('rt-token-native'));
  }

  function refreshAfterTokenEdit(root,month,id,current){
    setTimeout(function(){
      if(anotherWorkflowInputFocused(root,current))return;
      try{
        if(root&&root.id==='slide-panel'){
          if(typeof openItemDetail==='function')openItemDetail(month,id,true);
        }else if(document.getElementById('p-item')&&document.getElementById('p-item').classList.contains('on')){
          if(typeof renderItemPage==='function')renderItemPage(month,id);
        }
      }catch(err){console.error('[RETRADE] workflow refresh failed',err);}
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
    input.setAttribute('aria-label',(token.querySelector('.ip-token-label')||{}).textContent||field);
    input.value=rawTokenValue(item,field);
    input.dataset.lastCommitted=String(input.value);

    val.textContent='';
    val.appendChild(input);
    token.classList.add('rt-native-edit');

    var commit=function(){
      var now=String(input.value);
      if(now===input.dataset.lastCommitted)return false;
      applyTokenValue(item,field,now);
      input.value=rawTokenValue(item,field);
      input.dataset.lastCommitted=String(input.value);
      queueSave(month+'|'+id);
      return true;
    };

    input.addEventListener('pointerdown',function(e){e.stopPropagation();});
    input.addEventListener('click',function(e){e.stopPropagation();});
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'){
        e.preventDefault();
        commit();
        input.blur();
      }
      if(e.key==='Escape'){
        e.preventDefault();
        input.value=input.dataset.lastCommitted;
        input.blur();
      }
    });
    input.addEventListener('blur',function(){
      var changed=commit();
      if(changed)refreshAfterTokenEdit(root,month,id,input);
    });
  }

  function clarifyCurrentPrice(root,item){
    if(!root||!item)return;
    var activeListing=!item.dateSold&&!item.resaleSalePrice&&!item.isReturned&&item.state!=='sourced'&&!item.scrappedAt;
    if(activeListing){
      var saleTok=root.querySelector('#tok-salePrice-'+CSS.escape(item.id));
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

  function installItemRenderEnhancer(){
    if(typeof window.renderItemPage==='function'&&!window.renderItemPage._rtWorkflowWrapped){
      var baseRender=window.renderItemPage;
      var wrappedRender=function(month,id){
        var out=baseRender.apply(this,arguments);
        try{enhanceTokenEditors(document.getElementById('p-item'),month,id);}catch(e){console.error('[RETRADE] item editor enhancement failed',e);}
        return out;
      };
      wrappedRender._rtWorkflowWrapped=true;
      window.renderItemPage=wrappedRender;
    }

    if(typeof window.openItemDetail==='function'&&!window.openItemDetail._rtWorkflowWrapped){
      var baseDetail=window.openItemDetail;
      var wrappedDetail=function(month,id){
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
        var tok=document.getElementById('tok-'+field+'-'+id);
        var native=tok&&tok.querySelector('.rt-token-native');
        if(native){
          try{native.focus({preventScroll:true});}catch(e){native.focus();}
          try{native.select();}catch(e){}
          return;
        }
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
        return baseFromPanel.apply(this,arguments);
      };
      wrappedFromPanel._rtWorkflowWrapped=true;
      window.openItemPageFromPanel=wrappedFromPanel;
    }

    if(typeof window.openItemPage==='function'&&!window.openItemPage._rtWorkflowWrapped){
      var baseOpenPage=window.openItemPage;
      var wrappedOpenPage=function(){
        accountPanelOrigin=null;
        return baseOpenPage.apply(this,arguments);
      };
      wrappedOpenPage._rtWorkflowWrapped=true;
      window.openItemPage=wrappedOpenPage;
    }

    if(typeof window.exitItemPage==='function'&&!window.exitItemPage._rtWorkflowWrapped){
      var baseExit=window.exitItemPage;
      var wrappedExit=function(){
        if(accountPanelOrigin){
          try{
            var acct=(typeof _accounts!=='undefined'?_accounts:[]).find(function(a){return a&&a.id===accountPanelOrigin.accountId;});
            if(acct&&typeof _renderAccountPage==='function'){
              /* p-item is shared by account detail and item detail. Restore the
                 account DOM BEFORE app-core reactivates the saved panel origin,
                 otherwise Back can reopen the item panel over the item page. */
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
        return out;
      };
      wrappedExit._rtWorkflowWrapped=true;
      window.exitItemPage=wrappedExit;
    }
  }

  function injectStyles(){
    if(document.getElementById('rt-workflow-styles'))return;
    var style=document.createElement('style');
    style.id='rt-workflow-styles';
    style.textContent=[
      '.ip-token.rt-native-edit{cursor:text;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      '.ip-token.rt-native-edit .ip-token-val{display:flex;align-items:center;min-width:0}',
      '.rt-token-native{display:block;width:100%;min-width:0;margin:0;padding:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-weight:inherit;line-height:inherit;letter-spacing:inherit;-webkit-appearance:none;appearance:none;touch-action:manipulation}',
      '.rt-token-native:focus{outline:none}',
      '.ip-token.rt-native-edit:focus-within{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-dim)}',
      '.rt-receipt-price-mirror{font-weight:600;color:var(--green);white-space:nowrap}',
      '@media(max-width:600px){.rt-token-native{font-size:16px!important}.ip-token.rt-native-edit{min-height:92px}}'
    ].join('');
    document.head.appendChild(style);
  }

  injectStyles();
  installItemRenderEnhancer();
  installAccountPanelReturnFix();
  console.info('[RETRADE] workflow coherence layer loaded',BUILD);
})();
