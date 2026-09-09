/* RETRADE performance + Sales navigation pass v1.4.55
 *
 * Focused runtime fixes found during the chart/performance audit:
 * - memoize repeated sales-event range queries inside a render cycle/session
 * - invalidate memoized analytics whenever local/cloud data refreshes
 * - keep the Sales Yearly/Monthly sub-view stable across navigation/reloads
 * - make Yearly vs Monthly explicit with one compact segmented control
 * - add compact day/order separators to the date-sorted monthly sales list
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

  /* Local writes are the strongest invalidation signal. Cloud/sync refreshes
     also pass through refreshActivePage, so stale analytics do not survive a
     real data handoff. The short TTL is only a final safety net. */
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
  function safeCurrentMonth(){try{return typeof currentMonthKey==='function'?currentMonthKey():'';}catch(_){return '';}}
  function salesState(){
    var out={};
    try{out.view=MONTHLY_VIEW;}catch(_){}
    try{out.month=SELECTED_MONTH;}catch(_){}
    try{out.filter=MONTH_FILTER;}catch(_){}
    try{out.sort=MONTH_SORT;}catch(_){}
    try{out.period=MONTHLY_PERIOD;}catch(_){}
    return out;
  }
  function persistSalesState(){
    try{localStorage.setItem(SALES_STATE_KEY,JSON.stringify(salesState()));}catch(_){}
  }
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

  /* The production nav used to deliberately reset Sales to the current-month
     detail route on every tab click. That is why a remembered Yearly/Monthly
     view could appear to fight with navigation. Preserve the current sub-route
     instead; explicit month/calendar actions still set their own context. */
  try{
    if(typeof goToTab==='function'){
      var nativeGoToTab=goToTab;
      goToTab=function(name,sourceEl){
        if(name!=='monthly')return nativeGoToTab.apply(this,arguments);
        var contextual=false;try{contextual=!!_monthOpenFromContext;}catch(_){}
        if(contextual)return nativeGoToTab.apply(this,arguments);
        var prior=false;try{prior=_monthOpenFromContext;_monthOpenFromContext=true;}catch(_){}
        try{return nativeGoToTab.apply(this,arguments);}
        finally{try{_monthOpenFromContext=prior;}catch(_){}persistSalesState();}
      };
    }
  }catch(_){}

  function installStyles(){
    if(document.getElementById('rt-performance-system-css'))return;
    var s=document.createElement('style');s.id='rt-performance-system-css';
    s.textContent='\
#p-monthly .rt-sales-mode-switch{display:flex;align-items:center;width:max-content;max-width:100%;gap:2px;padding:3px;margin:0 0 11px 0;border:1px solid var(--border);border-radius:10px;background:var(--surface2);box-shadow:0 1px 0 rgba(0,0,0,.03)}\
#p-monthly .rt-sales-mode-btn{appearance:none;border:0;background:transparent;color:var(--text-secondary);font:inherit;font-size:11.5px;font-weight:720;line-height:1;padding:7px 13px;border-radius:7px;cursor:pointer;transition:background-color 140ms ease-out,color 140ms ease-out,box-shadow 140ms ease-out}\
#p-monthly .rt-sales-mode-btn.on{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.12)}\
#p-monthly .rt-sales-mode-btn:focus-visible{outline:2px solid var(--accent);outline-offset:1px}\
#month-list .rt-sales-day{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:27px;padding:5px 13px 4px;border-top:1px solid color-mix(in srgb,var(--border) 82%,transparent);border-bottom:1px solid color-mix(in srgb,var(--border) 62%,transparent);background:color-mix(in srgb,var(--surface2) 88%,var(--bg));color:var(--text-secondary);font-size:10.5px;line-height:1.2;font-weight:730;letter-spacing:.015em}\
#month-list .rt-sales-day:first-child{border-top:0}\
#month-list .rt-sales-day-count{color:var(--muted);font-size:9.8px;font-weight:650;white-space:nowrap}\
@media(max-width:639px){#p-monthly .rt-sales-mode-switch{margin-bottom:9px}#p-monthly .rt-sales-mode-btn{padding:7px 12px;font-size:11px}#month-list .rt-sales-day{padding-left:11px;padding-right:11px}}\
@media(prefers-reduced-motion:reduce){#p-monthly .rt-sales-mode-btn{transition:none}}';
    document.head.appendChild(s);
  }
  installStyles();

  function currentView(){try{return MONTHLY_VIEW==='detail'?'detail':'grid';}catch(_){return 'grid';}}
  function ensureSalesSwitcher(){
    var page=document.getElementById('p-monthly');if(!page)return;
    var old=page.querySelector('.rt-sales-mode-switch');if(old)old.remove();
    var v=currentView(),wrap=document.createElement('div');wrap.className='rt-sales-mode-switch';wrap.setAttribute('role','tablist');wrap.setAttribute('aria-label','Sales view');
    wrap.innerHTML='<button class="rt-sales-mode-btn '+(v==='grid'?'on':'')+'" type="button" role="tab" aria-selected="'+(v==='grid'?'true':'false')+'" onclick="rtSetSalesView(\'grid\')">Yearly</button><button class="rt-sales-mode-btn '+(v==='detail'?'on':'')+'" type="button" role="tab" aria-selected="'+(v==='detail'?'true':'false')+'" onclick="rtSetSalesView(\'detail\')">Monthly</button>';
    page.insertBefore(wrap,page.firstChild);
  }

  window.rtSetSalesView=function(view){
    view=view==='detail'?'detail':'grid';
    try{MONTHLY_VIEW=view;}catch(_){}
    if(view==='detail'){
      try{if(!SELECTED_MONTH)SELECTED_MONTH=safeCurrentMonth();}catch(_){}
    }
    persistSalesState();
    try{if(typeof _saveUIState==='function')_saveUIState();}catch(_){}
    try{
      if(view==='grid'&&typeof renderMonthlyGrid==='function')return renderMonthlyGrid();
      if(view==='detail'&&typeof renderMonth==='function')return renderMonth();
    }catch(_){}
  };

  try{
    if(typeof renderMonth==='function'){
      var nativeRenderMonth=renderMonth;
      renderMonth=function(){var out=nativeRenderMonth.apply(this,arguments);persistSalesState();ensureSalesSwitcher();return out;};
    }
    if(typeof renderMonthlyGrid==='function'){
      var nativeRenderMonthlyGrid=renderMonthlyGrid;
      renderMonthlyGrid=function(){var out=nativeRenderMonthlyGrid.apply(this,arguments);persistSalesState();ensureSalesSwitcher();return out;};
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

  /* Date-sold is the browsing workflow. Split only into consecutive day groups,
     preserving the existing event order and bundle grouping exactly. */
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

  /* If app-core already painted the Sales page before this late optimisation
     layer loaded, correct the remembered sub-view once before chart motion starts. */
  try{
    var active=document.querySelector('.page.on');
    if(restoredSalesState&&active&&active.id==='p-monthly'&&typeof renderMonthlyPage==='function'){
      renderMonthlyPage();
    }else if(active&&active.id==='p-monthly')ensureSalesSwitcher();
  }catch(_){}
})();
