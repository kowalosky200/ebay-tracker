/* RETRADE bundle-order lifecycle layer.
 * A multi-item bundle is one customer order with per-item accounting shares.
 * Owns bundle entry/editing, order page, combined P&L, row actions and atomic reversal.
 */
(function(){
  'use strict';

  var RT_BUNDLE_VERSION='20260909.2';
  var _origUndoSale=typeof window.undoSale==='function'?window.undoSale:null;
  var _origUndoResale=typeof window.undoResale==='function'?window.undoResale:null;
  var _origRevertToActive=typeof window.revertToActive==='function'?window.revertToActive:null;
  var _origDeleteItem=typeof window.deleteItem==='function'?window.deleteItem:null;
  var _origWithdraw=typeof window.withdrawToSourced==='function'?window.withdrawToSourced:null;
  var _origStepBack=typeof window.stepBack==='function'?window.stepBack:null;
  var _origEditItem=typeof window.editItem==='function'?window.editItem:null;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function has(o,k){return !!o&&Object.prototype.hasOwnProperty.call(o,k);}
  function money(v){return typeof fmt==='function'?fmt(num(v)):'£'+num(v).toFixed(2);}
  function e(v){return typeof esc==='function'?esc(String(v==null?'':v)):String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function q(v){return String(v==null?'':v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');}
  function pct(v){return (Math.round(num(v)*10)/10).toFixed(1).replace(/\.0$/,'')+'%';}
  function liveRec(id){return typeof _findItemRecordById==='function'?_findItemRecordById(id):null;}
  function itemsFor(bid){return typeof _bundleItems==='function'?_bundleItems(bid):[];}
  function cycleFor(i,bid){return typeof _bundleMemberCycle==='function'?_bundleMemberCycle(i,bid):null;}
  function activeBundleId(i){
    if(!i)return null;
    if(i.resaleBundleId)return i.resaleBundleId;
    if(i.bundleId)return i.bundleId;
    var ids=typeof _itemGroupedSaleIds==='function'?_itemGroupedSaleIds(i):[];
    return ids&&ids.length?ids[ids.length-1]:null;
  }

  function injectStyles(){
    if(document.getElementById('rt-bundle-order-css'))return;
    var s=document.createElement('style');
    s.id='rt-bundle-order-css';
    s.textContent=''
      +'.rt-bo-page{position:fixed;inset:0;z-index:2600;background:var(--bg,#0c1423);color:var(--text);overflow:auto;-webkit-overflow-scrolling:touch;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}'
      +'.rt-bo-top{position:sticky;top:0;z-index:3;background:color-mix(in srgb,var(--bg,#0c1423) 94%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);padding:10px 14px;display:flex;align-items:center;gap:10px}'
      +'.rt-bo-back{width:38px;height:38px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:21px;display:flex;align-items:center;justify-content:center;cursor:pointer}'
      +'.rt-bo-topmain{flex:1;min-width:0}.rt-bo-title{font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-bo-ref{font-size:11px;color:var(--muted);margin-top:2px}'
      +'.rt-bo-content{max-width:900px;margin:0 auto;padding:14px 14px 28px}.rt-bo-hero{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:15px;margin-bottom:12px}'
      +'.rt-bo-eyebrow{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.rt-bo-total{font-size:28px;font-weight:850;line-height:1.1;margin-top:4px}.rt-bo-sub{font-size:12px;color:var(--text-secondary);margin-top:6px;line-height:1.45}'
      +'.rt-bo-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 12px}.rt-bo-kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 12px}.rt-bo-kpi small{display:block;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.rt-bo-kpi strong{font-size:17px}'
      +'.rt-bo-card{background:var(--surface);border:1px solid var(--border);border-radius:11px;overflow:hidden;margin-bottom:12px}.rt-bo-card-title{padding:10px 12px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);background:var(--surface2)}'
      +'.rt-bo-tr{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--border);font-size:12.5px}.rt-bo-tr:first-of-type{border-top:0}.rt-bo-tr span:first-child{flex:1;color:var(--text-secondary)}.rt-bo-tr strong{font-weight:700}.rt-bo-tr.total{font-size:14px;background:var(--surface2)}'
      +'.rt-bo-member{display:flex;align-items:center;gap:9px;padding:10px 12px;border-top:1px solid var(--border);min-width:0}.rt-bo-member-main{flex:1;min-width:0;cursor:pointer}.rt-bo-member-name{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-bo-member-meta{font-size:11px;color:var(--muted);margin-top:3px}.rt-bo-member-money{text-align:right;flex:0 0 auto}.rt-bo-member-money strong{display:block;font-size:13px}.rt-bo-member-money small{display:block;font-size:11px;margin-top:2px}'
      +'.rt-bo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.rt-bo-actions .btn{flex:1;min-width:120px}.rt-bo-warn{background:rgba(245,166,35,.09);border:1px solid rgba(245,166,35,.25);border-radius:10px;padding:10px 12px;color:var(--text-secondary);font-size:12px;line-height:1.5;margin-bottom:12px}'
      +'.rt-bo-sale-list{border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px}.rt-bo-sale-item{display:grid;grid-template-columns:minmax(0,1fr) 104px;gap:10px;align-items:center;padding:10px 12px;border-top:1px solid var(--border);background:var(--surface)}.rt-bo-sale-item:first-child{border-top:0}.rt-bo-sale-item-name{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-bo-sale-item-sub{font-size:10.5px;color:var(--muted);margin-top:3px}.rt-bo-sale-item input{text-align:right;font-weight:750}'
      +'.rt-bo-discount-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rt-bo-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.rt-bo-chip{border:1px solid var(--border);background:var(--surface2);color:var(--text-secondary);border-radius:999px;padding:5px 9px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}.rt-bo-summary{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin:0 0 12px;display:flex;justify-content:space-between;gap:12px;align-items:center}.rt-bo-summary small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700}.rt-bo-summary strong{font-size:18px}'
      +'.bundle-row .item-actions{display:flex!important;visibility:visible!important;opacity:1!important}.bundle-row .ddbtn{display:inline-flex!important;visibility:visible!important;opacity:1!important}'
      +'@media(min-width:640px){.rt-bo-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.rt-bo-content{padding-top:20px}.rt-bo-sale-item{grid-template-columns:minmax(0,1fr) 130px}}';
    document.head.appendChild(s);
  }

  function bundleBreakdown(bid){
    var items=itemsFor(bid), out={items:items,sale:0,postage:0,receipts:0,fees:0,listing:0,promo:0,shipping:0,packaging:0,cost:0,parts:0,saleLegNet:0,profit:0,date:'',ref:'',platform:'',totalField:0};
    items.forEach(function(i){
      var cyc=cycleFor(i,bid);if(!cyc)return;
      out.sale+=num(cyc.price);out.postage+=num(cyc.postage);out.shipping+=num(cyc.shipping);
      if(!out.date)out.date=cyc.date||'';if(!out.ref)out.ref=cyc.bundleRef||'';if(!out.totalField)out.totalField=num(cyc.bundleTotal);
      if(!out.platform)out.platform=cyc.platformId||cyc.platform||((Number(cyc.saleNo)||1)>=2?i.resalePlatform:(i.soldOnPlatform||i.salePlatform||i.defaultPlatform))||'';
      try{
        var ev=(typeof _saleEventForCycle==='function')?_saleEventForCycle(i,i._month||((liveRec(i.id)||{}).month),cyc):{item:i,sale:String(cyc.saleNo||1),saleDate:cyc.date||'',snapshot:cyc,isReturnAdjustment:false};
        var br=typeof _saleBreakdown==='function'?_saleBreakdown(ev):null;
        if(br){out.fees+=num(br.bpf);out.listing+=num(br.listingFee);out.promo+=num(br.promoFee);out.packaging+=num(br.packaging);out.cost+=num(br.itemCost);out.parts+=num(br.parts);out.saleLegNet+=num(br.netProfit);}
      }catch(_e){}
      try{out.profit+=typeof _bundleMemberProfit==='function'?num(_bundleMemberProfit(i,bid)):0;}catch(_e2){}
    });
    out.sale=+out.sale.toFixed(2);out.postage=+out.postage.toFixed(2);out.receipts=+(out.sale+out.postage).toFixed(2);out.shipping=+out.shipping.toFixed(2);
    ['fees','listing','promo','packaging','cost','parts','saleLegNet','profit'].forEach(function(k){out[k]=+out[k].toFixed(2);});
    out.returnImpact=+(out.profit-out.saleLegNet).toFixed(2);out.margin=out.receipts>0?+(out.profit/out.receipts*100).toFixed(1):null;
    return out;
  }

  function saleLogsFor(i,bid){
    var cyc=cycleFor(i,bid);if(!cyc)return [];
    var target=num(cyc.saleNo)>=2?'resold':'sold';
    return (DB.activityLog||[]).filter(function(l){return l&&l.itemId===i.id&&l.before&&l.fromState==='listed'&&l.toState===target;}).sort(function(a,b){return num(b.ts)-num(a.ts);});
  }
  function activityCluster(bid,items){
    items=items||itemsFor(bid);if(!items.length)return null;
    var lists=items.map(function(i){return saleLogsFor(i,bid);});
    if(lists.some(function(x){return !x.length;}))return null;
    var best=null;
    lists[0].forEach(function(seed){
      var chosen=[seed],ok=true;
      for(var x=1;x<lists.length;x++){
        var nearest=null,dist=Infinity;
        lists[x].forEach(function(l){var d=Math.abs(num(l.ts)-num(seed.ts));if(d<dist){dist=d;nearest=l;}});
        if(!nearest||dist>3000){ok=false;return;}chosen.push(nearest);
      }
      if(ok&&(!best||num(seed.ts)>num(best[0].ts)))best=chosen;
    });
    if(!best)return null;
    var byId={};best.forEach(function(l){byId[l.itemId]=l;});return {logs:best,byId:byId};
  }
  function originalAsk(bid,items){
    var c=activityCluster(bid,items);if(!c)return null;
    var total=0,ok=true;(items||[]).forEach(function(i){var l=c.byId[i.id];if(!l||!l.before){ok=false;return;}total+=num(l.before.salePrice);});
    return ok?+total.toFixed(2):null;
  }
  function laterSafe(bid,item,saleLog){
    var later=(DB.activityLog||[]).filter(function(l){return l&&l.itemId===item.id&&!l.undone&&num(l.ts)>num(saleLog.ts);}).sort(function(a,b){return num(a.ts)-num(b.ts);});
    for(var x=0;x<later.length;x++){
      var l=later[x],b=l.before||{},grouped=(b.bundleId===bid||b.resaleBundleId===bid);
      if(!(l.toState==='listed'&&grouped))return {ok:false,later:later};
    }
    return {ok:true,later:later};
  }
  function reversePlan(bid){
    var items=itemsFor(bid);if(items.length<2)return {ok:false,reason:'Bundle members could not be reconstructed.',items:items};
    var c=activityCluster(bid,items);if(!c)return {ok:false,reason:'The original grouped-sale snapshots are not available, so RETRADE cannot safely restore the pre-sale asking prices.',items:items};
    var rows=[],reason='';
    items.forEach(function(i){
      if(reason)return;var log=c.byId[i.id],cyc=cycleFor(i,bid);if(!log||!cyc){reason='A bundle member no longer has a matching sale cycle.';return;}
      var safe=laterSafe(bid,i,log);if(!safe.ok){reason='One or more items have later return/relist history. Undo those newer changes first.';return;}
      rows.push({item:i,cycle:cyc,log:log,later:safe.later});
    });
    return reason?{ok:false,reason:reason,items:items}:{ok:true,items:items,rows:rows};
  }
  function restoreKey(item,before,key){if(has(before,key))item[key]=clone(before[key]);else delete item[key];}
  function restoreSaleFields(live,row){
    var before=row.log.before||{},saleNo=num(row.cycle.saleNo)||1;
    var keys=saleNo>=2
      ?['resaleDateSold','resaleSalePrice','resalePlatform','resalePostage','resaleShippingCost','resalePackagingCost','resalePromoPercent','resaleBundleId','resaleBundleRef','resaleBundleTotal','resaleGrossProfit','grossProfit','isReturned','state']
      :['dateSold','salePrice','postage','shippingCost','soldOnPlatform','salePlatform','bundleId','bundleRef','bundleTotal','grossProfit','isReturned','state'];
    keys.forEach(function(k){restoreKey(live,before,k);});
  }

  window.reverseBundleOrder=async function(bid){
    var plan=reversePlan(bid);if(!plan.ok){toast(plan.reason||'This bundle cannot be reversed safely.','err');return;}
    var b=bundleBreakdown(bid),ref=b.ref||'this bundle';
    var ok=await showConfirm('Reverse bundle order?',e(ref)+' will be reversed as one order. All '+plan.items.length+' items will return to their exact pre-sale Listed state, including the original asking prices. The bundle link will be removed from every member.',{icon:'info',okLabel:'Reverse order',danger:false});
    if(!ok)return;
    var old=typeof _suppressActivityCapture!=='undefined'?_suppressActivityCapture:false;
    try{
      if(typeof _suppressActivityCapture!=='undefined')_suppressActivityCapture=true;
      plan.rows.forEach(function(r){
        var rec=liveRec(r.item.id);if(!rec)throw new Error('Bundle member missing during reversal');
        restoreSaleFields(rec.item,r);r.log.undone=true;r.later.forEach(function(l){l.undone=true;});
        if(typeof _activityShadow!=='undefined')_activityShadow[rec.item.id]={status:typeof _actStatus==='function'?_actStatus(rec.item):'listed',name:rec.item.item||'',month:rec.month,snap:JSON.stringify(rec.item)};
      });
      saveDB();closeBundlePage();if(typeof renderMonth==='function')renderMonth();if(typeof renderStock==='function')renderStock();toast('Bundle order reversed · '+plan.items.length+' items restored to Listed');
    }catch(err){console.error('[RETRADE bundle reverse]',err);toast('Bundle reversal failed. No further changes were made.','err');}
    finally{if(typeof _suppressActivityCapture!=='undefined')_suppressActivityCapture=old;}
  };

  function canEditOrder(bid){
    var its=itemsFor(bid);if(its.length<2)return {ok:false,reason:'Bundle members are incomplete.'};
    for(var x=0;x<its.length;x++){
      var i=its[x],cyc=cycleFor(i,bid);if(!cyc||!cyc.date)return {ok:false,reason:'This order is partially reversed. Use Reverse order to repair it first.'};
      var saleNo=num(cyc.saleNo)||1;
      var hist=(i.returnHistory||[]).some(function(r){return (num(r.saleNo)||1)===saleNo;});
      if(hist)return {ok:false,reason:'This order has return/refund history. Undo those adjustments before editing the original order values.'};
    }
    return {ok:true};
  }
  function setCycleValues(live,cyc,v){
    var saleNo=num(cyc.saleNo)||1;
    if(saleNo>=2){
      live.resaleDateSold=v.date;live.resaleSalePrice=v.price;live.resalePostage=v.postage;live.resaleShippingCost=v.shipping;live.resalePlatform=v.platform;live.resaleBundleTotal=v.total;
    }else{
      live.dateSold=v.date;live.salePrice=v.price;live.postage=v.postage;live.shippingCost=v.shipping;live.soldOnPlatform=v.platform;live.salePlatform=v.platform;live.bundleTotal=v.total;
    }
    try{live.grossProfit=calcGrossProfit(live);}catch(_e){}
  }
  function saleInputRows(items,bid,mode){
    return items.map(function(i){
      var cyc=bid?cycleFor(i,bid):null,ask=mode==='new'?num(i.salePrice):null,price=mode==='new'?ask:num(cyc&&cyc.price);
      return '<div class="rt-bo-sale-item"><div><div class="rt-bo-sale-item-name">'+e(i.item||'Item')+'</div><div class="rt-bo-sale-item-sub">'+(mode==='new'?'Listed '+money(ask):'Allocated share · '+money(price))+'</div></div>'
        +'<input class="rt-bo-share" data-id="'+e(i.id)+'" data-ask="'+(mode==='new'?ask:price)+'" type="number" min="0" step="0.01" value="'+price.toFixed(2)+'" oninput="'+(mode==='new'?'_rtBundleSaleRecalc()':'_rtBundleEditRecalc()')+'"></div>';
    }).join('');
  }

  window._rtBundleSaleRecalc=function(){
    var xs=Array.from(document.querySelectorAll('.rt-bo-share')),sum=xs.reduce(function(s,x){return s+Math.max(0,num(x.value));},0),ask=xs.reduce(function(s,x){return s+Math.max(0,num(x.dataset.ask));},0);
    var total=document.getElementById('bundle-total'),disc=document.getElementById('bundle-discount');if(total)total.value=sum.toFixed(2);if(disc)disc.value=ask>0?Math.max(0,(1-sum/ask)*100).toFixed(2):'0';
    var a=document.getElementById('bundle-final-total');if(a)a.textContent=money(sum);
  };
  window._rtBundleSaleApplyDiscount=function(v){
    var p=Math.max(0,Math.min(100,num(v))),xs=Array.from(document.querySelectorAll('.rt-bo-share'));
    xs.forEach(function(x){x.value=(num(x.dataset.ask)*(1-p/100)).toFixed(2);});_rtBundleSaleRecalc();
  };
  window._rtBundleSaleSetDiscount=function(p){var d=document.getElementById('bundle-discount');if(d)d.value=p;_rtBundleSaleApplyDiscount(p);};
  window._rtBundleSaleReallocate=function(v){
    var total=Math.max(0,num(v)),xs=Array.from(document.querySelectorAll('.rt-bo-share')),weights=xs.map(function(x){return Math.max(0,num(x.dataset.ask));}),shares=typeof _bundleSplit==='function'?_bundleSplit(total,weights):[];
    xs.forEach(function(x,idx){x.value=num(shares[idx]).toFixed(2);});_rtBundleSaleRecalc();
  };

  window.openBundleSaleModal=function(){
    injectStyles();var ids=Array.from(STOCK_SELECTED||[]);if(ids.length<2){toast('Select at least 2 items for a bundle','err');return;}
    var items=[];ids.forEach(function(id){var r=liveRec(id);if(r&&_lifecycleCan(r.item,'markSold')&&!_activeJobLotMembership(id))items.push(Object.assign({},r.item,{_month:r.month}));});
    if(items.length!==ids.length||items.length<2){toast('Some selected items are no longer available to bundle. Review the selection and try again.','err');return;}
    var today=new Date().toISOString().split('T')[0],ask=items.reduce(function(s,i){return s+num(i.salePrice);},0),firstPlat=typeof _itemPlatform==='function'?_itemPlatform(items[0]):'';
    var html=''
      +'<div class="rt-bo-summary"><div><small>Combined listed price</small><strong>'+money(ask)+'</strong></div><div style="text-align:right"><small>Buyer pays</small><strong id="bundle-final-total">'+money(ask)+'</strong></div></div>'
      +'<div class="rt-bo-discount-grid"><div class="fg"><label>Bundle discount (%)</label><input id="bundle-discount" type="number" min="0" max="100" step="0.1" value="0" oninput="_rtBundleSaleApplyDiscount(this.value)"><div class="rt-bo-quick"><button type="button" class="rt-bo-chip" onclick="_rtBundleSaleSetDiscount(5)">5%</button><button type="button" class="rt-bo-chip" onclick="_rtBundleSaleSetDiscount(10)">10%</button><button type="button" class="rt-bo-chip" onclick="_rtBundleSaleSetDiscount(15)">15%</button></div></div>'
      +'<div class="fg"><label>Final order price (£)</label><input id="bundle-total" type="number" min="0" step="0.01" value="'+ask.toFixed(2)+'" oninput="_rtBundleSaleReallocate(this.value)"><div style="font-size:10.5px;color:var(--muted);margin-top:5px">Changing this reallocates across the item prices below.</div></div></div>'
      +'<div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:4px 0 7px">Item sale prices</div><div class="rt-bo-sale-list">'+saleInputRows(items,null,'new')+'</div>'
      +'<div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="fg"><label>Sale date</label><input type="date" id="bundle-date" value="'+today+'"></div><div class="fg"><label>Platform</label><select id="bundle-platform">'+Object.values(PLATFORMS).filter(function(p){return p.live;}).map(function(p){return '<option value="'+e(p.id)+'"'+(p.id===firstPlat?' selected':'')+'>'+e(p.label||p.short)+'</option>';}).join('')+'</select></div></div>'
      +'<div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="fg"><label>Buyer postage (£)</label><input type="number" id="bundle-buyer-postage" min="0" step="0.01" value="0"></div><div class="fg"><label>Your shipping cost (£)</label><input type="number" id="bundle-shipping" min="0" step="0.01" value="0"></div></div>'
      +'<div style="font-size:11px;color:var(--muted);line-height:1.5;margin:-2px 0 14px">Each item keeps its own cost and P&amp;L share, but RETRADE records this as one customer order. You can set the exact sale price allocated to every item.</div>'
      +'<button class="btn btn-primary" style="width:100%" onclick="submitBundleSale()">Mark '+items.length+' items sold as one order</button>';
    window._bundleIds=ids;openPanel('Bundle sale',html);
  };

  window.submitBundleSale=function(){
    var ids=window._bundleIds||[],date=((document.getElementById('bundle-date')||{}).value||'').trim();if(!date){toast('Select a sale date','err');return;}
    var platform=(document.getElementById('bundle-platform')||{}).value||'',inputs=Array.from(document.querySelectorAll('.rt-bo-share')),priceBy={};inputs.forEach(function(x){priceBy[x.dataset.id]=Math.max(0,num(x.value));});
    var live=[];ids.forEach(function(id){var r=liveRec(id);if(r&&_lifecycleCan(r.item,'markSold')&&!_activeJobLotMembership(id))live.push(r.item);});if(live.length!==ids.length||live.length<2){toast('Bundle selection changed. Reopen the bundle sale.','err');return;}
    var shares=live.map(function(i){return priceBy[i.id];});var total=+shares.reduce(function(s,v){return s+num(v);},0).toFixed(2);if(!(total>0)){toast('Bundle order price must be greater than 0','err');return;}
    var weights=shares.some(function(v){return v>0;})?shares:live.map(function(){return 1;}),buyerPost=Math.max(0,num((document.getElementById('bundle-buyer-postage')||{}).value)),shipping=Math.max(0,num((document.getElementById('bundle-shipping')||{}).value));
    var postShares=_bundleSplit(buyerPost,weights),shipShares=_bundleSplit(shipping,weights),bid=_newId('b'),ref='BDL-'+String(date).replace(/-/g,'').slice(2)+'-'+live.length;
    live.forEach(function(i,idx){
      var prior=(i.returnHistory||[]).some(function(r){return r.type==='full_seller'||r.type==='full_ebay';});
      if(prior){i.resaleDateSold=date;i.resaleSalePrice=shares[idx];i.resalePlatform=platform||i.resalePlatform||_itemPlatform(i);i.resalePostage=postShares[idx]||0;i.resaleShippingCost=shipShares[idx]||0;i.resalePackagingCost=num(i.packagingCost);i.resalePromoPercent=num(i.promoPercent);i.resaleBundleId=bid;i.resaleBundleRef=ref;i.resaleBundleTotal=total;i.isReturned=false;i.state='sold';}
      else{i.dateSold=date;i.salePrice=shares[idx];i.postage=postShares[idx]||0;i.shippingCost=shipShares[idx]||0;if(platform){i.soldOnPlatform=platform;i.salePlatform=platform;}i.bundleId=bid;i.bundleRef=ref;i.bundleTotal=total;i.isReturned=false;i.state='sold';}
      try{i.grossProfit=calcGrossProfit(i);}catch(_e){}
    });
    saveDB();window._bundleIds=[];STOCK_SELECTED.clear();STOCK_SELECTION_MODE=false;closePanel();toast('Bundle order sold · '+live.length+' items · '+money(total));if(typeof renderStock==='function')renderStock();setTimeout(function(){openBundlePage(bid);},0);
  };

  window._rtBundleEditRecalc=function(){var xs=Array.from(document.querySelectorAll('.rt-bo-share')),sum=xs.reduce(function(s,x){return s+Math.max(0,num(x.value));},0),t=document.getElementById('bo-edit-total');if(t)t.textContent=money(sum);};
  window.openBundleOrderEdit=function(bid){
    injectStyles();var check=canEditOrder(bid);if(!check.ok){toast(check.reason,'err');return;}var its=itemsFor(bid),b=bundleBreakdown(bid),first=its[0]||{},cyc=cycleFor(first,bid)||{};
    var html='<div class="rt-bo-summary"><div><small>Current order total</small><strong>'+money(b.sale)+'</strong></div><div style="text-align:right"><small>New total</small><strong id="bo-edit-total">'+money(b.sale)+'</strong></div></div>'
      +'<div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:4px 0 7px">Item sale prices</div><div class="rt-bo-sale-list">'+saleInputRows(its,bid,'edit')+'</div>'
      +'<div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="fg"><label>Sale date</label><input id="bo-edit-date" type="date" value="'+e(b.date)+'"></div><div class="fg"><label>Platform</label><select id="bo-edit-platform">'+Object.values(PLATFORMS).filter(function(p){return p.live;}).map(function(p){return '<option value="'+e(p.id)+'"'+(p.id===b.platform?' selected':'')+'>'+e(p.label||p.short)+'</option>';}).join('')+'</select></div></div>'
      +'<div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="fg"><label>Buyer postage total (£)</label><input id="bo-edit-postage" type="number" min="0" step="0.01" value="'+b.postage.toFixed(2)+'"></div><div class="fg"><label>Your shipping total (£)</label><input id="bo-edit-shipping" type="number" min="0" step="0.01" value="'+b.shipping.toFixed(2)+'"></div></div>'
      +'<div class="rt-bo-warn">Saving recalculates the joined order and each member P&amp;L together. It cannot be edited here once returns/refunds exist, because those historical snapshots must remain fixed.</div>'
      +'<button class="btn btn-primary" style="width:100%" onclick="saveBundleOrderEdit(\''+q(bid)+'\')">Save bundle order</button>';
    closeBundlePage();openPanel('Edit bundle order',html);
  };
  window.saveBundleOrderEdit=function(bid){
    var check=canEditOrder(bid);if(!check.ok){toast(check.reason,'err');return;}var its=itemsFor(bid),inputs=Array.from(document.querySelectorAll('.rt-bo-share')),by={};inputs.forEach(function(x){by[x.dataset.id]=Math.max(0,num(x.value));});
    var prices=its.map(function(i){return by[i.id];}),total=+prices.reduce(function(s,v){return s+num(v);},0).toFixed(2);if(!(total>0)){toast('Order total must be greater than 0','err');return;}
    var date=(document.getElementById('bo-edit-date')||{}).value||'',platform=(document.getElementById('bo-edit-platform')||{}).value||'',buyerPost=Math.max(0,num((document.getElementById('bo-edit-postage')||{}).value)),shipping=Math.max(0,num((document.getElementById('bo-edit-shipping')||{}).value)),weights=prices.some(function(v){return v>0;})?prices:its.map(function(){return 1;}),post=_bundleSplit(buyerPost,weights),ship=_bundleSplit(shipping,weights);
    its.forEach(function(copy,idx){var rec=liveRec(copy.id),cyc=cycleFor(copy,bid);if(!rec||!cyc)return;setCycleValues(rec.item,cyc,{date:date,platform:platform,price:prices[idx],postage:post[idx]||0,shipping:ship[idx]||0,total:total});});
    saveDB();closePanel();toast('Bundle order updated · '+money(total));if(typeof renderMonth==='function')renderMonth();setTimeout(function(){openBundlePage(bid);},0);
  };

  window._rtBundleEditMemberMeta=function(m,id){closeBundlePage();if(_origEditItem)_origEditItem(m,id);};
  function memberActions(i,bid){
    var m=i._month||((liveRec(i.id)||{}).month)||'',cyc=cycleFor(i,bid)||{},sold=!!cyc.date;
    return '<div class="ddwrap" id="bo-dd-'+e(i.id)+'"><button class="ddbtn" aria-label="Item actions" onclick="event.stopPropagation();toggleDD(\'bo-dd-'+q(i.id)+'\')" title="Actions">⋮</button><div class="ddmenu">'
      +'<button onclick="event.stopPropagation();closeBundlePage();openItemPage(\''+q(m)+'\',\''+q(i.id)+'\',document.querySelector(\'.page.on\')?document.querySelector(\'.page.on\').id:\'p-monthly\')">'+icon('fullpage',14)+' Full item page</button>'
      +'<button onclick="event.stopPropagation();openBundleOrderEdit(\''+q(bid)+'\')">'+icon('edit',14)+' Edit order prices</button>'
      +'<button onclick="event.stopPropagation();_rtBundleEditMemberMeta(\''+q(m)+'\',\''+q(i.id)+'\')">'+icon('edit',14)+' Edit item details</button>'
      +(sold?'<button onclick="event.stopPropagation();closeBundlePage();openReturn(\''+q(m)+'\',\''+q(i.id)+'\')">'+icon('return',14)+' Log Return</button>':'')
      +'<button onclick="event.stopPropagation();closeBundlePage();confirmDupeItem(\''+q(m)+'\',\''+q(i.id)+'\')">'+icon('dupe',14)+' Duplicate</button>'
      +'<button class="danger" onclick="event.stopPropagation();deleteItem(\''+q(m)+'\',\''+q(i.id)+'\')">'+icon('trash',14)+' Delete</button>'
      +'</div></div>';
  }

  window.closeBundlePage=function(){var p=document.getElementById('rt-bundle-page');if(p)p.remove();try{if(typeof unlockBodyScroll==='function')unlockBodyScroll();}catch(_e){}};
  window.openBundlePage=function(bid){
    injectStyles();var b=bundleBreakdown(bid);if(!b.items.length){toast('Bundle not found','err');return;}try{if(document.getElementById('slide-panel')&&document.getElementById('slide-panel').classList.contains('on'))closePanel();}catch(_e){}
    closeBundlePage();var ask=originalAsk(bid,b.items),discount=ask!=null?Math.max(0,ask-b.sale):null,edit=canEditOrder(bid),rev=reversePlan(bid),platformLabel=(PLATFORMS[b.platform]&&(PLATFORMS[b.platform].short||PLATFORMS[b.platform].label))||b.platform||'—';
    var members=b.items.map(function(i){var cyc=cycleFor(i,bid)||{},p=typeof _bundleMemberProfit==='function'?num(_bundleMemberProfit(i,bid)):0;return '<div class="rt-bo-member"><div class="rt-bo-member-main" onclick="closeBundlePage();openItemPage(\''+q(i._month)+'\',\''+q(i.id)+'\',document.querySelector(\'.page.on\')?document.querySelector(\'.page.on\').id:\'p-monthly\')"><div class="rt-bo-member-name">'+e(i.item||'Item')+'</div><div class="rt-bo-member-meta">Sale '+(num(cyc.saleNo)||1)+' · '+e(cyc.date||'—')+' · allocated '+money(cyc.price)+'</div></div><div class="rt-bo-member-money"><strong>'+money(cyc.price)+'</strong><small style="color:'+(p>=0?'var(--green)':'var(--red)')+'">'+(p>=0?'+':'')+money(p)+'</small></div>'+memberActions(i,bid)+'</div>';}).join('');
    var details=''
      +'<div class="rt-bo-tr"><span>Item sale total</span><strong>'+money(b.sale)+'</strong></div>'
      +(discount!=null&&discount>0?'<div class="rt-bo-tr"><span>Bundle / multi-buy discount'+(ask>0?' · '+pct(discount/ask*100):'')+'</span><strong style="color:var(--accent)">−'+money(discount)+'</strong></div>':'')
      +(b.postage?'<div class="rt-bo-tr"><span>Buyer postage</span><strong style="color:var(--green)">+'+money(b.postage)+'</strong></div>':'')
      +'<div class="rt-bo-tr total"><span>Gross receipts</span><strong>'+money(b.receipts)+'</strong></div>'
      +(b.fees?'<div class="rt-bo-tr"><span>Platform fees</span><strong style="color:var(--red)">−'+money(b.fees)+'</strong></div>':'')
      +(b.listing?'<div class="rt-bo-tr"><span>Listing / relist fees</span><strong style="color:var(--red)">−'+money(b.listing)+'</strong></div>':'')
      +(b.promo?'<div class="rt-bo-tr"><span>Promotion / boost</span><strong style="color:var(--red)">−'+money(b.promo)+'</strong></div>':'')
      +(b.shipping?'<div class="rt-bo-tr"><span>Shipping cost</span><strong style="color:var(--red)">−'+money(b.shipping)+'</strong></div>':'')
      +(b.packaging?'<div class="rt-bo-tr"><span>Packaging</span><strong style="color:var(--red)">−'+money(b.packaging)+'</strong></div>':'')
      +(b.cost?'<div class="rt-bo-tr"><span>Item cost</span><strong style="color:var(--red)">−'+money(b.cost)+'</strong></div>':'')
      +(b.parts?'<div class="rt-bo-tr"><span>Parts &amp; expenses</span><strong style="color:var(--red)">−'+money(b.parts)+'</strong></div>':'')
      +(Math.abs(b.returnImpact)>=0.005?'<div class="rt-bo-tr"><span>Return / refund impact</span><strong style="color:'+(b.returnImpact>=0?'var(--green)':'var(--red)')+'">'+(b.returnImpact>=0?'+':'')+money(b.returnImpact)+'</strong></div>':'')
      +'<div class="rt-bo-tr total"><span>Combined net P&amp;L</span><strong style="color:'+(b.profit>=0?'var(--green)':'var(--red)')+'">'+(b.profit>=0?'+':'')+money(b.profit)+'</strong></div>';
    var page=document.createElement('div');page.id='rt-bundle-page';page.className='rt-bo-page';page.innerHTML=''
      +'<div class="rt-bo-top"><button class="rt-bo-back" onclick="closeBundlePage()" aria-label="Back">‹</button><div class="rt-bo-topmain"><div class="rt-bo-title">Bundle Order</div><div class="rt-bo-ref">'+e(b.ref||'Grouped sale')+' · '+b.items.length+' items</div></div><button class="ddbtn" onclick="openBundleOrderEdit(\''+q(bid)+'\')" title="Edit order">⋮</button></div>'
      +'<div class="rt-bo-content"><div class="rt-bo-hero"><div class="rt-bo-eyebrow">One buyer · one transaction</div><div class="rt-bo-total">'+money(b.sale)+'</div><div class="rt-bo-sub">Sold '+e(b.date||'—')+' · '+e(platformLabel)+(b.postage?' · '+money(b.postage)+' buyer postage':'')+(ask!=null?' · original ask '+money(ask):'')+'</div></div>'
      +'<div class="rt-bo-kpis"><div class="rt-bo-kpi"><small>Gross receipts</small><strong>'+money(b.receipts)+'</strong></div><div class="rt-bo-kpi"><small>Net P&amp;L</small><strong style="color:'+(b.profit>=0?'var(--green)':'var(--red)')+'">'+(b.profit>=0?'+':'')+money(b.profit)+'</strong></div><div class="rt-bo-kpi"><small>Margin</small><strong>'+(b.margin==null?'—':b.margin.toFixed(1)+'%')+'</strong></div><div class="rt-bo-kpi"><small>Items</small><strong>'+b.items.length+'</strong></div></div>'
      +'<div class="rt-bo-card"><div class="rt-bo-card-title">Transaction &amp; joined P&amp;L</div>'+details+'</div>'
      +'<div class="rt-bo-card"><div class="rt-bo-card-title">Items in this order</div>'+members+'</div>'
      +(!edit.ok?'<div class="rt-bo-warn"><strong>Order editing locked.</strong> '+e(edit.reason)+'</div>':'')
      +(!rev.ok?'<div class="rt-bo-warn"><strong>Reverse order unavailable.</strong> '+e(rev.reason)+'</div>':'')
      +'<div class="rt-bo-actions">'+(edit.ok?'<button class="btn btn-secondary" onclick="openBundleOrderEdit(\''+q(bid)+'\')">Edit order / item prices</button>':'')+(rev.ok?'<button class="btn btn-secondary" style="color:var(--warn)" onclick="reverseBundleOrder(\''+q(bid)+'\')">Reverse order</button>':'')+'</div></div>';
    document.body.appendChild(page);try{if(typeof lockBodyScroll==='function')lockBodyScroll();}catch(_e2){}
  };

  window.renderBundleSaleRow=function(bid,members){
    var rev=0,profit=0,date='';members.forEach(function(ev){var post=((num(ev.sale)||1)>=2&&ev.item)?num(ev.item.resalePostage!=null?ev.item.resalePostage:ev.item.postage):num(ev.item&&ev.item.postage);rev+=num(ev.salePrice)+post;profit+=num(ev.profit);if(!date&&ev.saleDate)date=ev.saleDate;});
    var count=members.length,first=(members[0]&&members[0].item)||{},ref=typeof _eventBundleRef==='function'?_eventBundleRef(members[0]||{}):'',allSel=typeof _bundleAllSelected==='function'?_bundleAllSelected(bid):false,margin=rev>0?profit/rev*100:null;
    var left=SELECTION_MODE?'<label class="item-checkbox-left" onclick="event.stopPropagation()"><input type="checkbox" '+(allSel?'checked':'')+' onchange="_toggleBundleSelect(\''+q(bid)+'\')" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;margin-right:4px"></label>':'<div class="status-dot sold"></div>';
    var click=SELECTION_MODE?'onclick="_toggleBundleSelect(\''+q(bid)+'\')"':'onclick="openBundlePage(\''+q(bid)+'\')"';
    var edit=canEditOrder(bid),revPlan=reversePlan(bid),dd='<div class="ddwrap" id="bundle-row-dd-'+e(bid)+'"><button class="ddbtn" aria-label="Bundle actions" onclick="event.stopPropagation();toggleDD(\'bundle-row-dd-'+q(bid)+'\')" title="Actions">⋮</button><div class="ddmenu"><button onclick="event.stopPropagation();openBundlePage(\''+q(bid)+'\')">'+icon('fullpage',14)+' Open order</button>'+(edit.ok?'<button onclick="event.stopPropagation();openBundleOrderEdit(\''+q(bid)+'\')">'+icon('edit',14)+' Edit order / prices</button>':'')+(revPlan.ok?'<button onclick="event.stopPropagation();reverseBundleOrder(\''+q(bid)+'\')" style="color:var(--warn)">'+icon('revert',14)+' Reverse order</button>':'')+'</div></div>';
    return '<div class="item-row bundle-row" '+click+'><div class="item-main"><div class="item-row-inner">'+left+'<div class="item-row-body"><div class="item-row-name">'+e(first.item||'Bundle')+(count>1?' <span style="color:var(--text-secondary);font-weight:600">+ '+(count-1)+' more</span>':'')+'</div><div class="item-row-meta"><span class="item-badge sold">SOLD</span><span class="item-badge bundle">≋ BUNDLE</span>'+(date?'<span class="item-row-meta-sep">·</span><span>sold '+e(date)+'</span>':'')+(ref?'<span class="item-row-meta-sep">·</span><span>'+e(ref)+'</span>':'')+'</div></div><div class="item-row-right"><div class="item-row-price">'+money(rev)+'</div><div class="item-row-profit '+(profit>=0?'pos':'neg')+'">'+money(profit)+'</div>'+(margin!=null?'<div class="item-row-roi">'+margin.toFixed(1)+'% margin</div>':'')+'</div></div></div><div class="item-actions">'+dd+'</div></div>';
  };

  function routeGrouped(m,id){var r=liveRec(id),bid=r&&activeBundleId(r.item);if(!bid)return false;openBundlePage(bid);return true;}
  if(_origUndoSale)window.undoSale=async function(m,id){if(routeGrouped(m,id))return;return _origUndoSale(m,id);};
  if(_origUndoResale)window.undoResale=async function(m,id){if(routeGrouped(m,id))return;return _origUndoResale(m,id);};
  if(_origRevertToActive)window.revertToActive=async function(m,id){if(routeGrouped(m,id))return;return _origRevertToActive(m,id);};
  if(_origDeleteItem)window.deleteItem=async function(m,id){if(routeGrouped(m,id))return;return _origDeleteItem(m,id);};
  if(_origWithdraw)window.withdrawToSourced=function(m,id){if(routeGrouped(m,id))return;return _origWithdraw(m,id);};
  if(_origStepBack)window.stepBack=function(m,id){if(routeGrouped(m,id))return;return _origStepBack(m,id);};
  if(_origEditItem)window.editItem=function(m,id){var r=liveRec(id),bid=r&&activeBundleId(r.item);if(bid){openBundleOrderEdit(bid);return;}return _origEditItem(m,id);};

  injectStyles();
  console.info('[RETRADE] bundle-order lifecycle '+RT_BUNDLE_VERSION+' active');
})();
