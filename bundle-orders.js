/* RETRADE bundle-order lifecycle patch.
 * Treats a multi-item bundle as one order for entry, P&L, transaction review,
 * and reversal while keeping the existing per-item accounting allocations.
 */
(function(){
  'use strict';

  var RT_BUNDLE_VERSION='20260909.1';
  var _origUndoSale=typeof window.undoSale==='function'?window.undoSale:null;
  var _origUndoResale=typeof window.undoResale==='function'?window.undoResale:null;
  var _origRevertToActive=typeof window.revertToActive==='function'?window.revertToActive:null;
  var _origDeleteItem=typeof window.deleteItem==='function'?window.deleteItem:null;

  function n(v){v=Number(v);return isFinite(v)?v:0;}
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function has(o,k){return !!o&&Object.prototype.hasOwnProperty.call(o,k);}
  function html(v){return typeof esc==='function'?esc(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function jsq(v){return String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');}
  function money(v){return typeof fmt==='function'?fmt(n(v)):'£'+n(v).toFixed(2);}
  function pct(v){return (Math.round(n(v)*10)/10).toFixed(1).replace(/\.0$/,'')+'%';}
  function bundleItems(bid){return typeof _bundleItems==='function'?_bundleItems(bid):[];}
  function memberCycle(i,bid){return typeof _bundleMemberCycle==='function'?_bundleMemberCycle(i,bid):null;}

  function injectStyles(){
    if(document.getElementById('rt-bundle-order-css'))return;
    var s=document.createElement('style');s.id='rt-bundle-order-css';
    s.textContent='      .rt-bo-hero{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}.rt-bo-eyebrow{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.rt-bo-total{font-size:26px;font-weight:850;line-height:1.15;margin-top:4px}.rt-bo-sub{font-size:12px;color:var(--text-secondary);margin-top:5px;line-height:1.45}.rt-bo-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 12px}.rt-bo-kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 12px}.rt-bo-kpi small{display:block;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.rt-bo-kpi strong{font-size:17px}.rt-bo-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px}.rt-bo-card-title{padding:10px 12px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);background:var(--surface2)}.rt-bo-tr{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--border);font-size:12.5px}.rt-bo-tr:first-of-type{border-top:0}.rt-bo-tr span:first-child{flex:1;color:var(--text-secondary)}.rt-bo-tr strong{font-weight:700}.rt-bo-tr.total{font-size:14px;background:var(--surface2)}.rt-bo-member{display:flex;align-items:center;gap:9px;padding:10px 12px;border-top:1px solid var(--border);min-width:0}.rt-bo-member-main{flex:1;min-width:0;cursor:pointer}.rt-bo-member-name{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-bo-member-meta{font-size:11px;color:var(--muted);margin-top:3px}.rt-bo-member-money{text-align:right;flex:0 0 auto}.rt-bo-member-money strong{display:block;font-size:13px}.rt-bo-member-money small{display:block;font-size:11px;margin-top:2px}.rt-bo-dd{position:relative;flex:0 0 auto}.rt-bo-dd .ddbtn{display:inline-flex!important;visibility:visible!important;opacity:1!important}.rt-bo-actions{display:flex;gap:8px;margin-top:12px}.rt-bo-actions .btn{flex:1}.rt-bo-discount{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rt-bo-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.rt-bo-chip{border:1px solid var(--border);background:var(--surface2);color:var(--text-secondary);border-radius:999px;padding:5px 9px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}.rt-bo-chip:active{transform:translateY(1px)}.rt-bo-summary{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin:0 0 12px;display:flex;justify-content:space-between;gap:12px;align-items:center}.rt-bo-summary small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700}.rt-bo-summary strong{font-size:18px}.rt-bo-note{font-size:11px;color:var(--muted);line-height:1.5;margin-top:6px}@media(min-width:640px){.rt-bo-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}';
    document.head.appendChild(s);
  }

  function bundleCycleBreakdown(i,bid){
    try{
      var cyc=memberCycle(i,bid);if(!cyc)return null;
      var ev=(typeof _saleEventForCycle==='function')?_saleEventForCycle(i,i._month||_findItemMonth(i.id),cyc):{item:i,month:i._month||_findItemMonth(i.id),sale:String(cyc.saleNo||1),saleDate:cyc.date||'',isReturnAdjustment:false,snapshot:cyc};
      return typeof _saleBreakdown==='function'?_saleBreakdown(ev):null;
    }catch(e){return null;}
  }

  function candidateSaleLogs(i,bid){
    var cyc=memberCycle(i,bid);if(!cyc)return [];
    var target=Number(cyc.saleNo||1)>=2?'resold':'sold';
    return (DB.activityLog||[]).filter(function(l){
      return l&&l.itemId===i.id&&l.before&&l.fromState==='listed'&&l.toState===target;
    }).sort(function(a,b){return n(b.ts)-n(a.ts);});
  }

  function bundleActivityCluster(bid,items){
    items=items||bundleItems(bid);if(!items.length)return null;
    var lists=items.map(function(i){return candidateSaleLogs(i,bid);});
    if(lists.some(function(x){return !x.length;}))return null;
    var best=null;
    lists[0].forEach(function(seed){
      var chosen=[seed],maxGap=0,ok=true;
      for(var x=1;x<lists.length;x++){
        var nearest=null,dist=Infinity;
        lists[x].forEach(function(l){var d=Math.abs(n(l.ts)-n(seed.ts));if(d<dist){dist=d;nearest=l;}});
        if(!nearest||dist>2500){ok=false;return;}
        chosen.push(nearest);maxGap=Math.max(maxGap,dist);
      }
      if(ok&&(!best||n(seed.ts)>n(best.logs[0].ts)))best={logs:chosen,maxGap:maxGap};
    });
    if(!best)return null;
    var byId={};best.logs.forEach(function(l){byId[l.itemId]=l;});
    return {logs:best.logs,byId:byId};
  }

  function bundleBeforeStats(bid,items){
    var cluster=bundleActivityCluster(bid,items);if(!cluster)return {cluster:null,ask:null};
    var ask=0,ok=true;
    items.forEach(function(i){var l=cluster.byId[i.id];if(!l||!l.before){ok=false;return;}ask+=n(l.before.salePrice);});
    return {cluster:cluster,ask:ok?+ask.toFixed(2):null};
  }

  function bundleLaterLogsAreSafe(bid,item,saleLog){
    var later=(DB.activityLog||[]).filter(function(l){return l&&l.itemId===item.id&&!l.undone&&n(l.ts)>n(saleLog.ts);}).sort(function(a,b){return n(a.ts)-n(b.ts);});
    for(var x=0;x<later.length;x++){
      var l=later[x];
      var b=l.before||{};
      var grouped=(b.bundleId===bid||b.resaleBundleId===bid);
      if(!(l.toState==='listed'&&grouped))return {ok:false,later:later};
    }
    return {ok:true,later:later};
  }

  function bundleReversePlan(bid){
    var items=bundleItems(bid);if(items.length<2)return {ok:false,reason:'Bundle members could not be reconstructed.',items:items};
    var cluster=bundleActivityCluster(bid,items);
    if(!cluster)return {ok:false,reason:'The original grouped-sale snapshots are not available, so RETRADE cannot safely restore the pre-sale asking prices.',items:items};
    var rows=[],bad=null;
    items.forEach(function(i){
      if(bad)return;
      var saleLog=cluster.byId[i.id],cyc=memberCycle(i,bid);
      if(!saleLog||!cyc){bad='A bundle member no longer has a matching sale cycle.';return;}
      var later=bundleLaterLogsAreSafe(bid,i,saleLog);
      if(!later.ok){bad='One or more items have later return/relist/lifecycle history. Reverse those newer changes first.';return;}
      rows.push({item:i,cycle:cyc,saleLog:saleLog,later:later.later});
    });
    if(bad)return {ok:false,reason:bad,items:items};
    return {ok:true,rows:rows,items:items,cluster:cluster};
  }

  function restoreKey(item,before,key){
    if(has(before,key))item[key]=clone(before[key]);else delete item[key];
  }

  function restoreSaleMutation(row){
    var i=row.item,b=row.saleLog.before||{},saleNo=Number(row.cycle.saleNo||1);
    var keys=saleNo>=2
      ?['resaleDateSold','resaleSalePrice','resalePlatform','resalePostage','resaleShippingCost','resalePackagingCost','resalePromoPercent','resaleBundleId','resaleBundleRef','resaleBundleTotal','resaleGrossProfit','grossProfit','isReturned','state']
      :['dateSold','salePrice','postage','shippingCost','soldOnPlatform','salePlatform','bundleId','bundleRef','bundleTotal','grossProfit','isReturned','state'];
    keys.forEach(function(k){restoreKey(i,b,k);});
  }

  window.reverseBundleOrder=async function(bid){
    var plan=bundleReversePlan(bid);
    if(!plan.ok){toast(plan.reason||'This bundle cannot be reversed safely.','err');return;}
    var first=plan.items[0]||{},ref=(typeof _bundleMemberRef==='function'?_bundleMemberRef(first,bid):'')||'this bundle';
    var total=(typeof _bundleMemberTotal==='function'?n(_bundleMemberTotal(first,bid)):0);
    var ok=await showConfirm(
      'Reverse bundle order?',
      html(ref)+' will be reversed as one order. All '+plan.items.length+' items will return to their exact pre-sale Listed state, including their original asking prices. The bundle link will be removed from every member.',
      {icon:'info',okLabel:'Reverse order',danger:false}
    );
    if(!ok)return;
    var oldSuppress=(typeof _suppressActivityCapture!=='undefined')?_suppressActivityCapture:false;
    try{
      if(typeof _suppressActivityCapture!=='undefined')_suppressActivityCapture=true;
      plan.rows.forEach(function(r){
        restoreSaleMutation(r);
        r.saleLog.undone=true;
        r.later.forEach(function(l){l.undone=true;});
        if(typeof _activityShadow!=='undefined'){
          var m=typeof _findItemMonth==='function'?_findItemMonth(r.item.id):null;
          _activityShadow[r.item.id]={status:typeof _actStatus==='function'?_actStatus(r.item):'listed',name:r.item.item||'',month:m,snap:JSON.stringify(r.item)};
        }
      });
      saveDB();
      closePanel();
      if(typeof renderStock==='function')renderStock();
      toast('Bundle order reversed · '+plan.items.length+' items restored to Listed'+(total?' · '+money(total)+' sale removed':''));
    }catch(e){console.error('[RETRADE bundle reverse]',e);toast('Bundle reversal failed — no further changes were made.','err');}
    finally{if(typeof _suppressActivityCapture!=='undefined')_suppressActivityCapture=oldSuppress;}
  };

  function bundleSummaryDetailed(bid){
    var items=bundleItems(bid),sum={items:items,count:items.length,sale:0,postage:0,bpf:0,listingFee:0,shipping:0,packaging:0,promoFee:0,itemCost:0,parts:0,partialRefund:0,profit:0};
    items.forEach(function(i){
      var br=bundleCycleBreakdown(i,bid),cyc=memberCycle(i,bid);
      if(br){
        sum.sale+=n(br.salePrice);sum.postage+=n(br.postage);sum.bpf+=n(br.bpf);sum.listingFee+=n(br.listingFee);sum.shipping+=n(br.shipping);sum.packaging+=n(br.packaging);sum.promoFee+=n(br.promoFee);sum.itemCost+=n(br.itemCost);sum.parts+=n(br.parts);sum.partialRefund+=n(br.partialRefund);sum.profit+=n(br.netProfit);
      }else if(cyc){sum.sale+=n(cyc.price);sum.postage+=n(cyc.postage);sum.shipping+=n(cyc.shipping);sum.profit+=(typeof _bundleMemberProfit==='function'?n(_bundleMemberProfit(i,bid)):0);sum.itemCost+=n(i.costPrice);}
    });
    Object.keys(sum).forEach(function(k){if(typeof sum[k]==='number')sum[k]=+sum[k].toFixed(2);});
    var first=items[0]||{},cyc=first?memberCycle(first,bid):null;
    sum.ref=cyc&&cyc.bundleRef?cyc.bundleRef:(first.bundleRef||first.resaleBundleRef||'');
    sum.date=cyc&&cyc.date?cyc.date:'';
    sum.bundleTotal=n(cyc&&cyc.bundleTotal)||sum.sale;
    sum.gross=+(sum.sale+sum.postage).toFixed(2);
    sum.margin=sum.gross>0?+(sum.profit/sum.gross*100).toFixed(1):null;
    sum.platformId=cyc&&cyc.platformId?cyc.platformId:'';
    var before=bundleBeforeStats(bid,items);sum.ask=before.ask;sum.cluster=before.cluster;
    sum.discount=sum.ask==null?null:+Math.max(0,sum.ask-sum.sale).toFixed(2);
    sum.discountPct=(sum.ask&&sum.discount!=null)?+(sum.discount/sum.ask*100).toFixed(1):null;
    sum.reverse=bundleReversePlan(bid);
    return sum;
  }

  function orderLine(label,value,opts){
    opts=opts||{};if(opts.hideZero&&Math.abs(n(value))<0.005)return '';
    var col=opts.color?';color:'+opts.color:'';
    var prefix=opts.minus&&n(value)>0?'−':opts.plus&&n(value)>0?'+':'';
    var shown=(value==null?'—':prefix+money(Math.abs(n(value))));
    return '<div class="rt-bo-tr'+(opts.total?' total':'')+'"><span>'+html(label)+'</span><strong style="'+col+'">'+shown+'</strong></div>';
  }

  function memberMenu(i,bid){
    var m=i._month||_findItemMonth(i.id)||'',cyc=memberCycle(i,bid),saleNo=Number(cyc&&cyc.saleNo||1);
    var live=!!(cyc&&cyc.date&&!i.isReturned&&((saleNo===1&&i.bundleId===bid&&!!i.dateSold&&!i.resaleSalePrice)||(saleNo>=2&&i.resaleBundleId===bid&&!!i.resaleSalePrice&&(!window._currentResaleSaleNo||Number(_currentResaleSaleNo(i))===saleNo))));
    var id='rt-bo-dd-'+i.id+'-'+String(cyc&&cyc.saleNo||1);
    var b='<div class="rt-bo-dd ddwrap" id="'+html(id)+'"><button class="ddbtn" aria-label="Item actions" onclick="event.stopPropagation();toggleDD(\''+jsq(id)+'\')" title="Actions">⋮</button><div class="ddmenu">';
    b+='<button onclick="event.stopPropagation();openItemPage(\''+jsq(m)+'\',\''+jsq(i.id)+'\',document.querySelector(\'.page.on\').id)">'+icon('fullpage',14)+' Full page</button>';
    b+='<button onclick="event.stopPropagation();editItem(\''+jsq(m)+'\',\''+jsq(i.id)+'\')">'+icon('edit',14)+' Edit</button>';
    if(live)b+='<button onclick="event.stopPropagation();openReturn(\''+jsq(m)+'\',\''+jsq(i.id)+'\')">'+icon('return',14)+' Log Return</button>';
    b+='<button onclick="event.stopPropagation();confirmDupeItem(\''+jsq(m)+'\',\''+jsq(i.id)+'\')">'+icon('dupe',14)+' Duplicate</button>';
    if(typeof _canScrap==='function'&&_canScrap(i))b+='<button onclick="event.stopPropagation();openScrapModal(\''+jsq(m)+'\',\''+jsq(i.id)+'\')" style="color:var(--warn)">'+icon('dispose',14)+' Dispose</button>';
    b+='<button class="danger" onclick="event.stopPropagation();deleteItem(\''+jsq(m)+'\',\''+jsq(i.id)+'\')">'+icon('trash',14)+' Delete</button>';
    b+='</div></div>';return b;
  }

  window.openBundlePage=function(bid){
    injectStyles();
    var b=bundleSummaryDetailed(bid);if(!b.count){toast('Bundle not found','err');return;}
    var platform=(typeof PLATFORMS!=='undefined'&&PLATFORMS[b.platformId])?(PLATFORMS[b.platformId].short||PLATFORMS[b.platformId].label):b.platformId;
    var title=b.ref?'Bundle order · '+b.ref:'Bundle order';
    var discountText=b.discount==null?'Recorded bundle total':(b.discount>0?money(b.discount)+' discount · '+pct(b.discountPct):'No bundle discount');
    var hero='<div class="rt-bo-hero"><div class="rt-bo-eyebrow">One buyer · one transaction</div><div class="rt-bo-total">'+money(b.gross)+'</div><div class="rt-bo-sub">'+b.count+' items'+(b.date?' · '+html(b.date):'')+(platform?' · '+html(platform):'')+(b.ref?' · '+html(b.ref):'')+'<br>'+html(discountText)+'</div></div>';
    var kpis='<div class="rt-bo-kpis"><div class="rt-bo-kpi"><small>Item total</small><strong>'+money(b.sale)+'</strong></div><div class="rt-bo-kpi"><small>Net profit</small><strong style="color:'+(b.profit>=0?'var(--green)':'var(--red)')+'">'+money(b.profit)+'</strong></div><div class="rt-bo-kpi"><small>Margin</small><strong>'+(b.margin==null?'—':pct(b.margin))+'</strong></div><div class="rt-bo-kpi"><small>Bundle discount</small><strong>'+(b.discount==null?'—':(b.discount>0?'−'+money(b.discount):money(0)))+'</strong></div></div>';
    var tx='<div class="rt-bo-card"><div class="rt-bo-card-title">Joined transaction &amp; P&amp;L</div>';
    if(b.ask!=null)tx+=orderLine('Combined listed price',b.ask);
    if(b.discount!=null&&b.discount>0)tx+=orderLine('Bundle / multi-buy discount',b.discount,{minus:true,color:'var(--accent)'});
    tx+=orderLine('Sale total',b.sale,{color:'var(--green)'})+orderLine('Buyer postage',b.postage,{plus:true,color:'var(--green)',hideZero:true})+orderLine('Gross receipts',b.gross,{total:true,color:'var(--green)'});
    tx+=orderLine('Platform / payment fees',b.bpf,{minus:true,color:'var(--red)',hideZero:true})+orderLine('Listing / relist fees',b.listingFee,{minus:true,color:'var(--red)',hideZero:true})+orderLine('Promotion / boost',b.promoFee,{minus:true,color:'var(--red)',hideZero:true})+orderLine('Shipping cost',b.shipping,{minus:true,color:'var(--red)',hideZero:true})+orderLine('Packaging',b.packaging,{minus:true,color:'var(--red)',hideZero:true})+orderLine('Stock cost',b.itemCost,{minus:true,color:'var(--red)',hideZero:true})+orderLine('Parts & item expenses',b.parts,{minus:true,color:'var(--red)',hideZero:true})+orderLine('Partial refunds',b.partialRefund,{minus:true,color:'var(--accent)',hideZero:true})+orderLine('Order net profit',b.profit,{total:true,color:b.profit>=0?'var(--green)':'var(--red)'})+'</div>';
    var members='<div class="rt-bo-card"><div class="rt-bo-card-title">Items in this order</div>'+b.items.map(function(i){
      var cyc=memberCycle(i,bid),br=bundleCycleBreakdown(i,bid),share=cyc?n(cyc.price):0,prof=br?n(br.netProfit):(typeof _bundleMemberProfit==='function'?n(_bundleMemberProfit(i,bid)):0),m=i._month||_findItemMonth(i.id)||'';
      return '<div class="rt-bo-member"><div class="rt-bo-member-main" onclick="closePanel();openItemPage(\''+jsq(m)+'\',\''+jsq(i.id)+'\',document.querySelector(\'.page.on\').id)"><div class="rt-bo-member-name">'+html(i.item||'Item')+'</div><div class="rt-bo-member-meta">Allocated share '+money(share)+(i.gid?' · '+html(i.gid):'')+'</div></div><div class="rt-bo-member-money"><strong>'+money(share)+'</strong><small style="color:'+(prof>=0?'var(--green)':'var(--red)')+'">'+(prof>=0?'+':'')+money(prof)+'</small></div>'+memberMenu(i,bid)+'</div>';
    }).join('')+'</div>';
    var reverse=b.reverse&&b.reverse.ok;
    var actions='<div class="rt-bo-actions"><button class="btn btn-secondary" onclick="closePanel()">Close</button>'+(reverse?'<button class="btn btn-primary" onclick="reverseBundleOrder(\''+jsq(bid)+'\')">'+(typeof icon==='function'?icon('undo',14):'↶')+' Reverse order</button>':'')+'</div>';
    var note=!reverse?'<div class="rt-bo-note">'+html((b.reverse&&b.reverse.reason)||'This order has later lifecycle history, so it is read-only as a combined transaction.')+'</div>':'';
    openPanel(title,hero+kpis+tx+members+actions+note);
  };

  window._rtBundleSetDiscount=function(raw){
    var ask=n(window._rtBundleAskTotal),p=Math.max(0,Math.min(100,n(raw))),total=ask*(1-p/100),el=document.getElementById('bundle-total');
    if(el)el.value=total.toFixed(2);_rtBundleRefreshDiscount(total);
  };
  window._rtBundleQuickDiscount=function(p){var el=document.getElementById('bundle-discount-pct');if(el)el.value=String(p);_rtBundleSetDiscount(p);};
  window._rtBundleSyncFromTotal=function(raw){_rtBundleRefreshDiscount(Math.max(0,n(raw)));};
  window._rtBundleRefreshDiscount=function(total){
    var ask=n(window._rtBundleAskTotal),disc=Math.max(0,ask-total),p=ask>0?disc/ask*100:0;
    var pe=document.getElementById('bundle-discount-pct');if(pe&&document.activeElement!==pe)pe.value=(Math.round(p*10)/10).toString();
    var dv=document.getElementById('bundle-discount-value');if(dv)dv.textContent=disc>0?'−'+money(disc):money(0);
    var sv=document.getElementById('bundle-final-preview');if(sv)sv.textContent=money(total);
    var hint=document.getElementById('bundle-total-hint');if(hint)hint.textContent=disc>0?money(disc)+' below combined list price · allocated pro-rata by listed price':'matches combined list price · allocated pro-rata by listed price';
  };

  window.openBundleSaleModal=function(){
    injectStyles();
    var ids=[...STOCK_SELECTED];if(ids.length<2){toast('Select at least 2 items for a bundle','err');return;}
    var items=[];
    ids.forEach(function(id){allDBKeys().forEach(function(k){var x=(DB[k]||[]).find(function(i){return i.id===id;});if(x&&_lifecycleCan(x,'markSold')&&!_activeJobLotMembership(x.id))items.push(Object.assign({},x,{_month:k}));});});
    if(items.length!==ids.length||items.length<2){toast('Some selected items are no longer available to sell. Review the selection and try again.','err');return;}
    var today=new Date().toISOString().split('T')[0],totalAsk=items.reduce(function(s,i){return s+n(i.salePrice);},0);window._rtBundleAskTotal=+totalAsk.toFixed(2);window._bundleIds=ids;
    var initialPlatform=(typeof _itemPlatform==='function'?_itemPlatform(items[0]):'')||'';
    var platformOptions=Object.values(PLATFORMS).filter(function(p){return p.live;}).map(function(p){return '<option value="'+html(p.id)+'"'+(p.id===initialPlatform?' selected':'')+'>'+html(p.label||p.short)+'</option>';}).join('');
    var list=items.map(function(i){return '<div class="rt-bo-tr"><span>'+html(i.item||'Item')+'</span><strong>'+money(i.salePrice)+'</strong></div>';}).join('');
    var body='<div class="rt-bo-hero"><div class="rt-bo-eyebrow">Bundle / multi-buy sale</div><div class="rt-bo-total">'+money(totalAsk)+'</div><div class="rt-bo-sub">'+items.length+' listed items · set the buyer’s combined price below. RETRADE keeps one order total and allocates it to the items only for internal P&amp;L.</div></div>'
      +'<div class="fg"><label>Sale date</label><input type="date" id="bundle-date" value="'+today+'"></div>'
      +'<div class="fg"><label>Platform</label><select id="bundle-platform">'+platformOptions+'</select></div>'
      +'<div class="rt-bo-discount"><div class="fg" style="margin-bottom:0"><label>Bundle discount (%)</label><input type="number" id="bundle-discount-pct" min="0" max="100" step="0.1" value="0" inputmode="decimal" oninput="_rtBundleSetDiscount(this.value)"><div class="rt-bo-quick"><button type="button" class="rt-bo-chip" onclick="_rtBundleQuickDiscount(5)">5%</button><button type="button" class="rt-bo-chip" onclick="_rtBundleQuickDiscount(10)">10%</button><button type="button" class="rt-bo-chip" onclick="_rtBundleQuickDiscount(15)">15%</button></div></div><div class="fg" style="margin-bottom:0"><label>Discount value</label><div id="bundle-discount-value" style="height:42px;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;background:var(--surface2);display:flex;align-items:center;padding:0 12px;font-size:17px;font-weight:750;color:var(--accent)">'+money(0)+'</div></div></div>'
      +'<div class="fg" style="margin-top:14px"><label>Final bundle price (£)</label><input type="number" id="bundle-total" min="0" step="0.01" value="'+totalAsk.toFixed(2)+'" inputmode="decimal" oninput="_rtBundleSyncFromTotal(this.value)"><div id="bundle-total-hint" class="rt-bo-note">matches combined list price · allocated pro-rata by listed price</div></div>'
      +'<div class="rt-bo-summary"><div><small>Buyer item total</small><strong id="bundle-final-preview">'+money(totalAsk)+'</strong></div><div style="text-align:right"><small>Combined list price</small><strong>'+money(totalAsk)+'</strong></div></div>'
      +'<div class="rt-bo-discount"><div class="fg"><label>Buyer postage on top (£)</label><input type="number" id="bundle-buyer-postage" min="0" step="0.01" value="0" inputmode="decimal"></div><div class="fg"><label>Your shipping cost (£)</label><input type="number" id="bundle-shipping" min="0" step="0.01" value="0" inputmode="decimal"></div></div>'
      +'<div class="rt-bo-card"><div class="rt-bo-card-title">Items</div>'+list+'</div>'
      +'<button class="btn btn-primary" style="width:100%" onclick="submitBundleSale()">Sell '+items.length+' items as one order</button>';
    openPanel('Bundle order',body);
  };

  window.submitBundleSale=function(){
    var ids=window._bundleIds||[];if(!ids.length)return;
    var dateEl=document.getElementById('bundle-date'),dateVal=(dateEl&&dateEl.value||'').trim();if(!dateVal){toast('Select a sale date','err');return;}
    var platform=(document.getElementById('bundle-platform')||{}).value||'',totalShipping=n((document.getElementById('bundle-shipping')||{}).value),items=[];
    ids.forEach(function(id){allDBKeys().forEach(function(k){var x=(DB[k]||[]).find(function(i){return i.id===id;});if(x&&_lifecycleCan(x,'markSold')&&!_activeJobLotMembership(x.id))items.push(x);});});
    if(items.length!==ids.length||items.length<2){toast('Bundle selection changed while the sale form was open. Reopen it and review the items.','err');return;}
    var askSum=items.reduce(function(a,i){return a+n(i.salePrice);},0),totalEl=document.getElementById('bundle-total'),bundleTotal=totalEl&&totalEl.value!==''?n(totalEl.value):askSum;
    if(bundleTotal<=0){toast('Bundle price must be greater than 0','err');return;}
    var weights=items.map(function(i){return n(i.salePrice);}),shares=_bundleSplit(bundleTotal,weights),buyerPostage=n((document.getElementById('bundle-buyer-postage')||{}).value),shipShares=_bundleSplit(totalShipping,weights),postShares=_bundleSplit(buyerPostage,weights),bundleId=_newId('b'),bundleRef='BDL-'+String(dateVal).replace(/-/g,'').slice(2)+'-'+items.length;
    items.forEach(function(item,idx){
      var hasPriorFull=(item.returnHistory||[]).some(function(r){return r.type==='full_seller'||r.type==='full_ebay';});
      if(hasPriorFull){
        item.resaleDateSold=dateVal;item.resaleSalePrice=shares[idx];item.resalePlatform=platform||item.resalePlatform||_itemPlatform(item);item.resalePostage=postShares[idx]||0;item.resaleShippingCost=shipShares[idx]||0;item.resalePackagingCost=n(item.packagingCost);item.resalePromoPercent=n(item.promoPercent);item.resaleBundleId=bundleId;item.resaleBundleRef=bundleRef;item.resaleBundleTotal=+bundleTotal.toFixed(2);item.isReturned=false;item.state='sold';
      }else{
        item.dateSold=dateVal;if(platform)item.soldOnPlatform=platform;item.salePrice=shares[idx];item.postage=postShares[idx]||0;item.shippingCost=shipShares[idx]||0;item.bundleId=bundleId;item.bundleRef=bundleRef;item.bundleTotal=+bundleTotal.toFixed(2);item.state='sold';
      }
    });
    saveDB();window._bundleIds=[];STOCK_SELECTED.clear();STOCK_SELECTION_MODE=false;closePanel();renderStock();toast('Bundle order saved · '+items.length+' items · '+money(bundleTotal)+(askSum>bundleTotal?' · '+money(askSum-bundleTotal)+' discount':'') );
    setTimeout(function(){openBundlePage(bundleId);},0);
  };

  function liveBundleId(i){
    if(!i)return null;
    if(i.resaleSalePrice&&i.resaleBundleId)return i.resaleBundleId;
    if(i.dateSold&&i.bundleId)return i.bundleId;
    if(!i.dateSold&&!i.resaleSalePrice&&(i.bundleId||i.resaleBundleId))return i.resaleBundleId||i.bundleId;
    return null;
  }
  function routeGroupedUndo(m,id){var i=(DB[m]||[]).find(function(x){return x.id===id;});var bid=liveBundleId(i);if(!bid)return false;toast('This item belongs to a bundle order — reverse the order together.');openBundlePage(bid);return true;}
  if(_origUndoSale)window.undoSale=function(m,id){if(routeGroupedUndo(m,id))return;return _origUndoSale.apply(this,arguments);};
  if(_origUndoResale)window.undoResale=function(m,id){if(routeGroupedUndo(m,id))return;return _origUndoResale.apply(this,arguments);};
  if(_origRevertToActive)window.revertToActive=function(m,id){if(routeGroupedUndo(m,id))return;return _origRevertToActive.apply(this,arguments);};
  if(_origDeleteItem)window.deleteItem=function(m,id){
    var i=(DB[m]||[]).find(function(x){return x.id===id;}),bid=liveBundleId(i);
    if(bid){toast('This item is linked to a bundle order. Reverse the order first, then Delete will work normally.');openBundlePage(bid);return;}
    return _origDeleteItem.apply(this,arguments);
  };

  injectStyles();
  console.info('[RETRADE] bundle-order patch '+RT_BUNDLE_VERSION+' active');
})();
