/* RETRADE yearly Sales line-motion refinement v1.4.49
 * Loaded after chart-reveal.js.
 *
 * Presentation-only responsibilities:
 * - one owner for Sales line motion: no competing rt-chart-draw replay
 * - prepare paths before they become visible, avoiding loaded -> rewind flashes
 * - one requestAnimationFrame timeline for all paths/points/rings
 * - smooth solid history to Today, then a measured dotted forecast reveal
 * - always restore solid history strokes after motion completes
 * - deliberate period switches replay; same-period background renders settle
 *
 * No accounting, forecast maths, sync, inventory lifecycle or persisted data is touched.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  var NS='http://www.w3.org/2000/svg';
  var HISTORY_MS=820;
  var HISTORY_DELAY=45;
  var FORECAST_DELAY=HISTORY_DELAY+HISTORY_MS+30;
  var FORECAST_MS=720;
  var currentKey=null;
  var maskSerial=0;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
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
    return key||'sales-default';
  }

  function installStyles(){
    ['rt-line-motion-v1446','rt-line-motion-v1447','rt-line-motion-v1448','rt-line-motion-v1449'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-line-motion-v1449';
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
    var s=path.getAttribute('stroke');
    if(s&&s!=='none')return s;
    try{s=getComputedStyle(path).stroke;}catch(_){}
    return s||'none';
  }
  function dashValue(path){
    var d=String(path.getAttribute('stroke-dasharray')||'').trim();
    if(!d||d==='none'){
      try{d=String(getComputedStyle(path).strokeDasharray||'').trim();}catch(_){}
    }
    return d;
  }
  function isDashed(path){
    var d=dashValue(path);
    return !!(d&&d!=='none'&&d!=='0px'&&d!=='0'&&!/^none$/i.test(d));
  }
  function isSeriesPath(path){
    if(!path||path.closest('defs'))return false;
    var cls=String(path.getAttribute('class')||'');
    if(/scrub|axis|grid|hit|hover|area/i.test(cls))return false;
    if(!path.getAttribute('d')||strokeValue(path)==='none')return false;
    var fill=String(path.getAttribute('fill')||'').trim();
    if(fill&&fill!=='none'&&fill!=='transparent')return false;
    return pathLength(path)>14;
  }
  function ensureDefs(svg){
    var defs=svg.querySelector('defs');
    if(!defs){defs=document.createElementNS(NS,'defs');svg.insertBefore(defs,svg.firstChild);}
    return defs;
  }
  function clearPriorMasks(svg){
    Array.prototype.forEach.call(svg.querySelectorAll('mask[data-rt-sales-forecast-mask="1"]'),function(m){m.remove();});
    Array.prototype.forEach.call(svg.querySelectorAll('path.rt-refined-forecast-line'),function(p){p.removeAttribute('mask');});
  }

  /* One frame callback updates every active animation job for this SVG. The old
     implementation launched a separate rAF loop for every path, dot and ring;
     on a phone that multiplied JS callbacks and style writes precisely while the
     browser was trying to paint the chart. */
  function cancelState(state){
    if(!state)return;
    state.cancelled=true;
    if(state.raf){try{cancelAnimationFrame(state.raf);}catch(_){}state.raf=0;}
    state.jobs=[];
  }
  function requestStateFrame(state){
    if(!state||state.cancelled||state.raf||!state.jobs.length)return;
    state.raf=requestAnimationFrame(function frame(ts){
      state.raf=0;
      if(state.cancelled)return;
      var keep=[],completed=[];
      state.jobs.forEach(function(job){
        if(ts<job.start){keep.push(job);return;}
        var t=job.duration>0?(ts-job.start)/job.duration:1;
        if(t<0)t=0;if(t>1)t=1;
        try{job.draw(job.ease(t));}catch(_){}
        if(t<1)keep.push(job);
        else if(job.done)completed.push(job.done);
      });
      state.jobs=keep;
      completed.forEach(function(fn){try{fn();}catch(_){} });
      requestStateFrame(state);
    });
  }
  function tween(state,delay,duration,ease,draw,done){
    if(!state||state.cancelled)return;
    state.jobs.push({start:now()+Math.max(0,delay||0),duration:Math.max(1,duration||1),ease:ease,draw:draw,done:done});
    requestStateFrame(state);
  }
  function easeHistory(t){
    /* Quick response with a soft landing, without the sticky easing tail that
       made the old line appear to judder just before completion. */
    return 1-Math.pow(1-t,2.05);
  }
  function linear(t){return t;}

  function prepareHistory(path){
    var len=pathLength(path);if(len<=0)return null;
    path.classList.add('rt-refined-history-line');
    try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    var st={path:path,len:len};
    path.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';
    path.style.strokeDashoffset=len.toFixed(2)+'px';
    return st;
  }
  function finishHistory(st){
    if(!st||!st.path||!st.path.isConnected)return;
    st.path.style.strokeDashoffset='0px';
    st.path.style.removeProperty('stroke-dasharray');
    st.path.style.removeProperty('stroke-dashoffset');
  }

  function prepareForecast(svg,path){
    var len=pathLength(path);if(len<=0)return null;
    path.classList.add('rt-refined-forecast-line');
    try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    var defs=ensureDefs(svg),mask=document.createElementNS(NS,'mask');
    var id='rt-sales-forecast-mask-'+Date.now()+'-'+(++maskSerial);
    var vb=svg.viewBox&&svg.viewBox.baseVal;
    var W=vb&&vb.width?vb.width:num(svg.getAttribute('width'))||800;
    var H=vb&&vb.height?vb.height:num(svg.getAttribute('height'))||320;
    mask.setAttribute('id',id);mask.setAttribute('data-rt-sales-forecast-mask','1');
    mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');
    mask.setAttribute('width',String(W));mask.setAttribute('height',String(H));
    var wipe=document.createElementNS(NS,'path');
    wipe.setAttribute('d',path.getAttribute('d'));
    wipe.setAttribute('fill','none');wipe.setAttribute('stroke','white');
    var sw=num(path.getAttribute('stroke-width'));
    if(!sw){try{sw=parseFloat(getComputedStyle(path).strokeWidth)||2;}catch(_){sw=2;}}
    wipe.setAttribute('stroke-width',String(Math.max(5,sw*3.1)));
    wipe.setAttribute('stroke-linecap','butt');wipe.setAttribute('stroke-linejoin','round');
    wipe.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';
    wipe.style.strokeDashoffset=len.toFixed(2)+'px';
    mask.appendChild(wipe);defs.appendChild(mask);
    path.setAttribute('mask','url(#'+id+')');
    return {path:path,wipe:wipe,mask:mask,len:len};
  }
  function finishForecast(st){
    if(!st)return;
    if(st.path&&st.path.isConnected)st.path.removeAttribute('mask');
    if(st.mask&&st.mask.isConnected)st.mask.remove();
  }

  function preparePoints(svg){
    var circles=Array.prototype.slice.call(svg.querySelectorAll('circle')).filter(function(c){
      var cls=String(c.getAttribute('class')||'');
      if(/forecast-ring|scrub|hover/i.test(cls))return false;
      return isFinite(num(c.getAttribute('cx')))&&isFinite(num(c.getAttribute('cy')));
    });
    circles.forEach(function(c){
      c.classList.add('rt-refined-series-point');
      try{c.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
      c.style.opacity='0';c.style.transform='scale(.82)';c.style.transformOrigin='center';c.style.transformBox='fill-box';
    });
    return circles;
  }
  function prepareRings(svg){
    var rings=Array.prototype.slice.call(svg.querySelectorAll('.rt-sales-forecast-ring'));
    rings.forEach(function(r){
      try{r.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
      r.style.animation='none';r.style.opacity='0';r.style.transform='scale(.82)';r.style.transformOrigin='center';r.style.transformBox='fill-box';
    });
    return rings;
  }

  function settleImmediately(svg,key){
    clearPriorMasks(svg);
    Array.prototype.forEach.call(svg.querySelectorAll('path.rt-refined-history-line'),function(p){
      p.style.removeProperty('stroke-dasharray');p.style.removeProperty('stroke-dashoffset');
    });
    Array.prototype.forEach.call(svg.querySelectorAll('circle.rt-refined-series-point,.rt-sales-forecast-ring'),function(el){
      el.style.removeProperty('opacity');el.style.removeProperty('transform');
    });
    svg.classList.add('rt-motion-ready');
    svg.__rtRefinedSalesState={key:key,played:true,cancelled:false,jobs:[],raf:0};
    return svg.__rtRefinedSalesState;
  }

  function prepare(svg,key){
    if(!svg)return null;
    cancelState(svg.__rtRefinedSalesState);
    clearPriorMasks(svg);
    svg.classList.remove('rt-chart-draw');
    if(reducedMotion())return settleImmediately(svg,key);

    var paths=Array.prototype.slice.call(svg.querySelectorAll('path')).filter(isSeriesPath);
    var history=[],forecast=[];
    paths.forEach(function(p){
      var dashed=isDashed(p),st=dashed?prepareForecast(svg,p):prepareHistory(p);
      if(st)(dashed?forecast:history).push(st);
    });
    var state={key:key,history:history,forecast:forecast,points:preparePoints(svg),rings:prepareRings(svg),played:false,cancelled:false,jobs:[],raf:0};
    svg.__rtRefinedSalesState=state;
    svg.classList.add('rt-refined-sales-motion','rt-motion-ready');
    return state;
  }

  function revealPoints(state){
    if(!state.points.length)return;
    var xs=state.points.map(function(c){return num(c.getAttribute('cx'));});
    var minX=Math.min.apply(Math,xs),maxX=Math.max.apply(Math,xs),span=Math.max(1,maxX-minX);
    state.points.forEach(function(c){
      var progress=(num(c.getAttribute('cx'))-minX)/span;
      var delay=HISTORY_DELAY+100+progress*(HISTORY_MS-170);
      tween(state,delay,120,easeHistory,function(e){
        if(!c.isConnected)return;
        c.style.opacity=String(e);c.style.transform='scale('+(0.82+0.18*e).toFixed(3)+')';
      },function(){if(c.isConnected){c.style.removeProperty('opacity');c.style.removeProperty('transform');}});
    });
  }
  function revealRings(state){
    state.rings.forEach(function(r,i){
      tween(state,FORECAST_DELAY+FORECAST_MS+35+i*24,170,easeHistory,function(e){
        if(!r.isConnected)return;
        r.style.opacity=String(e);r.style.transform='scale('+(0.82+0.18*e).toFixed(3)+')';
      },function(){if(r.isConnected){r.style.removeProperty('opacity');r.style.removeProperty('transform');}});
    });
  }

  function play(svg){
    if(!svg||!isVisible(svg)||reducedMotion())return false;
    var state=svg.__rtRefinedSalesState;
    if(!state||state.played||state.cancelled)return false;
    state.played=true;

    state.history.forEach(function(st,i){
      var extra=st.path.classList.contains('rt-chart-tertiary-line')?35:Math.min(i,2)*16;
      tween(state,HISTORY_DELAY+extra,HISTORY_MS,easeHistory,function(e){
        if(st.path.isConnected)st.path.style.strokeDashoffset=(st.len*(1-e)).toFixed(2)+'px';
      },function(){finishHistory(st);});
    });
    revealPoints(state);
    state.forecast.forEach(function(st,i){
      /* The forecast deliberately stays linear so the dotted section reveals at
         a constant, readable cadence rather than racing then sticking at the end. */
      tween(state,FORECAST_DELAY+i*28,FORECAST_MS,linear,function(e){
        if(st.wipe.isConnected)st.wipe.style.strokeDashoffset=(st.len*(1-e)).toFixed(2)+'px';
      },function(){finishForecast(st);});
    });
    revealRings(state);
    return true;
  }

  function playWhenVisible(svg){
    if(!svg)return;
    if(play(svg))return;
    var st=svg.__rtRefinedSalesState;
    if(!st||st.played||st.cancelled)return;
  }

  var _renderBeforeLineMotion=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=_renderBeforeLineMotion.apply(this,arguments);
    if(isSalesChart(svgEl,opts)){
      var key=salesPeriodKey(),prior=svgEl.__rtRefinedSalesState;
      var changed=(currentKey===null||key!==currentKey);
      currentKey=key;
      /* If the same period re-renders before its first reveal has started (for
         example during hydration), prepare the newest SVG markup. Once played,
         same-period background refreshes stay settled and do not rewind. */
      if(changed||!prior||!prior.played){
        prepare(svgEl,key);
        requestAnimationFrame(function(){playWhenVisible(svgEl);});
      }else{
        svgEl.classList.add('rt-motion-ready');
      }
    }
    return out;
  };

  /* app-core may have produced the initial Sales SVG before this layer loaded.
     app.js keeps it transparent until we have synchronously prepared the paths. */
  var existing=document.getElementById('monthly-profitability-svg');
  if(existing&&existing.querySelector('path')){
    currentKey=salesPeriodKey();
    prepare(existing,currentKey);
    requestAnimationFrame(function(){playWhenVisible(existing);});
  }
  requestAnimationFrame(function(){document.documentElement.classList.remove('rt-motion-prep');});

  /* Visibility changes are page-level events. Watching the entire document's
     style attribute was self-triggering because this animation changes SVG style
     every frame. Observe only the Sales page state instead. */
  try{
    var page=document.getElementById('p-monthly');
    if(page){
      var pageObserver=new MutationObserver(function(){
        var svg=document.getElementById('monthly-profitability-svg');
        if(svg)playWhenVisible(svg);
      });
      pageObserver.observe(page,{attributes:true,attributeFilter:['class','hidden','aria-busy']});
    }
  }catch(_){}
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState!=='visible')return;
    var svg=document.getElementById('monthly-profitability-svg');
    if(svg)playWhenVisible(svg);
  });

  window.__RT_LINE_MOTION_BUILD='20260907-line-motion-2';
})();