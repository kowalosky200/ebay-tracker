/* RETRADE chart spacing + single-handoff reveal v1.4.48
 * Loaded after chart-finalize.js.
 *
 * Presentation-only responsibilities:
 * - keep true breathing room between 30-day daily columns
 * - prevent dashboard chart motion from starting while the real-layout loader is
 *   still handing off, so the post-loading replay happens exactly once
 * - de-duplicate any near-simultaneous dashboard handoff replay calls
 *
 * Sales line-chart motion is owned exclusively by chart-line-motion.js.
 * No accounting, sync, inventory lifecycle or persisted-data logic is touched.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
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
  function loadingHandoffActive(){
    try{if(typeof _realLayoutLoading!=='undefined'&&_realLayoutLoading)return true;}catch(_){}
    var body=document.body;
    if(body&&body.classList.contains('rt-data-loading-active'))return true;
    var page=document.getElementById('p-summary');
    if(page&&(page.getAttribute('aria-busy')==='true'||page.classList.contains('rt-loading')))return true;
    return false;
  }

  function installStyles(){
    ['rt-chart-reveal-v1445','rt-chart-reveal-v1448'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-chart-reveal-v1448';
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

  /* app-core already owns the loader -> dashboard reveal. Earlier presentation
     layers also replayed it, which could visibly grow the bars twice. Keep one
     owner and throttle accidental duplicate finish callbacks from the loader. */
  try{
    if(typeof _replayDashboardMotionAfterLoading==='function'){
      var nativeReplay=_replayDashboardMotionAfterLoading;
      var lastReplayAt=-Infinity;
      _replayDashboardMotionAfterLoading=function(page){
        var now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
        if(page&&page.id==='p-summary'&&now-lastReplayAt<2200)return;
        if(page&&page.id==='p-summary')lastReplayAt=now;
        return nativeReplay.apply(this,arguments);
      };
    }
  }catch(_){}

  var _renderBeforeReveal=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=_renderBeforeReveal.apply(this,arguments);
    if(isDashboardBars(opts)){
      enforceThirtyDayGaps(svgEl,labels);
      /* A render that happens under the loading surface must stay at rest. The
         canonical app-core handoff starts rt-chart-draw after the loader fades. */
      if(loadingHandoffActive())svgEl.classList.remove('rt-chart-draw');
    }
    return out;
  };
})();
