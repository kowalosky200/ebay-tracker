/* RETRADE chart spacing + loader handoff reveal v1.4.49
 * Loaded after chart-finalize.js.
 *
 * Presentation-only responsibilities:
 * - keep true breathing room between 30-day daily columns
 * - hold dashboard motion while the real-layout loader is genuinely active
 * - replay the canonical dashboard motion exactly once AFTER the skeleton ->
 *   real-layout handoff, rather than accidentally consuming that replay early
 * - de-duplicate only real post-loading replays
 *
 * Sales line-chart motion is owned exclusively by chart-line-motion.js.
 * No accounting, sync, inventory lifecycle or persisted data logic is touched.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function clock(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function periodKey(){
    try{if(typeof SUMMARY_PERIOD!=='undefined')return String(SUMMARY_PERIOD||'').toLowerCase();}catch(_){}
    return '';
  }
  function selectedSummaryText(){
    var el=document.getElementById('summary-period-select')||document.querySelector('#p-summary select.period-select-inline,#p-summary select');
    if(!el)return '';
    try{return String(el.options[el.selectedIndex].text||'').toLowerCase();}catch(_){return '';}
  }
  function isLast30Days(){
    var p=periodKey().replace(/[\s_-]+/g,'');
    if(p==='30d'||p==='30days'||p==='last30d'||p==='last30days')return true;
    return /last\s+30\s+days/.test(selectedSummaryText());
  }
  function isDashboardBars(opts){
    return !!(opts&&opts.primaryBars&&opts.secondaryBarsInPrimary&&opts.primaryLabel==='Gross Revenue'&&opts.secondaryLabel==='Gross Profit');
  }
  function summaryPage(){return document.getElementById('p-summary');}
  function summaryIsActive(){var p=summaryPage();return !!(p&&p.classList.contains('on'));}
  function loadingHandoffActive(){
    try{if(typeof _realLayoutLoading!=='undefined'&&_realLayoutLoading)return true;}catch(_){}
    var body=document.body;
    if(body&&body.classList.contains('rt-data-loading-active'))return true;
    var page=summaryPage();
    if(page&&(page.getAttribute('aria-busy')==='true'||page.classList.contains('rt-loading')))return true;
    return false;
  }

  function installStyles(){
    ['rt-chart-reveal-v1445','rt-chart-reveal-v1448','rt-chart-reveal-v1449'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-chart-reveal-v1449';
    s.textContent='\
#p-summary svg.rt-daily-gap-bars .rt-chart-primary-bar:not(.rt-chart-profit-bar){stroke-width:.48!important;stroke-opacity:.46!important;}\
#p-summary svg.rt-daily-gap-bars .rt-chart-profit-bar{stroke-width:.36!important;stroke-opacity:.40!important;}\
';
    document.head.appendChild(s);
  }
  installStyles();

  function centerResize(rect,targetWidth){
    if(!rect||!isFinite(targetWidth)||targetWidth<=0)return;
    var w=num(rect.getAttribute('width')),x=num(rect.getAttribute('x'));
    if(w<=0)return;
    var nw=Math.min(w,targetWidth);
    if(Math.abs(nw-w)<.05)return;
    rect.setAttribute('x',(x+(w-nw)/2).toFixed(2));
    rect.setAttribute('width',nw.toFixed(2));
    var rx=num(rect.getAttribute('rx'));
    if(rx>0)rect.setAttribute('rx',Math.min(rx,nw*.18).toFixed(2));
  }
  function median(values){
    values=values.filter(function(v){return isFinite(v)&&v>0;}).sort(function(a,b){return a-b;});
    if(!values.length)return 0;
    var m=Math.floor(values.length/2);
    return values.length%2?values[m]:(values[m-1]+values[m])/2;
  }
  function enforceThirtyDayGaps(svgEl,labels){
    if(!svgEl)return;
    var active=isLast30Days()&&labels&&labels.length>=24;
    svgEl.classList.toggle('rt-daily-gap-bars',!!active);
    if(!active)return;

    var revenue=Array.prototype.slice.call(svgEl.querySelectorAll('.rt-chart-primary-bar:not(.rt-chart-profit-bar):not(.rt-chart-forecast-shell)'));
    if(revenue.length<2)return;
    revenue.sort(function(a,b){
      return (num(a.getAttribute('x'))+num(a.getAttribute('width'))/2)-(num(b.getAttribute('x'))+num(b.getAttribute('width'))/2);
    });
    var centres=revenue.map(function(r){return num(r.getAttribute('x'))+num(r.getAttribute('width'))/2;});
    var gaps=[];for(var i=1;i<centres.length;i++)gaps.push(centres[i]-centres[i-1]);
    var band=median(gaps);if(!band)return;
    var revenueWidth=Math.max(4.8,band*.67);
    var profitWidth=Math.max(3.0,revenueWidth*.56);
    revenue.forEach(function(rect){centerResize(rect,revenueWidth);});
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-profit-bar:not(.rt-chart-forecast-shell)'),function(rect){centerResize(rect,profitWidth);});
  }

  var nativeReplay=null;
  var pendingDashboardReplay=false;
  var replayQueued=false;
  var lastReplayAt=-Infinity;
  var handoffSerial=0;
  var wasLoading=loadingHandoffActive();

  function fallbackReplay(){
    var svgs=[document.getElementById('summary-chart-svg'),document.getElementById('summary-chart-svg-mobile')].filter(Boolean);
    if(!svgs.length)return;
    svgs.forEach(function(svg){svg.classList.remove('rt-chart-draw');});
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      if(loadingHandoffActive()||!summaryIsActive())return;
      svgs.forEach(function(svg){if(svg.isConnected)svg.classList.add('rt-chart-draw');});
    });});
  }

  function performReplay(page,args){
    page=page||summaryPage();
    if(!page||page.id!=='p-summary')return nativeReplay?nativeReplay.apply(window,args||[]):undefined;
    if(loadingHandoffActive()||!summaryIsActive()){
      pendingDashboardReplay=true;
      return;
    }
    var t=clock();
    /* Only de-dupe a replay that really happened after loading. The old code
       stamped lastReplayAt even for an early/hidden call, then suppressed the
       actual skeleton handoff for 2.2 seconds — leaving a fully settled chart. */
    if(t-lastReplayAt<450)return;
    lastReplayAt=t;
    pendingDashboardReplay=false;
    if(nativeReplay)return nativeReplay.apply(window,args&&args.length?args:[page]);
    return fallbackReplay();
  }

  function queueReplay(){
    if(replayQueued||loadingHandoffActive())return;
    if(!summaryIsActive()){pendingDashboardReplay=true;return;}
    replayQueued=true;
    var token=++handoffSerial;
    /* Two paint frames let the real responsive layout replace its skeleton before
       the canonical motion classes are re-armed. No arbitrary UX delay. */
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      replayQueued=false;
      if(token!==handoffSerial)return;
      if(loadingHandoffActive()){pendingDashboardReplay=true;return;}
      performReplay(summaryPage(),[summaryPage()]);
    });});
  }

  try{
    if(typeof _replayDashboardMotionAfterLoading==='function'){
      nativeReplay=_replayDashboardMotionAfterLoading;
      _replayDashboardMotionAfterLoading=function(page){
        if(page&&page.id==='p-summary')return performReplay(page,arguments);
        return nativeReplay.apply(this,arguments);
      };
    }
  }catch(_){}

  function checkHandoff(){
    var loading=loadingHandoffActive();
    if(loading){wasLoading=true;return;}
    if(wasLoading){
      wasLoading=false;
      pendingDashboardReplay=true;
    }
    if(pendingDashboardReplay)queueReplay();
  }

  /* Observe only the two state owners involved in the loader handoff. This is
     attribute-only and non-subtree, so SVG animation style writes never wake it. */
  try{
    var body=document.body,page=summaryPage();
    var handoffObserver=new MutationObserver(checkHandoff);
    if(body)handoffObserver.observe(body,{attributes:true,attributeFilter:['class']});
    if(page)handoffObserver.observe(page,{attributes:true,attributeFilter:['class','aria-busy']});
  }catch(_){}

  var _renderBeforeReveal=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=_renderBeforeReveal.apply(this,arguments);
    if(isDashboardBars(opts)){
      enforceThirtyDayGaps(svgEl,labels);
      if(loadingHandoffActive()){
        /* Real data can render behind the loader, but its motion must not be spent
           there. Hold it at rest and mark one real-layout replay as pending. */
        svgEl.classList.remove('rt-chart-draw');
        pendingDashboardReplay=true;
        wasLoading=true;
      }else if(pendingDashboardReplay){
        queueReplay();
      }
    }
    return out;
  };

  /* If this layer arrives while the real-layout loader is already active, retain
     that fact even if no chart render happens before the class is removed. */
  if(wasLoading)pendingDashboardReplay=true;
  requestAnimationFrame(checkHandoff);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkHandoff();});

  window.__RT_DASHBOARD_REVEAL={
    build:'20260908-dashboard-reveal-2',
    pending:function(){return pendingDashboardReplay;},
    check:checkHandoff
  };
})();
