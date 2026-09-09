/* RETRADE yearly Sales line-motion refinement v1.4.56
 * Loaded after chart-reveal.js.
 *
 * One animation owner for the Yearly Sales line:
 * - historical lines travel month-by-month with a calm stop-to-stop cadence
 * - forecast geometry is physically hidden until history is complete
 * - the final current-month projection then reveals dash-by-dash
 * - Revenue + Profit forecast continuations advance together
 * - deliberate Yearly re-entry can replay; incidental data re-renders do not
 *
 * No accounting, forecast maths, sync or persisted data is touched.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  var NS='http://www.w3.org/2000/svg';
  var SETTLE_MS=120;
  var HISTORY_DELAY=55;
  var SEGMENT_MS=205;
  var HISTORY_MIN=1050;
  var HISTORY_MAX=2300;
  var FORECAST_GAP=135;
  var FORECAST_STEP_MS=100;
  var FORECAST_MIN=900;
  var FORECAST_MAX=1700;
  var RING_GAP=80;
  var RING_MS=230;
  var activeSession=null;
  var maskSerial=0;
  var sessionSerial=0;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function clamp(v){return Math.max(0,Math.min(1,v));}
  function clampN(min,v,max){return Math.max(min,Math.min(max,v));}
  function now(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function isVisible(el){
    if(!el||!el.isConnected)return false;
    var cs;try{cs=getComputedStyle(el);}catch(_){cs=null;}
    if(cs&&(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0))return false;
    var r;try{r=el.getBoundingClientRect();}catch(_){r=null;}
    return !!(r&&r.width>80&&r.height>80);
  }
  function isSalesChart(svgEl,opts){
    return !!(svgEl&&svgEl.id==='monthly-profitability-svg'&&opts&&opts.primaryLabel==='Net Revenue'&&opts.secondaryLabel==='Net Profit');
  }
  function salesPeriodKey(){
    var key='';
    try{if(typeof MONTHLY_PERIOD!=='undefined')key=String(MONTHLY_PERIOD||'');}catch(_){}
    var sel=document.querySelector('#p-monthly select.period-select-inline,#p-monthly select');
    if(sel){try{key+='|'+String(sel.value||'')+'|'+String(sel.options[sel.selectedIndex].text||'');}catch(_){} }
    key+='|replay:'+String(window.__rtSalesMotionReplayToken||0);
    return key||'sales-default';
  }

  function installStyles(){
    ['rt-line-motion-v1446','rt-line-motion-v1447','rt-line-motion-v1448','rt-line-motion-v1451','rt-line-motion-v1455','rt-line-motion-v1456'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-line-motion-v1456';
    s.textContent='\
#p-monthly svg.rt-refined-sales-motion path.rt-refined-history-line,\
#p-monthly svg.rt-refined-sales-motion path.rt-refined-forecast-line{animation:none!important;}\
#p-monthly svg.rt-refined-sales-motion .rt-sales-forecast-ring,\
#p-monthly svg.rt-refined-sales-motion circle.rt-refined-series-point{animation:none!important;}\
#p-monthly #monthly-profitability-svg{will-change:opacity;}\
@media(prefers-reduced-motion:reduce){#p-monthly #monthly-profitability-svg{opacity:1!important;}}';
    document.head.appendChild(s);
  }
  installStyles();

  function pathLength(path){
    try{var len=path.getTotalLength();return isFinite(len)?len:0;}catch(_){return 0;}
  }
  function strokeValue(path){
    var s=path.getAttribute('stroke');if(s&&s!=='none')return s;
    try{s=getComputedStyle(path).stroke;}catch(_){}
    return s||'none';
  }
  function dashValue(path){
    var d=String(path.getAttribute('stroke-dasharray')||'').trim();
    if(!d||d==='none'){try{d=String(getComputedStyle(path).strokeDasharray||'').trim();}catch(_){} }
    return d;
  }
  function dashCycle(path){
    var vals=(dashValue(path).match(/[0-9]*\.?[0-9]+/g)||[]).map(Number).filter(function(v){return isFinite(v)&&v>0;});
    if(!vals.length)return 8;
    if(vals.length%2===1)vals=vals.concat(vals);
    return Math.max(3,vals.reduce(function(a,b){return a+b;},0));
  }
  function isDashed(path){
    var d=dashValue(path);return !!(d&&d!=='none'&&d!=='0px'&&d!=='0'&&!/^none$/i.test(d));
  }
  function isForecastPath(path){
    if(!path)return false;
    var cls=String(path.getAttribute('class')||'');
    return isDashed(path)||/forecast|projection|partial/i.test(cls);
  }
  function isSeriesPath(path){
    if(!path||path.closest('defs'))return false;
    var cls=String(path.getAttribute('class')||'');
    if(/scrub|axis|grid|hit|hover|area/i.test(cls))return false;
    if(!path.getAttribute('d')||strokeValue(path)==='none')return false;
    var fill=String(path.getAttribute('fill')||'').trim();
    return !(fill&&fill!=='none'&&fill!=='transparent');
  }
  function ensureDefs(svg){
    var defs=svg.querySelector('defs');if(!defs){defs=document.createElementNS(NS,'defs');svg.insertBefore(defs,svg.firstChild);}return defs;
  }
  function clearPriorMasks(svg){
    Array.prototype.forEach.call(svg.querySelectorAll('mask[data-rt-sales-forecast-mask="1"]'),function(m){m.remove();});
    Array.prototype.forEach.call(svg.querySelectorAll('path.rt-refined-forecast-line'),function(p){p.removeAttribute('mask');});
  }
  function cancelSession(session){
    if(!session)return;session.cancelled=true;
    if(session.startTimer){clearTimeout(session.startTimer);session.startTimer=0;}
    if(session.raf){try{cancelAnimationFrame(session.raf);}catch(_){}session.raf=0;}
  }
  function easeSegment(t){t=clamp(t);return t*t*(3-2*t);}
  function easeOut(t){return 1-Math.pow(1-clamp(t),2.35);}

  function prepareHistory(path){
    var len=pathLength(path);if(len<=14)return null;
    path.classList.add('rt-refined-history-line');
    try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    path.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';
    path.style.strokeDashoffset=len.toFixed(2)+'px';
    return {path:path,len:len,finished:false};
  }
  function finishHistory(st){
    if(!st||st.finished)return;st.finished=true;
    if(!st.path||!st.path.isConnected)return;
    st.path.style.strokeDashoffset='0px';
    st.path.style.removeProperty('stroke-dasharray');st.path.style.removeProperty('stroke-dashoffset');
  }

  function prepareForecast(svg,path){
    var len=pathLength(path);if(len<=14)return null;
    path.classList.add('rt-refined-forecast-line');
    try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    /* Do not rely on a zero-width mask alone for the pre-forecast phase. Some
       WebKit/SVG combinations can still paint the original dashed stroke for a
       frame. Visibility is the hard gate; it opens only when forecast motion starts. */
    path.style.visibility='hidden';
    path.style.opacity='0';
    var defs=ensureDefs(svg),mask=document.createElementNS(NS,'mask');
    var id='rt-sales-forecast-mask-'+Date.now()+'-'+(++maskSerial),vb=svg.viewBox&&svg.viewBox.baseVal;
    var W=vb&&vb.width?vb.width:num(svg.getAttribute('width'))||800,H=vb&&vb.height?vb.height:num(svg.getAttribute('height'))||320;
    mask.setAttribute('id',id);mask.setAttribute('data-rt-sales-forecast-mask','1');mask.setAttribute('maskUnits','userSpaceOnUse');
    mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',String(W));mask.setAttribute('height',String(H));
    var wipe=document.createElementNS(NS,'path');wipe.setAttribute('d',path.getAttribute('d'));wipe.setAttribute('fill','none');wipe.setAttribute('stroke','white');
    var sw=num(path.getAttribute('stroke-width'));if(!sw){try{sw=parseFloat(getComputedStyle(path).strokeWidth)||2;}catch(_){sw=2;}}
    wipe.setAttribute('stroke-width',String(Math.max(5,sw*3.15)));wipe.setAttribute('stroke-linecap','butt');wipe.setAttribute('stroke-linejoin','round');
    wipe.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';wipe.style.strokeDashoffset=len.toFixed(2)+'px';
    mask.appendChild(wipe);defs.appendChild(mask);path.setAttribute('mask','url(#'+id+')');
    var steps=Math.max(5,Math.min(30,Math.round(len/dashCycle(path))));
    return {path:path,wipe:wipe,mask:mask,len:len,steps:steps,lastStep:-1,finished:false,opened:false};
  }
  function finishForecast(st){
    if(!st||st.finished)return;st.finished=true;
    if(st.path&&st.path.isConnected){st.path.style.removeProperty('visibility');st.path.style.removeProperty('opacity');st.path.removeAttribute('mask');}
    if(st.mask&&st.mask.isConnected)st.mask.remove();
  }

  function preparePoints(svg){
    var circles=Array.prototype.slice.call(svg.querySelectorAll('circle')).filter(function(c){
      var cls=String(c.getAttribute('class')||'');
      if(/forecast-ring|scrub|hover/i.test(cls))return false;
      return isFinite(num(c.getAttribute('cx')))&&isFinite(num(c.getAttribute('cy')));
    });
    var xs=circles.map(function(c){return num(c.getAttribute('cx'));}),minX=xs.length?Math.min.apply(Math,xs):0,maxX=xs.length?Math.max.apply(Math,xs):1,span=Math.max(1,maxX-minX);
    return circles.map(function(c){
      c.classList.add('rt-refined-series-point');try{c.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
      c.style.opacity='0';c.style.transform='scale(.78)';c.style.transformOrigin='center';c.style.transformBox='fill-box';
      return {el:c,progress:(num(c.getAttribute('cx'))-minX)/span,finished:false};
    });
  }
  function pointStages(points){
    var vals=(points||[]).map(function(p){return +num(p.progress).toFixed(4);}).sort(function(a,b){return a-b;}),out=[];
    vals.forEach(function(v){if(!out.length||Math.abs(v-out[out.length-1])>.008)out.push(v);});
    if(out.length<2)return [0,1];
    if(out[0]>.02)out.unshift(0);if(out[out.length-1]<.98)out.push(1);
    return out;
  }
  function prepareRings(svg){
    return Array.prototype.slice.call(svg.querySelectorAll('.rt-sales-forecast-ring')).map(function(r){
      try{r.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
      r.style.animation='none';r.style.opacity='0';r.style.transform='scale(.76)';r.style.transformOrigin='center';r.style.transformBox='fill-box';
      return {el:r,finished:false};
    });
  }
  function settlePoints(points){(points||[]).forEach(function(p){if(p.el&&p.el.isConnected){p.el.style.removeProperty('opacity');p.el.style.removeProperty('transform');}p.finished=true;});}
  function settleRings(rings){(rings||[]).forEach(function(r){if(r.el&&r.el.isConnected){r.el.style.removeProperty('opacity');r.el.style.removeProperty('transform');}r.finished=true;});}
  function settleFreshMarkup(svg){
    if(!svg)return;clearPriorMasks(svg);svg.classList.remove('rt-chart-draw');svg.classList.add('rt-refined-sales-motion','rt-motion-ready');
    Array.prototype.forEach.call(svg.querySelectorAll('path.rt-refined-history-line'),function(p){p.style.removeProperty('stroke-dasharray');p.style.removeProperty('stroke-dashoffset');});
    Array.prototype.forEach.call(svg.querySelectorAll('path.rt-refined-forecast-line'),function(p){p.style.removeProperty('visibility');p.style.removeProperty('opacity');});
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-sales-forecast-ring,circle.rt-refined-series-point'),function(el){el.style.removeProperty('opacity');el.style.removeProperty('transform');});
  }

  function timingFor(session,state){
    if(session.timing)return session.timing;
    var segments=Math.max(1,(state.stages||[]).length-1),historyMs=clampN(HISTORY_MIN,segments*SEGMENT_MS,HISTORY_MAX);
    var forecastSteps=5;state.forecast.forEach(function(f){forecastSteps=Math.max(forecastSteps,f.steps||0);});
    var forecastMs=clampN(FORECAST_MIN,forecastSteps*FORECAST_STEP_MS,FORECAST_MAX),forecastStart=HISTORY_DELAY+historyMs+FORECAST_GAP;
    var ringStart=forecastStart+forecastMs+RING_GAP;
    session.timing={segments:segments,historyMs:historyMs,forecastMs:forecastMs,forecastStart:forecastStart,ringStart:ringStart,completeAt:ringStart+RING_MS+100};
    return session.timing;
  }

  function prepare(svg,session,elapsed){
    if(!svg||!session)return null;clearPriorMasks(svg);svg.classList.remove('rt-chart-draw');svg.classList.add('rt-refined-sales-motion','rt-motion-ready');
    if(reducedMotion()){
      var reduced={session:session,history:[],forecast:[],points:[],rings:[],stages:[0,1]};svg.__rtRefinedSalesState=reduced;session.completed=true;settleFreshMarkup(svg);return reduced;
    }
    var paths=Array.prototype.slice.call(svg.querySelectorAll('path')).filter(isSeriesPath),history=[],forecast=[];
    paths.forEach(function(p){var projected=isForecastPath(p),st=projected?prepareForecast(svg,p):prepareHistory(p);if(st)(projected?forecast:history).push(st);});
    var points=preparePoints(svg),state={session:session,history:history,forecast:forecast,points:points,rings:prepareRings(svg),stages:pointStages(points)};
    svg.__rtRefinedSalesState=state;timingFor(session,state);
    if(session.startedAt!=null)applyFrame(state,elapsed==null?Math.max(0,now()-session.startedAt):elapsed);
    return state;
  }

  function historyProgress(state,elapsed){
    var t=timingFor(state.session,state),raw=clamp((elapsed-HISTORY_DELAY)/t.historyMs);
    if(raw<=0)return 0;if(raw>=1)return 1;
    var cursor=raw*t.segments,index=Math.min(t.segments-1,Math.floor(cursor)),local=cursor-index;
    return (index+easeSegment(local))/t.segments;
  }
  function applyHistory(state,elapsed){
    var t=timingFor(state.session,state),global=historyProgress(state,elapsed),done=elapsed>=HISTORY_DELAY+t.historyMs;
    state.history.forEach(function(st){
      if(done){finishHistory(st);return;}
      if(st.path&&st.path.isConnected)st.path.style.strokeDashoffset=(st.len*(1-global)).toFixed(2)+'px';
    });
    state.points.forEach(function(p){
      if(p.finished||!p.el||!p.el.isConnected)return;
      var local=clamp((global-p.progress+.018)/.055);
      if(global<=0&&p.progress>0)local=0;
      if(done||local>=1){p.el.style.removeProperty('opacity');p.el.style.removeProperty('transform');p.finished=true;return;}
      p.el.style.opacity=String(local);p.el.style.transform='scale('+(0.78+0.22*local).toFixed(3)+')';
    });
  }
  function applyForecast(state,elapsed){
    var t=timingFor(state.session,state);
    state.forecast.forEach(function(st){
      if(st.finished)return;
      var raw=clamp((elapsed-t.forecastStart)/t.forecastMs);
      if(raw<=0){
        if(st.path&&st.path.isConnected){st.path.style.visibility='hidden';st.path.style.opacity='0';}
        if(st.wipe&&st.wipe.isConnected)st.wipe.style.strokeDashoffset=st.len.toFixed(2)+'px';
        return;
      }
      if(!st.opened&&st.path&&st.path.isConnected){st.opened=true;st.path.style.visibility='visible';st.path.style.opacity='1';}
      if(raw>=1){finishForecast(st);return;}
      var step=Math.floor(raw*st.steps);if(step===st.lastStep)return;st.lastStep=step;
      var q=st.steps>0?step/st.steps:raw;if(st.wipe&&st.wipe.isConnected)st.wipe.style.strokeDashoffset=(st.len*(1-q)).toFixed(2)+'px';
    });
    state.rings.forEach(function(r,i){
      if(r.finished||!r.el||!r.el.isConnected)return;
      var raw=clamp((elapsed-(t.ringStart+i*28))/RING_MS),e=easeOut(raw);
      if(raw>=1){r.el.style.removeProperty('opacity');r.el.style.removeProperty('transform');r.finished=true;return;}
      r.el.style.opacity=String(e);r.el.style.transform='scale('+(0.76+0.24*e).toFixed(3)+')';
    });
  }
  function applyFrame(state,elapsed){if(!state||!state.session||state.session.cancelled)return;applyHistory(state,elapsed);applyForecast(state,elapsed);}
  function finishSession(session){
    if(!session||session.cancelled||session.completed)return;
    var svg=document.getElementById('monthly-profitability-svg'),state=svg&&svg.__rtRefinedSalesState;
    if(state&&state.session===session){state.history.forEach(finishHistory);state.forecast.forEach(finishForecast);settlePoints(state.points);settleRings(state.rings);settleFreshMarkup(svg);}
    session.completed=true;session.raf=0;
  }
  function animationFrame(session,ts){
    if(!session||session.cancelled||session!==activeSession)return;
    var svg=document.getElementById('monthly-profitability-svg');if(!svg||!svg.isConnected){session.raf=requestAnimationFrame(function(t){animationFrame(session,t);});return;}
    var state=svg.__rtRefinedSalesState;if(!state||state.session!==session)state=prepare(svg,session,Math.max(0,ts-session.startedAt));
    var elapsed=Math.max(0,ts-session.startedAt);applyFrame(state,elapsed);
    var t=timingFor(session,state);if(elapsed>=t.completeAt){finishSession(session);return;}
    session.raf=requestAnimationFrame(function(t2){animationFrame(session,t2);});
  }
  function startSession(session){
    if(!session||session.cancelled||session.completed||session.startedAt!=null||session!==activeSession)return;
    var svg=document.getElementById('monthly-profitability-svg');if(!svg||!isVisible(svg)){queueStart(session);return;}
    if(reducedMotion()){session.completed=true;settleFreshMarkup(svg);return;}
    session.startedAt=now();var state=svg.__rtRefinedSalesState;if(!state||state.session!==session)prepare(svg,session,0);
    session.raf=requestAnimationFrame(function(t){animationFrame(session,t);});
  }
  function queueStart(session){
    if(!session||session.cancelled||session.completed||session.startedAt!=null||session!==activeSession)return;
    if(session.startTimer){clearTimeout(session.startTimer);session.startTimer=0;}
    var svg=document.getElementById('monthly-profitability-svg');if(!svg||!isVisible(svg))return;
    session.startTimer=setTimeout(function(){session.startTimer=0;startSession(session);},SETTLE_MS);
  }
  function newSession(key){
    cancelSession(activeSession);activeSession={id:++sessionSerial,key:key,startedAt:null,completed:false,cancelled:false,startTimer:0,raf:0,timing:null};return activeSession;
  }
  function handleSalesRender(svg,key){
    var session=activeSession;if(!session||session.key!==key)session=newSession(key);
    if(session.completed){settleFreshMarkup(svg);svg.__rtRefinedSalesState={session:session,history:[],forecast:[],points:[],rings:[],stages:[0,1]};return;}
    var elapsed=session.startedAt==null?0:Math.max(0,now()-session.startedAt);prepare(svg,session,elapsed);
    if(session.startedAt==null)queueStart(session);
  }

  var _renderBeforeLineMotion=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=_renderBeforeLineMotion.apply(this,arguments);if(isSalesChart(svgEl,opts))handleSalesRender(svgEl,salesPeriodKey());return out;
  };

  var existing=document.getElementById('monthly-profitability-svg');
  if(existing&&existing.querySelector('path')){var initial=newSession(salesPeriodKey());prepare(existing,initial,0);queueStart(initial);}
  requestAnimationFrame(function(){document.documentElement.classList.remove('rt-motion-prep');});

  function visibilityCheck(){if(!activeSession||activeSession.cancelled||activeSession.completed)return;if(activeSession.startedAt==null)queueStart(activeSession);}
  try{
    var page=document.getElementById('p-monthly');
    if(page){var observer=new MutationObserver(visibilityCheck);observer.observe(page,{attributes:true,attributeFilter:['class','style','hidden','aria-busy']});}
    document.addEventListener('visibilitychange',function(){if(!document.hidden)visibilityCheck();},{passive:true});window.addEventListener('pageshow',visibilityCheck,{passive:true});
  }catch(_){}
})();
