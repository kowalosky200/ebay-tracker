/* RETRADE bundle presentation/navigation refinement.
 * Loaded after bundle-orders.js.
 *
 * Presentation-only responsibilities:
 * - show a bundle order in the normal swipeable side panel
 * - return child item pages back to the bundle panel
 * - allow combined Sales bundle rows to expand/collapse into their member rows
 *
 * Bundle accounting, lifecycle mutation and atomic reversal remain owned by
 * bundle-orders.js / app-core.js.
 */
(function(){
  'use strict';

  if(typeof window.openBundlePage!=='function'||typeof openPanel!=='function')return;

  var expandedBundles=new Set();
  var bundleReturnContext=null;
  var editTransition=false;
  var originalExitItemPage=typeof window.exitItemPage==='function'?window.exitItemPage:null;
  var originalOpenBundleOrderEdit=typeof window.openBundleOrderEdit==='function'?window.openBundleOrderEdit:null;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function money(v){return typeof fmt==='function'?fmt(num(v)):'£'+num(v).toFixed(2);}
  function html(v){return typeof esc==='function'?esc(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function quote(v){return String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');}
  function itemsFor(bid){return typeof _bundleItems==='function'?(_bundleItems(bid)||[]):[];}
  function cycleFor(i,bid){return typeof _bundleMemberCycle==='function'?_bundleMemberCycle(i,bid):null;}
  function memberProfit(i,bid){try{return typeof _bundleMemberProfit==='function'?num(_bundleMemberProfit(i,bid)):0;}catch(_){return 0;}}

  function injectStyles(){
    if(document.getElementById('rt-bundle-panel-css'))return;
    var s=document.createElement('style');s.id='rt-bundle-panel-css';
    s.textContent='\
#slide-panel .rt-bop-hero{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:14px;margin-bottom:12px}\
#slide-panel .rt-bop-eyebrow{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}\
#slide-panel .rt-bop-total{font-size:27px;font-weight:850;line-height:1.1;margin-top:4px}\
#slide-panel .rt-bop-sub{font-size:11.5px;color:var(--text-secondary);margin-top:6px;line-height:1.45}\
#slide-panel .rt-bop-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}\
#slide-panel .rt-bop-kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 11px}\
#slide-panel .rt-bop-kpi small{display:block;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}\
#slide-panel .rt-bop-kpi strong{font-size:16px}\
#slide-panel .rt-bop-card{background:var(--surface);border:1px solid var(--border);border-radius:11px;overflow:hidden;margin-bottom:12px}\
#slide-panel .rt-bop-card-title{padding:9px 11px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);background:var(--surface2)}\
#slide-panel .rt-bop-tr{display:flex;align-items:center;gap:10px;padding:9px 11px;border-top:1px solid var(--border);font-size:12.5px}\
#slide-panel .rt-bop-tr span:first-child{flex:1;color:var(--text-secondary)}\
#slide-panel .rt-bop-tr strong{font-weight:700}#slide-panel .rt-bop-tr.total{background:var(--surface2);font-size:13.5px}\
#slide-panel .rt-bop-member{display:flex;align-items:center;gap:8px;padding:10px 11px;border-top:1px solid var(--border);min-width:0}\
#slide-panel .rt-bop-member-main{flex:1;min-width:0;cursor:pointer}#slide-panel .rt-bop-member-name{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#slide-panel .rt-bop-member-meta{font-size:10.5px;color:var(--muted);margin-top:3px}#slide-panel .rt-bop-member-money{text-align:right;flex:0 0 auto}#slide-panel .rt-bop-member-money strong{display:block;font-size:13px}#slide-panel .rt-bop-member-money small{display:block;font-size:10.5px;margin-top:2px}\
#slide-panel .rt-bop-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#slide-panel .rt-bop-actions .btn{flex:1;min-width:120px}\
.bundle-row .rt-bundle-disclosure{width:26px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--text-secondary);padding:0;cursor:pointer;flex:0 0 26px}\
.bundle-row .rt-bundle-disclosure svg{width:14px;height:14px;transition:transform 180ms cubic-bezier(.22,.61,.36,1);transform-origin:center}.bundle-row .rt-bundle-disclosure.expanded svg{transform:rotate(90deg)}\
.rt-bundle-leftslot{display:flex;align-items:center;gap:2px;flex:0 0 auto}.rt-bundle-leftslot .status-dot{margin:0}\
.rt-bundle-children{overflow:hidden;border-top:1px solid var(--border);background:color-mix(in srgb,var(--surface) 78%,var(--bg))}\
.rt-bundle-child{position:relative;background:transparent!important;border-top:1px solid color-mix(in srgb,var(--border) 72%,transparent)!important;min-height:66px}\
.rt-bundle-child:first-child{border-top:0!important}.rt-bundle-child .item-main{padding-left:17px}.rt-bundle-child .item-row-inner{min-height:64px}\
.rt-bundle-child-branch{width:16px;flex:0 0 16px;color:var(--muted);font-size:15px;line-height:1;text-align:center}.rt-bundle-child .item-row-name{font-size:13px;font-weight:600}\
.rt-bundle-child .item-row-meta{font-size:10.5px}.rt-bundle-child .item-row-price{font-size:13px}.rt-bundle-child .item-row-profit{font-size:11px}\
@media(min-width:640px){#slide-panel .rt-bop-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}\
@media(prefers-reduced-motion:reduce){.bundle-row .rt-bundle-disclosure svg{transition:none}}';
    document.head.appendChild(s);
  }

  function eventForCycle(i,cyc){
    try{if(typeof _saleEventForCycle==='function')return _saleEventForCycle(i,i._month||'',cyc);}catch(_){}
    return {item:i,sale:String(num(cyc&&cyc.saleNo)||1),saleDate:(cyc&&cyc.date)||'',snapshot:cyc||{},isReturnAdjustment:false,isReturned:false};
  }

  function breakdown(bid){
    var its=itemsFor(bid),out={items:its,sale:0,postage:0,receipts:0,fees:0,listing:0,promo:0,shipping:0,packaging:0,cost:0,parts:0,saleLegNet:0,profit:0,date:'',ref:'',platform:''};
    its.forEach(function(i){
      var cyc=cycleFor(i,bid);if(!cyc)return;
      out.sale+=num(cyc.price);out.postage+=num(cyc.postage);out.shipping+=num(cyc.shipping);
      if(!out.date)out.date=cyc.date||'';if(!out.ref)out.ref=cyc.bundleRef||'';
      if(!out.platform)out.platform=cyc.platformId||cyc.platform||((num(cyc.saleNo)||1)>=2?i.resalePlatform:(i.soldOnPlatform||i.salePlatform||i.defaultPlatform))||'';
      try{
        var br=typeof _saleBreakdown==='function'?_saleBreakdown(eventForCycle(i,cyc)):null;
        if(br){out.fees+=num(br.bpf);out.listing+=num(br.listingFee);out.promo+=num(br.promoFee);out.packaging+=num(br.packaging);out.cost+=num(br.itemCost);out.parts+=num(br.parts);out.saleLegNet+=num(br.netProfit);}
      }catch(_){}
      out.profit+=memberProfit(i,bid);
    });
    out.sale=+out.sale.toFixed(2);out.postage=+out.postage.toFixed(2);out.receipts=+(out.sale+out.postage).toFixed(2);out.shipping=+out.shipping.toFixed(2);
    ['fees','listing','promo','packaging','cost','parts','saleLegNet','profit'].forEach(function(k){out[k]=+out[k].toFixed(2);});
    out.returnImpact=+(out.profit-out.saleLegNet).toFixed(2);out.margin=out.receipts>0?+(out.profit/out.receipts*100).toFixed(1):null;
    return out;
  }

  function originalAsk(bid,its){
    var total=0,found=0;
    (its||[]).forEach(function(i){
      var cyc=cycleFor(i,bid);if(!cyc)return;
      var target=(num(cyc.saleNo)||1)>=2?'resold':'sold',logs=(DB.activityLog||[]).filter(function(l){return l&&l.itemId===i.id&&l.before&&l.fromState==='listed'&&l.toState===target;}).sort(function(a,b){return num(b.ts)-num(a.ts);});
      if(!logs.length)return;
      total+=num(logs[0].before.salePrice);found++;
    });
    return found===(its||[]).length?+total.toFixed(2):null;
  }

  function memberMenu(i,bid){
    var m=i._month||'',cyc=cycleFor(i,bid)||{},sold=!!cyc.date,id='rt-bop-dd-'+String(i.id).replace(/[^a-zA-Z0-9_-]/g,'');
    return '<div class="ddwrap" id="'+id+'"><button class="ddbtn" aria-label="Item actions" onclick="event.stopPropagation();toggleDD(\''+id+'\')" title="Actions">⋮</button><div class="ddmenu">'
      +'<button onclick="event.stopPropagation();openBundleMemberPage(\''+quote(m)+'\',\''+quote(i.id)+'\',\''+quote(bid)+'\')">'+icon('fullpage',14)+' Full item page</button>'
      +'<button onclick="event.stopPropagation();openBundleOrderEdit(\''+quote(bid)+'\')">'+icon('edit',14)+' Edit order / prices</button>'
      +(typeof window._rtBundleEditMemberMeta==='function'?'<button onclick="event.stopPropagation();_rtBundleEditMemberMeta(\''+quote(m)+'\',\''+quote(i.id)+'\')">'+icon('edit',14)+' Edit item details</button>':'')
      +(sold?'<button onclick="event.stopPropagation();closeBundlePage();openReturn(\''+quote(m)+'\',\''+quote(i.id)+'\')">'+icon('return',14)+' Log Return</button>':'')
      +'<button onclick="event.stopPropagation();closeBundlePage();confirmDupeItem(\''+quote(m)+'\',\''+quote(i.id)+'\')">'+icon('dupe',14)+' Duplicate</button>'
      +'<button class="danger" onclick="event.stopPropagation();deleteItem(\''+quote(m)+'\',\''+quote(i.id)+'\')">'+icon('trash',14)+' Delete</button>'
      +'</div></div>';
  }

  function panelHtml(bid){
    var b=breakdown(bid);if(!b.items.length)return null;
    var ask=originalAsk(bid,b.items),discount=ask!=null?Math.max(0,ask-b.sale):null;
    var platformLabel=(typeof PLATFORMS!=='undefined'&&PLATFORMS[b.platform]&&(PLATFORMS[b.platform].short||PLATFORMS[b.platform].label))||b.platform||'—';
    var members=b.items.map(function(i){
      var cyc=cycleFor(i,bid)||{},p=memberProfit(i,bid);
      return '<div class="rt-bop-member"><div class="rt-bop-member-main" onclick="openBundleMemberPage(\''+quote(i._month)+'\',\''+quote(i.id)+'\',\''+quote(bid)+'\')"><div class="rt-bop-member-name">'+html(i.item||'Item')+'</div><div class="rt-bop-member-meta">Sale '+(num(cyc.saleNo)||1)+' · '+html(cyc.date||'—')+' · allocated '+money(cyc.price)+'</div></div><div class="rt-bop-member-money"><strong>'+money(cyc.price)+'</strong><small style="color:'+(p>=0?'var(--green)':'var(--red)')+'">'+(p>=0?'+':'')+money(p)+'</small></div>'+memberMenu(i,bid)+'</div>';
    }).join('');
    var details=''
      +'<div class="rt-bop-tr"><span>Item sale total</span><strong>'+money(b.sale)+'</strong></div>'
      +(discount!=null&&discount>0?'<div class="rt-bop-tr"><span>Bundle / multi-buy discount'+(ask>0?' · '+((discount/ask*100).toFixed(1).replace(/\.0$/,''))+'%':'')+'</span><strong style="color:var(--accent)">−'+money(discount)+'</strong></div>':'')
      +(b.postage?'<div class="rt-bop-tr"><span>Buyer postage</span><strong style="color:var(--green)">+'+money(b.postage)+'</strong></div>':'')
      +'<div class="rt-bop-tr total"><span>Gross receipts</span><strong>'+money(b.receipts)+'</strong></div>'
      +(b.fees?'<div class="rt-bop-tr"><span>Platform fees</span><strong style="color:var(--red)">−'+money(b.fees)+'</strong></div>':'')
      +(b.listing?'<div class="rt-bop-tr"><span>Listing / relist fees</span><strong style="color:var(--red)">−'+money(b.listing)+'</strong></div>':'')
      +(b.promo?'<div class="rt-bop-tr"><span>Promotion / boost</span><strong style="color:var(--red)">−'+money(b.promo)+'</strong></div>':'')
      +(b.shipping?'<div class="rt-bop-tr"><span>Shipping cost</span><strong style="color:var(--red)">−'+money(b.shipping)+'</strong></div>':'')
      +(b.packaging?'<div class="rt-bop-tr"><span>Packaging</span><strong style="color:var(--red)">−'+money(b.packaging)+'</strong></div>':'')
      +(b.cost?'<div class="rt-bop-tr"><span>Item cost</span><strong style="color:var(--red)">−'+money(b.cost)+'</strong></div>':'')
      +(b.parts?'<div class="rt-bop-tr"><span>Parts &amp; expenses</span><strong style="color:var(--red)">−'+money(b.parts)+'</strong></div>':'')
      +(Math.abs(b.returnImpact)>=0.005?'<div class="rt-bop-tr"><span>Return / refund impact</span><strong style="color:'+(b.returnImpact>=0?'var(--green)':'var(--red)')+'">'+(b.returnImpact>=0?'+':'')+money(b.returnImpact)+'</strong></div>':'')
      +'<div class="rt-bop-tr total"><span>Combined net P&amp;L</span><strong style="color:'+(b.profit>=0?'var(--green)':'var(--red)')+'">'+(b.profit>=0?'+':'')+money(b.profit)+'</strong></div>';
    return '<div class="rt-bop-hero"><div class="rt-bop-eyebrow">One buyer · one transaction</div><div class="rt-bop-total">'+money(b.sale)+'</div><div class="rt-bop-sub">'+html(b.ref||'Grouped sale')+' · sold '+html(b.date||'—')+' · '+html(platformLabel)+(b.postage?' · '+money(b.postage)+' buyer postage':'')+(ask!=null?' · original ask '+money(ask):'')+'</div></div>'
      +'<div class="rt-bop-kpis"><div class="rt-bop-kpi"><small>Gross receipts</small><strong>'+money(b.receipts)+'</strong></div><div class="rt-bop-kpi"><small>Net P&amp;L</small><strong style="color:'+(b.profit>=0?'var(--green)':'var(--red)')+'">'+(b.profit>=0?'+':'')+money(b.profit)+'</strong></div><div class="rt-bop-kpi"><small>Margin</small><strong>'+(b.margin==null?'—':b.margin.toFixed(1)+'%')+'</strong></div><div class="rt-bop-kpi"><small>Items</small><strong>'+b.items.length+'</strong></div></div>'
      +'<div class="rt-bop-card"><div class="rt-bop-card-title">Transaction &amp; joined P&amp;L</div>'+details+'</div>'
      +'<div class="rt-bop-card"><div class="rt-bop-card-title">Items in this order</div>'+members+'</div>'
      +'<div class="rt-bop-actions"><button class="btn btn-secondary" onclick="openBundleOrderEdit(\''+quote(bid)+'\')">Edit order / item prices</button><button class="btn btn-secondary" style="color:var(--warn)" onclick="reverseBundleOrder(\''+quote(bid)+'\')">Reverse order</button></div>';
  }

  window.openBundlePage=function(bid){
    injectStyles();
    var stale=document.getElementById('rt-bundle-page');if(stale)stale.remove();
    var content=panelHtml(bid);if(content==null){toast('Bundle not found','err');return;}
    openPanel('Bundle order',content,false,{type:'bundle-order',bundleId:bid});
    var panel=document.getElementById('slide-panel');if(panel)panel.dataset.rtBundleId=bid;
  };

  window.closeBundlePage=function(){
    var stale=document.getElementById('rt-bundle-page');if(stale)stale.remove();
    var panel=document.getElementById('slide-panel');
    if(!editTransition&&panel&&panel.classList.contains('on')&&panel._panelMeta&&panel._panelMeta.type==='bundle-order'){
      try{closePanel();}catch(_){}
    }
  };

  if(originalOpenBundleOrderEdit){
    window.openBundleOrderEdit=function(){
      editTransition=true;
      try{return originalOpenBundleOrderEdit.apply(this,arguments);}
      finally{editTransition=false;}
    };
  }

  window.openBundleMemberPage=function(m,id,bid){
    var page=document.querySelector('.page.on'),panel=document.getElementById('slide-panel');
    bundleReturnContext={bundleId:bid,origin:page?page.id:'p-monthly',scrollTop:panel?panel.scrollTop:0};
    try{closePanel();}catch(_){}
    openItemPage(m,id,bundleReturnContext.origin);
  };

  if(originalExitItemPage){
    window.exitItemPage=function(){
      var ctx=bundleReturnContext;
      bundleReturnContext=null;
      var out=originalExitItemPage.apply(this,arguments);
      if(ctx&&ctx.bundleId){
        setTimeout(function(){
          openBundlePage(ctx.bundleId);
          requestAnimationFrame(function(){var p=document.getElementById('slide-panel');if(p)p.scrollTop=ctx.scrollTop||0;});
        },0);
      }
      return out;
    };
  }

  window.toggleBundleSalesRow=function(bid){
    if(expandedBundles.has(bid))expandedBundles.delete(bid);else expandedBundles.add(bid);
    if(typeof renderMonth==='function')renderMonth();
  };

  function childMenu(ev,bid){
    var i=ev.item||{},rec=(typeof _findItemRecordById==='function'?_findItemRecordById(i.id):null),m=i._month||(rec&&rec.month)||'',id='rt-bundle-child-dd-'+String(i.id||'').replace(/[^a-zA-Z0-9_-]/g,'');
    return '<div class="ddwrap" id="'+id+'"><button class="ddbtn" aria-label="Item actions" onclick="event.stopPropagation();toggleDD(\''+id+'\')" title="Actions">⋮</button><div class="ddmenu">'
      +'<button onclick="event.stopPropagation();openBundleMemberPage(\''+quote(m)+'\',\''+quote(i.id)+'\',\''+quote(bid)+'\')">'+icon('fullpage',14)+' Full item page</button>'
      +'<button onclick="event.stopPropagation();openBundleOrderEdit(\''+quote(bid)+'\')">'+icon('edit',14)+' Edit order / prices</button>'
      +((ev.isReturned||ev.isReturnAdjustment)?'':'<button onclick="event.stopPropagation();closeBundlePage();openReturn(\''+quote(m)+'\',\''+quote(i.id)+'\')">'+icon('return',14)+' Log Return</button>')
      +'<button onclick="event.stopPropagation();closeBundlePage();confirmDupeItem(\''+quote(m)+'\',\''+quote(i.id)+'\')">'+icon('dupe',14)+' Duplicate</button>'
      +'<button class="danger" onclick="event.stopPropagation();deleteItem(\''+quote(m)+'\',\''+quote(i.id)+'\')">'+icon('trash',14)+' Delete</button>'
      +'</div></div>';
  }

  function childRows(bid,members){
    return '<div class="rt-bundle-children">'+members.map(function(ev){
      var i=ev.item||{},rec=(typeof _findItemRecordById==='function'?_findItemRecordById(i.id):null),m=i._month||(rec&&rec.month)||'',price=num(ev.salePrice),profit=num(ev.profit);
      return '<div class="item-row rt-bundle-child" onclick="openBundleMemberPage(\''+quote(m)+'\',\''+quote(i.id)+'\',\''+quote(bid)+'\')"><div class="item-main"><div class="item-row-inner"><div class="rt-bundle-child-branch">↳</div><div class="item-row-body"><div class="item-row-name">'+html(i.item||'Item')+'</div><div class="item-row-meta"><span class="item-badge bundle">BUNDLE ITEM</span>'+(typeof platBadgeHTML==='function'?platBadgeHTML(i):'')+'</div></div><div class="item-row-right"><div class="item-row-price">'+money(price)+'</div><div class="item-row-profit '+(profit>=0?'pos':'neg')+'">'+money(profit)+'</div></div></div></div><div class="item-actions">'+childMenu(ev,bid)+'</div></div>';
    }).join('')+'</div>';
  }

  window.renderBundleSaleRow=function(bid,members){
    injectStyles();
    var rev=0,profit=0,date='';(members||[]).forEach(function(ev){var post=((num(ev.sale)||1)>=2&&ev.item)?num(ev.item.resalePostage!=null?ev.item.resalePostage:ev.item.postage):num(ev.item&&ev.item.postage);rev+=num(ev.salePrice)+post;profit+=num(ev.profit);if(!date&&ev.saleDate)date=ev.saleDate;});
    var count=(members||[]).length,first=(members&&members[0]&&members[0].item)||{},ref=typeof _eventBundleRef==='function'?_eventBundleRef((members&&members[0])||{}):'',allSel=typeof _bundleAllSelected==='function'?_bundleAllSelected(bid):false,margin=rev>0?profit/rev*100:null,isOpen=expandedBundles.has(bid);
    var disclosure='<button class="rt-bundle-disclosure'+(isOpen?' expanded':'')+'" onclick="event.stopPropagation();toggleBundleSalesRow(\''+quote(bid)+'\')" aria-label="'+(isOpen?'Collapse':'Expand')+' bundle" aria-expanded="'+(isOpen?'true':'false')+'"><svg viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    var selection=typeof SELECTION_MODE!=='undefined'&&SELECTION_MODE;
    var left=selection?'<div class="rt-bundle-leftslot">'+disclosure+'<label class="item-checkbox-left" onclick="event.stopPropagation()"><input type="checkbox" '+(allSel?'checked':'')+' onchange="_toggleBundleSelect(\''+quote(bid)+'\')" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;margin-right:4px"></label></div>':'<div class="rt-bundle-leftslot">'+disclosure+'<div class="status-dot sold"></div></div>';
    var click=selection?'onclick="_toggleBundleSelect(\''+quote(bid)+'\')"':'onclick="openBundlePage(\''+quote(bid)+'\')"';
    var dd='<div class="ddwrap" id="bundle-row-dd-'+html(bid)+'"><button class="ddbtn" aria-label="Bundle actions" onclick="event.stopPropagation();toggleDD(\'bundle-row-dd-'+quote(bid)+'\')" title="Actions">⋮</button><div class="ddmenu"><button onclick="event.stopPropagation();openBundlePage(\''+quote(bid)+'\')">'+icon('fullpage',14)+' Open order</button><button onclick="event.stopPropagation();openBundleOrderEdit(\''+quote(bid)+'\')">'+icon('edit',14)+' Edit order / prices</button><button onclick="event.stopPropagation();reverseBundleOrder(\''+quote(bid)+'\')" style="color:var(--warn)">'+icon('revert',14)+' Reverse order</button></div></div>';
    var row='<div class="item-row bundle-row" '+click+'><div class="item-main"><div class="item-row-inner">'+left+'<div class="item-row-body"><div class="item-row-name">'+html(first.item||'Bundle')+(count>1?' <span style="color:var(--text-secondary);font-weight:600">+ '+(count-1)+' more</span>':'')+'</div><div class="item-row-meta"><span class="item-badge sold">SOLD</span><span class="item-badge bundle">≋ BUNDLE</span>'+(date?'<span class="item-row-meta-sep">·</span><span>sold '+html(date)+'</span>':'')+(ref?'<span class="item-row-meta-sep">·</span><span>'+html(ref)+'</span>':'')+'</div></div><div class="item-row-right"><div class="item-row-price">'+money(rev)+'</div><div class="item-row-profit '+(profit>=0?'pos':'neg')+'">'+money(profit)+'</div>'+(margin!=null?'<div class="item-row-roi">'+margin.toFixed(1)+'% margin</div>':'')+'</div></div></div><div class="item-actions">'+dd+'</div></div>';
    return row+(isOpen?childRows(bid,members||[]):'');
  };

  injectStyles();
})();