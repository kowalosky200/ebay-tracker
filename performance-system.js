/* RETRADE performance + navigation pass v1.4.56
 *
 * Runtime responsibilities:
 * - memoize repeated sales-event range/month queries inside a short render window
 * - invalidate memoized analytics whenever local/cloud data refreshes
 * - remember the last Sales Yearly/Monthly sub-view
 * - use the Sales nav button itself as the Yearly/Monthly toggle when already there
 * - make every explicit Stock-nav click open Listed stock
 * - keep compact day/order separators on date-sorted monthly Sales
 * - tighten small-page language (Stock, Log past, Start new)
 *
 * No accounting maths, lifecycle rules, sync writes or Supabase schema changes.
 */
(function(){
  'use strict';

  var CACHE_MAX=24;
  var RANGE_TTL=30000;
  var rangeCache=new Map();
  var monthCache=new Map();
  var perfStats={rangeHit:0,rangeMiss:0,monthHit:0,monthMiss:0,invalidations:0};
  window.__rtPerfStats=perfStats;

  function now(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function trimCache(cache){while(cache.size>CACHE_MAX){var first=cache.keys().next();if(first.done)break;cache.delete(first.value);}}
  function clearQueryCaches(){rangeCache.clear();monthCache.clear();perfStats.invalidations++;}
  function copyArray(v){return Array.isArray(v)?v.slice():v;}

  /* Dashboard/Sales analytics ask for the same ranges several times during one
     render (headline stats, deltas, chart, forecast). Build the event list once
     and hand callers a shallow array copy so their sorting cannot poison cache. */
  try{
    if(typeof getSaleEventsInRange==='function'){
      var nativeRange=getSaleEventsInRange;
      getSaleEventsInRange=function(from,to){
        var key=String(from||'')+'|'+String(to||''),t=now(),hit=rangeCache.get(key);
        if(hit&&t-hit.at<RANGE_TTL){perfStats.rangeHit++;return copyArray(hit.value);}
        perfStats.rangeMiss++;
        var value=nativeRange.apply(this,arguments);
        rangeCache.set(key,{at:t,value:Array.isArray(value)?value.slice():value});trimCache(rangeCache);
        return copyArray(value);
      };
    }
    if(typeof getSaleEventsInMonth==='function'){
      var nativeMonth=getSaleEventsInMonth;
      getSaleEventsInMonth=function(month){
        var key=String(month||''),t=now(),hit=monthCache.get(key);
        if(hit&&t-hit.at<RANGE_TTL){perfStats.monthHit++;return copyArray(hit.value);}
        perfStats.monthMiss++;
        var value=nativeMonth.apply(this,arguments);
        monthCache.set(key,{at:t,value:Array.isArray(value)?value.slice():value});trimCache(monthCache);
        return copyArray(value);
      };
    }
  }catch(_){}

  try{
    if(typeof saveDB==='function'){
      var nativeSaveDB=saveDB;
      saveDB=function(){clearQueryCaches();return nativeSaveDB.apply(this,arguments);};
    }
    if(typeof refreshActivePage==='function'){
      var nativeRefresh=refreshActivePage;
      refreshActivePage=function(){clearQueryCaches();return nativeRefresh.apply(this,arguments);};
    }
  }catch(_){}

  var SALES_STATE_KEY='rt-sales-route-v1';
  function currentView(){try{return MONTHLY_VIEW==='detail'?'detail':'grid';}catch(_){return 'grid';}}
  function activePageId(){var p=document.querySelector('.page.on');return p?p.id:'';}
  function safeCurrentMonth(){try{return typeof currentMonthKey==='function'?currentMonthKey():'';}catch(_){return '';}}
  function bumpSalesMotion(){window.__rtSalesMotionReplayToken=(window.__rtSalesMotionReplayToken||0)+1;}
  function salesState(){
    var out={};
    try{out.view=MONTHLY_VIEW;}catch(_){}
    try{out.month=SELECTED_MONTH;}catch(_){}
    try{out.filter=MONTH_FILTER;}catch(_){}
    try{out.sort=MONTH_SORT;}catch(_){}
    try{out.period=MONTHLY_PERIOD;}catch(_){}
    return out;
  }
  function persistSalesState(){try{localStorage.setItem(SALES_STATE_KEY,JSON.stringify(salesState()));}catch(_){} }
  function restoreSalesState(){
    var s=null;try{s=JSON.parse(localStorage.getItem(SALES_STATE_KEY)||'null');}catch(_){}
    if(!s||typeof s!=='object')return false;
    try{if(s.view==='grid'||s.view==='detail')MONTHLY_VIEW=s.view;}catch(_){}
    try{if(s.month&&/^[A-Z]{3}-\d{2}$/.test(s.month))SELECTED_MONTH=s.month;}catch(_){}
    try{if(s.filter)MONTH_FILTER=s.filter;}catch(_){}
    try{if(s.sort)MONTH_SORT=s.sort;}catch(_){}
    try{if(s.period)MONTHLY_PERIOD=s.period;}catch(_){}
    return true;
  }
  var restoredSalesState=restoreSalesState();

  function removeOldSalesSwitcher(){
    var old=document.querySelector('#p-monthly .rt-sales-mode-switch');if(old)old.remove();
  }

  function setTextLeaf(el,text){
    if(!el)return;
    var spans=Array.prototype.slice.call(el.querySelectorAll('span')).filter(function(s){return String(s.textContent||'').trim().length>0;});
    if(spans.length){spans[spans.length-1].textContent=text;return;}
    el.textContent=text;
  }
  function polishStockUI(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab="stock"] .side-nav-item-label'),function(el){
      if(String(el.textContent||'').trim()==='Inventory')el.textContent='Stock';
    });
    var page=document.getElementById('p-stock');if(!page)return;
    var candidates=page.querySelectorAll('h1,h2,h3,[class*="page-title"],[class*="section-title"],[class*="heading"]');
    var changed=false;
    Array.prototype.some.call(candidates,function(el){
      if(String(el.textContent||'').trim()==='Inventory'){el.textContent='Stock';changed=true;return true;}return false;
    });
    if(changed)return;
    /* Fallback for the compact mobile header, whose title is currently a plain
       div rather than a semantic heading. Do not touch buttons/filter labels. */
    var all=page.querySelectorAll('div,span,strong');
    Array.prototype.some.call(all,function(el){
      if(el.closest('button,[role="button"],select,option'))return false;
      if(String(el.textContent||'').trim()==='Inventory'&&el.children.length===0){el.textContent='Stock';return true;}
      return false;
    });
  }
  function polishRunsUI(){
    var page=document.getElementById('p-runs');if(!page)return;
    Array.prototype.forEach.call(page.querySelectorAll('button'),function(btn){
      var txt=String(btn.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if(/^log past\b/.test(txt))setTextLeaf(btn,'Log past');
      else if(/^start new\b/.test(txt))setTextLeaf(btn,'Start new');
    });
  }
  function polishCurrentPage(){polishStockUI();polishRunsUI();removeOldSalesSwitcher();}

  /* Sales-nav behaviour:
     - from another page: return to the remembered Sales sub-view
     - while already on Sales: the next Sales tap toggles Yearly <-> Monthly
     Contextual month routing (calendar/month links) remains authoritative. */
  try{
    if(typeof goToTab==='function'){
      var nativeGoToTab=goToTab;
      goToTab=function(name,sourceEl){
        if(name==='stock'){
          try{STOCK_FILTER='listed';}catch(_){}
          var stockOut=nativeGoToTab.apply(this,arguments);
          try{if(typeof _saveUIState==='function')_saveUIState();}catch(_){}
          requestAnimationFrame(polishStockUI);
          return stockOut;
        }
        if(name==='runs'){
          var runsOut=nativeGoToTab.apply(this,arguments);
          requestAnimationFrame(polishRunsUI);
          return runsOut;
        }
        if(name!=='monthly')return nativeGoToTab.apply(this,arguments);

        var contextual=false;try{contextual=!!_monthOpenFromContext;}catch(_){}
        if(contextual)return nativeGoToTab.apply(this,arguments);

        var alreadySales=activePageId()==='p-monthly';
        if(alreadySales){
          try{MONTHLY_VIEW=currentView()==='grid'?'detail':'grid';}catch(_){}
          if(currentView()==='detail'){
            try{if(!SELECTED_MONTH)SELECTED_MONTH=safeCurrentMonth();}catch(_){}
          }
        }
        if(currentView()==='grid')bumpSalesMotion();

        var prior=false;try{prior=_monthOpenFromContext;_monthOpenFromContext=true;}catch(_){}
        try{return nativeGoToTab.apply(this,arguments);}
        finally{
          try{_monthOpenFromContext=prior;}catch(_){}
          persistSalesState();
          requestAnimationFrame(removeOldSalesSwitcher);
        }
      };
    }
  }catch(_){}

  function installStyles(){
    var old=document.getElementById('rt-performance-system-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-performance-system-css';
    s.textContent='\
#p-monthly .rt-sales-mode-switch{display:none!important}\
#month-list .rt-sales-day{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:27px;padding:5px 13px 4px;border-top:1px solid color-mix(in srgb,var(--border) 82%,transparent);border-bottom:1px solid color-mix(in srgb,var(--border) 62%,transparent);background:color-mix(in srgb,var(--surface2) 88%,var(--bg));color:var(--text-secondary);font-size:10.5px;line-height:1.2;font-weight:730;letter-spacing:.015em}\
#month-list .rt-sales-day:first-child{border-top:0}\
#month-list .rt-sales-day-count{color:var(--muted);font-size:9.8px;font-weight:650;white-space:nowrap}\
@media(max-width:639px){#month-list .rt-sales-day{padding-left:11px;padding-right:11px}}';
    document.head.appendChild(s);
  }
  installStyles();

  /* Keep route state current without adding another visible control to Sales. */
  try{
    if(typeof renderMonth==='function'){
      var nativeRenderMonth=renderMonth;
      renderMonth=function(){var out=nativeRenderMonth.apply(this,arguments);persistSalesState();removeOldSalesSwitcher();return out;};
    }
    if(typeof renderMonthlyGrid==='function'){
      var nativeRenderMonthlyGrid=renderMonthlyGrid;
      renderMonthlyGrid=function(){var out=nativeRenderMonthlyGrid.apply(this,arguments);persistSalesState();removeOldSalesSwitcher();return out;};
    }
    if(typeof renderStock==='function'){
      var nativeRenderStock=renderStock;
      renderStock=function(){var out=nativeRenderStock.apply(this,arguments);polishStockUI();return out;};
    }
    if(typeof renderRuns==='function'){
      var nativeRenderRuns=renderRuns;
      renderRuns=function(){var out=nativeRenderRuns.apply(this,arguments);polishRunsUI();return out;};
    }
  }catch(_){}

  function formatDay(ds){
    var p=String(ds||'').split('-');if(p.length!==3)return String(ds||'');
    var d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]),12,0,0,0);
    if(isNaN(d.getTime()))return String(ds||'');
    try{return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}catch(_){return String(ds||'');}
  }
  function orderCount(events){
    var count=0,seen={};
    (events||[]).forEach(function(e){
      if(!e||e.isReturnAdjustment)return;
      var bid='';try{bid=typeof _eventBundleId==='function'?(_eventBundleId(e)||''):'';}catch(_){}
      if(bid){if(seen[bid])return;seen[bid]=1;}
      count++;
    });
    return count||((events||[]).length?1:0);
  }
  function dayHeader(ds,events){
    var n=orderCount(events);
    return '<div class="rt-sales-day" data-date="'+String(ds||'')+'"><span>'+formatDay(ds)+'</span><span class="rt-sales-day-count">'+n+' order'+(n===1?'':'s')+'</span></div>';
  }

  try{
    if(typeof _renderMonthList==='function'){
      var nativeRenderMonthList=_renderMonthList;
      _renderMonthList=function(events){
        var dateSort=false;try{dateSort=MONTH_SORT==='date-sold';}catch(_){}
        if(!dateSort||!events||!events.length)return nativeRenderMonthList.apply(this,arguments);
        var groups=[],current=null;
        events.forEach(function(e){
          var ds=String((e&&e.saleDate)||'');
          if(!current||current.date!==ds){current={date:ds,events:[]};groups.push(current);}
          current.events.push(e);
        });
        return groups.map(function(g){return dayHeader(g.date,g.events)+nativeRenderMonthList.call(this,g.events);},this).join('');
      };
    }
  }catch(_){}

  try{
    var active=document.querySelector('.page.on');
    if(restoredSalesState&&active&&active.id==='p-monthly'&&typeof renderMonthlyPage==='function')renderMonthlyPage();
    polishCurrentPage();
  }catch(_){}
})();
