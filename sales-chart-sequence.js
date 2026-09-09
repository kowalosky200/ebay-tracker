/* RETRADE Sales yearly chart sequence v2.0 (v1.4.61)
 *
 * Single owner for the Sales yearly-chart animation.
 *
 * The static chart/forecast maths are still produced by app-core + chart-motion.
 * This layer owns ONLY the presentation sequence:
 *   1. hide historical points and all current-month forecast geometry
 *   2. draw the two historical lines continuously from left to right
 *   3. reveal each month's points exactly when the line reaches that month
 *   4. pause briefly at the latest completed month
 *   5. reveal the current-month forecast one physical dash at a time
 *   6. reveal the hollow forecast destination points last
 *
 * Replaces the previous sales-forecast-gate.js + chart-line-motion.js stack.
 * There is no subtree MutationObserver and no second animation loop competing
 * with the renderer. Incidental same-data re-renders inherit the active clock.
 *
 * No accounting, forecast calculation, sync, lifecycle or persisted data.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function'){
    document.documentElement.classList.remove('rt-motion-prep');
    return;
  }

  var START_DELAY=70;
  var MONTH_MS=225;
  var HISTORY_MIN=1050;
  var HISTORY_MAX=2350;
  var FORECAST_GAP=145;
  var FORECAST_DASH_MS=78;
  var FORECAST_MIN=620;
  var FORECAST_MAX=1320;
  var ENDPOINT_GAP=95;
  var ENDPOINT_MS=190;
  var session=null;
  var serial=0;

  window.__rtSalesChartSequence=window.__rtSalesChartSequence||{};
  var diag=window.__rtSalesChartSequence;
  diag.version='2.0';

  function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
  function clamp(v){return Math.max(0,Math.min(1,v));}
  function reduced(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function isSales(svg,opts){
    return !!(svg&&svg.id==='monthly-profitability-svg'&&opts&&opts.primaryLabel==='Net Revenue'&&opts.secondaryLabel==='Net Profit');
  }
  function visible(svg){
    if(!svg||!svg.isConnected)return false;
    var r;try{r=svg.getBoundingClientRect();}catch(_){r=null;}
    return !!(r&&r.width>80&&r.height>80);
  }
  function keyFor(labels,rev,profit,opts){
    var p='';try{p=String(typeof MONTHLY_PERIOD!=='undefined'?MONTHLY_PERIOD:'');}catch(_){}
    var r=(rev||[]).map(function(v){return Math.round((Number(v)||0)*100)/100;});
    var g=(profit||[]).map(function(v){return Math.round((Number(v)||0)*100)/100;});
    return [p,(opts&&opts.partialLast)?'partial':'full',(labels||[]).join(','),r.join(','),g.join(',')].join('|');
  }
  function parsePathPoints(path){
    var d=String(path&&path.getAttribute('d')||'');
    var nums=d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/ig)||[];
    var pts=[];
    for(var i=0;i+1<nums.length;i+=2){
      var x=Number(nums[i]),y=Number(nums[i+1]);
      if(isFinite(x)&&isFinite(y))pts.push({x:x,y:y});
    }
    return pts;
  }
  function pathMilestones(path){
    var pts=parsePathPoints(path),cum=[0],total=0;
    for(var i=1;i<pts.length;i++){
      var dx=pts[i].x-pts[i-1].x,dy=pts[i].y-pts[i-1].y;
      total+=Math.sqrt(dx*dx+dy*dy);cum.push(total);
    }
    if(total<=0){try{total=path.getTotalLength()||0;}catch(_){total=0;}}
    return {path:path,points:pts,milestones:cum,total:total};
  }
  function allHistoricalPaths(svg){
    return Array.prototype.slice.call(svg.querySelectorAll('path.rt-chart-line:not(.rt-chart-tertiary-line)')).filter(function(p){
      return !!p.getAttribute('d')&&parsePathPoints(p).length>1;
    });
  }
  function chartColumns(svg){
    return Array.prototype.slice.call(svg.querySelectorAll('.rt-chart-col[data-idx]')).sort(function(a,b){
      return (Number(a.getAttribute('data-idx'))||0)-(Number(b.getAttribute('data-idx'))||0);
    });
  }

  function installStyles(){
    ['rt-sales-sequence-v2-css','rt-sales-forecast-hard-gate-css','rt-line-motion-v1455'].forEach(function(id){var n=document.getElementById(id);if(n)n.remove();});
    var s=document.createElement('style');s.id='rt-sales-sequence-v2-css';
    s.textContent='\
#p-monthly #monthly-profitability-svg.rt-sales-sequence{--rt-sales-point-ms:150ms}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-history-point{opacity:0!important;transform:scale(.70)!important;transform-box:fill-box;transform-origin:center;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-history-point.rt-sales-point-on{opacity:1!important;transform:scale(1)!important;transition:opacity var(--rt-sales-point-ms) ease-out,transform var(--rt-sales-point-ms) cubic-bezier(.22,.61,.36,1)!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-group{visibility:hidden!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-forecast-stage .rt-chart-partial-group{visibility:visible!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dash{opacity:0!important;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dash.rt-sales-dash-on{opacity:1!important;transition:opacity 90ms ease-out!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dot{opacity:0!important;visibility:hidden!important;animation:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-ring{opacity:0!important;visibility:hidden!important;transform:scale(.72)!important;transform-box:fill-box;transform-origin:center;animation:none!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-endpoint-stage .rt-sales-forecast-ring{opacity:.98!important;visibility:visible!important;transform:scale(1)!important;transition:opacity '+ENDPOINT_MS+'ms ease-out,transform '+ENDPOINT_MS+'ms cubic-bezier(.22,.72,.28,1)!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-so-far{opacity:0!important;transition:none!important}\
#p-monthly #monthly-profitability-svg.rt-sales-sequence.rt-sales-forecast-stage .rt-chart-so-far{opacity:.72!important;transition:opacity 160ms ease-out!important}\
/* Retire the older independent actual/forecast point animations from chart-motion. */\
#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-actual-dot,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-label,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-range-label{animation:none!important}\
@media(prefers-reduced-motion:reduce){\
 #p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-history-point,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dash,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-sales-forecast-ring,#p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-dot{opacity:1!important;visibility:visible!important;transform:none!important;transition:none!important}\
 #p-monthly #monthly-profitability-svg.rt-sales-sequence .rt-chart-partial-group{visibility:visible!important}\
}\
';
    document.head.appendChild(s);
  }
  installStyles();

  function cancel(s){
    if(!s)return;s.cancelled=true;
    if(s.raf){try{cancelAnimationFrame(s.raf);}catch(_){}s.raf=0;}
  }
  function cleanInline(st){
    (st.paths||[]).forEach(function(p){
      if(!p.path||!p.path.isConnected)return;
      p.path.style.removeProperty('stroke-dasharray');p.path.style.removeProperty('stroke-dashoffset');
    });
  }
  function revealHistoryPoint(st,index){
    var col=st.historyColumns[index];if(!col)return;
    Array.prototype.forEach.call(col.querySelectorAll('circle.rt-sales-history-point'),function(c){c.classList.add('rt-sales-point-on');});
  }
  function revealAllHistoryPoints(st){for(var i=0;i<st.historyColumns.length;i++)revealHistoryPoint(st,i);}
  function revealForecastDashes(st,count){
    st.partialGroups.forEach(function(group){
      var dashes=group.dashes,n=dashes.length;
      if(!n)return;
      var target=Math.min(n,Math.ceil((count/Math.max(1,st.forecastSteps))*n));
      for(var i=0;i<target;i++)dashes[i].classList.add('rt-sales-dash-on');
    });
  }
  function settle(st){
    if(!st||!st.svg)return;
    cleanInline(st);revealAllHistoryPoints(st);revealForecastDashes(st,st.forecastSteps);
    st.svg.classList.add('rt-sales-forecast-stage','rt-sales-endpoint-stage','rt-sales-sequence-complete');
    st.svg.classList.remove('rt-sales-history-stage');
    /* The renderer-owned hollow last-column dots duplicate the cleaner overlay
       forecast rings when that layer exists. Keep duplicates suppressed. */
    var rings=st.svg.querySelectorAll('.rt-sales-forecast-ring');
    if(!rings.length){Array.prototype.forEach.call(st.svg.querySelectorAll('.rt-chart-partial-dot'),function(d){d.style.visibility='visible';d.style.opacity='1';});}
  }

  function prepare(svg,s,key){
    if(!svg)return null;
    var columns=chartColumns(svg),partialGroups=Array.prototype.slice.call(svg.querySelectorAll('.rt-chart-partial-group'));
    var partial=partialGroups.length>0;
    var historyColumns=partial&&columns.length>1?columns.slice(0,-1):columns.slice();
    var paths=allHistoricalPaths(svg).map(pathMilestones).filter(function(p){return p.total>0&&p.milestones.length>1;});
    var pointCount=historyColumns.length;
    var segmentCount=Math.max(1,pointCount-1);
    paths.forEach(function(p){segmentCount=Math.min(segmentCount,Math.max(1,p.milestones.length-1));});
    var historyMs=Math.max(HISTORY_MIN,Math.min(HISTORY_MAX,segmentCount*MONTH_MS));

    svg.classList.add('rt-sales-sequence','rt-sales-history-stage');
    svg.classList.remove('rt-sales-forecast-stage','rt-sales-endpoint-stage','rt-sales-sequence-complete');

    columns.forEach(function(col,idx){
      Array.prototype.forEach.call(col.querySelectorAll('circle'),function(c){
        c.classList.remove('rt-sales-history-point','rt-sales-point-on');
        if(idx<historyColumns.length&&!c.classList.contains('rt-chart-partial-dot'))c.classList.add('rt-sales-history-point');
      });
    });
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-chart-partial-dash'),function(d){d.classList.remove('rt-sales-dash-on');});

    paths.forEach(function(p){
      p.path.style.strokeDasharray=p.total.toFixed(2)+'px '+p.total.toFixed(2)+'px';
      p.path.style.strokeDashoffset=p.total.toFixed(2)+'px';
      try{p.path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    });

    var groups=partialGroups.map(function(g){return {el:g,dashes:Array.prototype.slice.call(g.querySelectorAll('.rt-chart-partial-dash'))};});
    var forecastSteps=0;groups.forEach(function(g){forecastSteps=Math.max(forecastSteps,g.dashes.length);});
    var forecastMs=forecastSteps?Math.max(FORECAST_MIN,Math.min(FORECAST_MAX,forecastSteps*FORECAST_DASH_MS)):0;
    var forecastStart=START_DELAY+historyMs+FORECAST_GAP;
    var endpointStart=forecastStart+forecastMs+ENDPOINT_GAP;
    var completeAt=endpointStart+ENDPOINT_MS+80;
    var st={svg:svg,key:key,session:s,columns:columns,historyColumns:historyColumns,paths:paths,partialGroups:groups,segmentCount:segmentCount,historyMs:historyMs,forecastSteps:forecastSteps,forecastMs:forecastMs,forecastStart:forecastStart,endpointStart:endpointStart,completeAt:completeAt,lastPoint:-1,lastForecastStep:-1};
    svg.__rtSalesSequenceState=st;
    s.timing={historyMs:historyMs,forecastMs:forecastMs,completeAt:completeAt};
    diag.historyMs=historyMs;diag.forecastMs=forecastMs;diag.forecastSteps=forecastSteps;diag.points=pointCount;
    return st;
  }

  function historyCursor(st,elapsed){
    if(elapsed<=START_DELAY)return 0;
    return clamp((elapsed-START_DELAY)/Math.max(1,st.historyMs))*st.segmentCount;
  }
  function updateHistory(st,elapsed){
    var cursor=historyCursor(st,elapsed);
    var seg=Math.min(st.segmentCount-1,Math.floor(cursor));
    var local=Math.max(0,Math.min(1,cursor-seg));
    if(cursor>=st.segmentCount){seg=st.segmentCount-1;local=1;}

    st.paths.forEach(function(p){
      if(!p.path||!p.path.isConnected)return;
      var maxSeg=Math.min(st.segmentCount,p.milestones.length-1);
      var localCursor=Math.min(maxSeg,cursor),i=Math.min(maxSeg-1,Math.floor(localCursor)),q=Math.max(0,Math.min(1,localCursor-i));
      if(localCursor>=maxSeg){i=maxSeg-1;q=1;}
      var a=p.milestones[i]||0,b=p.milestones[i+1]!=null?p.milestones[i+1]:p.total;
      var shown=a+(b-a)*q;
      p.path.style.strokeDashoffset=Math.max(0,p.total-shown).toFixed(2)+'px';
    });

    var arrived=Math.min(st.historyColumns.length-1,Math.floor(cursor+0.015));
    if(elapsed>=START_DELAY&&arrived>st.lastPoint){
      for(var j=st.lastPoint+1;j<=arrived;j++)revealHistoryPoint(st,j);
      st.lastPoint=arrived;
    }
    if(cursor>=st.segmentCount){cleanInline(st);revealAllHistoryPoints(st);st.lastPoint=st.historyColumns.length-1;}
  }
  function updateForecast(st,elapsed){
    if(!st.forecastSteps)return;
    if(elapsed<st.forecastStart)return;
    if(!st.svg.classList.contains('rt-sales-forecast-stage')){
      st.svg.classList.remove('rt-sales-history-stage');st.svg.classList.add('rt-sales-forecast-stage');
    }
    var q=clamp((elapsed-st.forecastStart)/Math.max(1,st.forecastMs));
    var step=Math.min(st.forecastSteps,Math.floor(q*st.forecastSteps));
    if(q>=1)step=st.forecastSteps;
    if(step!==st.lastForecastStep){revealForecastDashes(st,step);st.lastForecastStep=step;}
    if(elapsed>=st.endpointStart)st.svg.classList.add('rt-sales-endpoint-stage');
  }
  function apply(st,elapsed){
    updateHistory(st,elapsed);updateForecast(st,elapsed);
    if(elapsed>=st.completeAt)settle(st);
  }

  function frame(s,ts){
    if(!s||s.cancelled||s!==session)return;
    var svg=document.getElementById('monthly-profitability-svg');
    if(!svg||!svg.isConnected||!visible(svg)){
      s.raf=requestAnimationFrame(function(t){frame(s,t);});return;
    }
    var st=svg.__rtSalesSequenceState;
    if(!st||st.session!==s)st=prepare(svg,s,s.key);
    var elapsed=Math.max(0,ts-s.startedAt);apply(st,elapsed);
    if(elapsed>=st.completeAt){s.completed=true;s.raf=0;return;}
    s.raf=requestAnimationFrame(function(t){frame(s,t);});
  }
  function start(s){
    if(!s||s.cancelled||s.completed||s.startedAt!=null||s!==session)return;
    var svg=document.getElementById('monthly-profitability-svg');
    if(!svg||!visible(svg))return;
    if(reduced()){
      var rs=svg.__rtSalesSequenceState||prepare(svg,s,s.key);settle(rs);s.completed=true;return;
    }
    s.startedAt=now();diag.startedAt=s.startedAt;
    s.raf=requestAnimationFrame(function(t){frame(s,t);});
  }
  function scheduleStart(s){
    if(!s||s.cancelled||s.completed||s.startedAt!=null||s!==session)return;
    requestAnimationFrame(function(){requestAnimationFrame(function(){start(s);});});
  }
  function begin(svg,key){
    if(session&&session.key===key){
      var existing=svg.__rtSalesSequenceState;
      if(session.completed){existing=prepare(svg,session,key);settle(existing);return;}
      var elapsed=session.startedAt==null?0:Math.max(0,now()-session.startedAt);
      var live=prepare(svg,session,key);apply(live,elapsed);if(session.startedAt==null)scheduleStart(session);return;
    }
    cancel(session);
    session={id:++serial,key:key,startedAt:null,completed:false,cancelled:false,raf:0,timing:null};
    prepare(svg,session,key);scheduleStart(session);
  }

  var before=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=before.apply(this,arguments);
    if(isSales(svgEl,opts))begin(svgEl,keyFor(labels,revData,profitData,opts));
    return out;
  };

  /* The first Sales chart can exist before this late presentation layer loads. */
  try{
    var existing=document.getElementById('monthly-profitability-svg');
    if(existing&&existing.querySelector('path.rt-chart-line')){
      var cols=chartColumns(existing),labelKey=cols.map(function(c){return c.getAttribute('data-idx')||'';}).join(',');
      begin(existing,'existing|'+labelKey+'|'+String(existing.innerHTML.length));
    }
  }catch(_){}

  /* Synchronous arming is complete. The chart can now paint in its prepared
     state rather than flashing fully drawn and rewinding. */
  requestAnimationFrame(function(){document.documentElement.classList.remove('rt-motion-prep');});
})();
