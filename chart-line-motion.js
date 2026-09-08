/* RETRADE yearly Sales line motion v1.4.52
 *
 * One presentation owner for the Sales yearly line chart:
 * - solid history draws smoothly to Today
 * - forecast is physically hidden until history reaches Today
 * - forecast then reveals dash-by-dash from left to right
 * - every real chart render is re-armed, even when the selected period is unchanged
 * - hidden-page/iOS safe: no SVG length/box measurement is required to decide
 *   whether an element belongs to the motion sequence
 * - one shared requestAnimationFrame scheduler, no per-element rAF loops
 *
 * No accounting, forecast maths, sync, inventory lifecycle or persisted data is touched.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  var NS='http://www.w3.org/2000/svg';
  var HISTORY_DELAY=45;
  var HISTORY_MS=820;
  var FORECAST_DELAY=HISTORY_DELAY+HISTORY_MS+70;
  var FORECAST_MS=920;
  var serial=0;
  var renderSerial=0;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function now(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function visible(el){
    if(!el||!el.isConnected)return false;
    var cs;try{cs=getComputedStyle(el);}catch(_){cs=null;}
    if(cs&&(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0))return false;
    var r;try{r=el.getBoundingClientRect();}catch(_){r=null;}
    return !!(r&&r.width>80&&r.height>80);
  }
  function isSales(svg,opts){
    return !!(svg&&svg.id==='monthly-profitability-svg'&&opts&&opts.primaryLabel==='Net Revenue'&&opts.secondaryLabel==='Net Profit');
  }
  function periodKey(){
    var key='';
    try{if(typeof MONTHLY_PERIOD!=='undefined')key=String(MONTHLY_PERIOD||'');}catch(_){}
    var sel=document.querySelector('#p-monthly select.period-select-inline,#p-monthly select');
    if(sel){try{key+='|'+String(sel.value||'')+'|'+String(sel.options[sel.selectedIndex].text||'');}catch(_){} }
    return key||'sales-default';
  }

  function installStyles(){
    ['rt-line-motion-v1446','rt-line-motion-v1447','rt-line-motion-v1448','rt-line-motion-v1449','rt-line-motion-v1450','rt-line-motion-v1451','rt-line-motion-v1452'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove();});
    var s=document.createElement('style');s.id='rt-line-motion-v1452';
    s.textContent='\
#p-monthly svg.rt-refined-sales-motion .rt-refined-history-line,\
#p-monthly svg.rt-refined-sales-motion .rt-refined-forecast-line{animation:none!important;}\
#p-monthly svg.rt-refined-sales-motion .rt-refined-forecast-line[data-rt-motion-pending="1"],\
#p-monthly svg.rt-refined-sales-motion .rt-refined-history-line[data-rt-motion-pending="1"]{opacity:0!important;}\
#p-monthly svg.rt-refined-sales-motion .rt-sales-forecast-ring,\
#p-monthly svg.rt-refined-sales-motion circle.rt-refined-series-point{animation:none!important;}\
#p-monthly #monthly-profitability-svg{will-change:opacity;}\
@media(prefers-reduced-motion:reduce){#p-monthly #monthly-profitability-svg{opacity:1!important;}}';
    document.head.appendChild(s);
  }
  installStyles();

  function stroke(el){
    var s=el&&el.getAttribute?el.getAttribute('stroke'):'';
    if(s&&s!=='none')return s;
    try{s=getComputedStyle(el).stroke;}catch(_){}
    return s||'none';
  }
  function dash(el){
    if(!el)return '';
    var d=String(el.getAttribute('stroke-dasharray')||'').trim();
    if(!d||d==='none'){
      var st=String(el.getAttribute('style')||'');
      var m=st.match(/stroke-dasharray\s*:\s*([^;]+)/i);
      if(m)d=String(m[1]||'').trim();
    }
    if(!d||d==='none'){try{d=String(getComputedStyle(el).strokeDasharray||'').trim();}catch(_){} }
    return d;
  }
  function dashed(el){var d=dash(el);return !!(d&&d!=='none'&&d!=='0'&&d!=='0px');}
  function forecastCandidate(el){
    if(!el)return false;
    var cls=String(el.getAttribute('class')||'');
    return /forecast|projection|projected|partial/i.test(cls)||dashed(el);
  }
  function hasGeometryMarkup(el){
    if(!el||!el.tagName)return false;
    var tag=String(el.tagName).toLowerCase();
    if(tag==='path')return !!el.getAttribute('d');
    if(tag==='line')return el.hasAttribute('x1')&&el.hasAttribute('x2');
    if(tag==='polyline')return !!String(el.getAttribute('points')||'').trim();
    return false;
  }
  function seriesElement(el){
    if(!el||el.closest('defs')||!hasGeometryMarkup(el))return false;
    var cls=String(el.getAttribute('class')||'');
    if(/scrub|axis|grid|hit|hover|area|confidence/i.test(cls))return false;
    var tag=String(el.tagName||'').toLowerCase();
    if(tag==='path'){
      var fill=String(el.getAttribute('fill')||'').trim();
      if(fill&&fill!=='none'&&fill!=='transparent')return false;
      return stroke(el)!=='none'||/line|series|revenue|profit|forecast|projection|partial/i.test(cls);
    }
    return forecastCandidate(el)&&stroke(el)!=='none';
  }
  function geometryElements(svg){
    return Array.prototype.slice.call(svg.querySelectorAll('path,line,polyline')).filter(seriesElement);
  }

  function geometryLength(el){
    try{
      if(typeof el.getTotalLength==='function'){
        var n=el.getTotalLength();
        if(isFinite(n)&&n>0)return n;
      }
    }catch(_){}
    var tag=String(el&&el.tagName||'').toLowerCase();
    if(tag==='line'){
      var dx=num(el.getAttribute('x2'))-num(el.getAttribute('x1'));
      var dy=num(el.getAttribute('y2'))-num(el.getAttribute('y1'));
      return Math.sqrt(dx*dx+dy*dy);
    }
    if(tag==='polyline'){
      var raw=String(el.getAttribute('points')||'').trim();
      var vals=raw.match(/-?[0-9]*\.?[0-9]+/g)||[],sum=0;
      for(var i=2;i+1<vals.length;i+=2){
        var x1=num(vals[i-2]),y1=num(vals[i-1]),x2=num(vals[i]),y2=num(vals[i+1]);
        var px=x2-x1,py=y2-y1;sum+=Math.sqrt(px*px+py*py);
      }
      return sum;
    }
    return 0;
  }
  function endpointGeometry(svg,el,len){
    var a=null,b=null,tag=String(el&&el.tagName||'').toLowerCase();
    if(typeof el.getPointAtLength==='function'){
      try{a=el.getPointAtLength(0);b=el.getPointAtLength(len);}catch(_){}
    }
    if((!a||!b)&&tag==='line'){
      a={x:num(el.getAttribute('x1')),y:num(el.getAttribute('y1'))};
      b={x:num(el.getAttribute('x2')),y:num(el.getAttribute('y2'))};
    }
    if((!a||!b)&&tag==='polyline'){
      var vals=String(el.getAttribute('points')||'').match(/-?[0-9]*\.?[0-9]+/g)||[];
      if(vals.length>=4){a={x:num(vals[0]),y:num(vals[1])};b={x:num(vals[vals.length-2]),y:num(vals[vals.length-1])};}
    }
    if(!a||!b||![a.x,a.y,b.x,b.y].every(function(v){return isFinite(Number(v));}))return null;
    var left=Math.min(Number(a.x),Number(b.x)),right=Math.max(Number(a.x),Number(b.x));
    if(right-left<.5)return null;
    var vb=svg&&svg.viewBox&&svg.viewBox.baseVal;
    var y=vb&&isFinite(vb.y)?vb.y-8:-10000;
    var h=vb&&vb.height?vb.height+16:20000;
    return {left:left,right:right,y:y,height:h};
  }
  function defs(svg){var d=svg.querySelector('defs');if(!d){d=document.createElementNS(NS,'defs');svg.insertBefore(d,svg.firstChild);}return d;}

  function clearRevealArtifacts(svg){
    Array.prototype.forEach.call(svg.querySelectorAll('[data-rt-sales-forecast-clip="1"],mask[data-rt-sales-forecast-mask="1"]'),function(el){el.remove();});
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-refined-forecast-line,.rt-refined-history-line'),function(el){
      el.removeAttribute('clip-path');el.removeAttribute('mask');el.removeAttribute('data-rt-motion-pending');
      el.style.removeProperty('opacity');
      el.style.removeProperty('stroke-dasharray');
      el.style.removeProperty('stroke-dashoffset');
      el.classList.remove('rt-refined-forecast-line','rt-refined-history-line');
    });
  }

  function cancel(state){
    if(!state)return;
    state.cancelled=true;
    if(state.raf){try{cancelAnimationFrame(state.raf);}catch(_){}state.raf=0;}
    state.jobs=[];
  }
  function frame(state){
    if(!state||state.cancelled||state.raf||!state.jobs.length)return;
    state.raf=requestAnimationFrame(function tick(ts){
      state.raf=0;if(state.cancelled)return;
      var keep=[],done=[];
      state.jobs.forEach(function(job){
        if(ts<job.start){keep.push(job);return;}
        var t=job.duration>0?(ts-job.start)/job.duration:1;if(t<0)t=0;if(t>1)t=1;
        try{job.draw(job.ease(t));}catch(_){}
        if(t<1)keep.push(job);else if(job.done)done.push(job.done);
      });
      state.jobs=keep;done.forEach(function(fn){try{fn();}catch(_){} });frame(state);
    });
  }
  function tween(state,delay,duration,ease,draw,done){
    if(!state||state.cancelled)return;
    state.jobs.push({start:now()+Math.max(0,delay||0),duration:Math.max(1,duration||1),ease:ease,draw:draw,done:done});
    frame(state);
  }
  function easeHistory(t){return 1-Math.pow(1-t,2.05);}
  function linear(t){return t;}

  function prepareHistory(el,knownLen){
    if(!el)return null;
    el.classList.add('rt-refined-history-line');
    try{el.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    var len=knownLen||geometryLength(el);
    if(!(len>0)){
      el.setAttribute('data-rt-motion-pending','1');
      el.style.opacity='0';
      return {kind:'history',el:el,len:0,pending:true};
    }
    el.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';
    el.style.strokeDashoffset=len.toFixed(2)+'px';
    el.removeAttribute('data-rt-motion-pending');
    el.style.removeProperty('opacity');
    return {kind:'history',el:el,len:len,pending:false};
  }
  function finishHistory(st){
    if(!st||!st.el||!st.el.isConnected)return;
    st.el.style.strokeDashoffset='0px';
    st.el.style.removeProperty('stroke-dasharray');
    st.el.style.removeProperty('stroke-dashoffset');
  }

  function prepareForecast(svg,path,knownLen,knownDash){
    if(!path)return null;
    path.classList.add('rt-refined-forecast-line');
    try{path.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
    path.setAttribute('data-rt-motion-pending','1');
    path.style.opacity='0';

    var pattern=knownDash||dash(path);
    var len=knownLen||geometryLength(path);
    if(!(len>0))return {kind:'forecast',el:path,len:0,dashPattern:pattern,pending:true,lastStep:-1};
    var g=endpointGeometry(svg,path,len);
    if(!g)return {kind:'forecast',el:path,len:len,dashPattern:pattern,pending:true,lastStep:-1};

    var pad=9,left=g.left-pad,right=g.right+pad;
    var cp=document.createElementNS(NS,'clipPath');
    var id='rt-sales-forecast-clip-'+Date.now()+'-'+(++serial);
    cp.setAttribute('id',id);cp.setAttribute('data-rt-sales-forecast-clip','1');cp.setAttribute('clipPathUnits','userSpaceOnUse');
    var rect=document.createElementNS(NS,'rect');
    rect.setAttribute('x',left.toFixed(2));rect.setAttribute('y',String(g.y));
    rect.setAttribute('width','0');rect.setAttribute('height',String(Math.max(1,g.height)));
    cp.appendChild(rect);defs(svg).appendChild(cp);
    path.setAttribute('clip-path','url(#'+id+')');
    path.removeAttribute('data-rt-motion-pending');
    path.style.opacity='1';

    var parts=String(pattern||dash(path)).match(/[0-9]*\.?[0-9]+/g)||[];
    var pitch=(num(parts[0])+num(parts[1]))||8;
    var steps=Math.max(10,Math.min(34,Math.round(len/Math.max(4,pitch))));
    return {kind:'forecast',el:path,clip:cp,rect:rect,len:len,dashPattern:pattern,x:left,width:right-left,steps:steps,lastStep:-1,pending:false};
  }
  function hydratePending(state){
    if(!state)return false;
    var unresolved=false;
    state.history=state.history.map(function(st){
      if(!st||!st.pending)return st;
      var next=prepareHistory(st.el);
      if(!next||next.pending)unresolved=true;
      return next||st;
    });
    state.forecast=state.forecast.map(function(st){
      if(!st||!st.pending)return st;
      var next=prepareForecast(state.svg,st.el,st.len,st.dashPattern);
      if(!next||next.pending)unresolved=true;
      return next||st;
    });
    return !unresolved;
  }
  function drawForecastStep(st,e){
    if(!st||st.pending||!st.rect||!st.rect.isConnected)return;
    var step=Math.min(st.steps,Math.floor(e*st.steps));
    if(e>=1)step=st.steps;
    if(step===st.lastStep)return;
    st.lastStep=step;
    st.rect.setAttribute('width',(st.width*(step/st.steps)).toFixed(2));
  }
  function finishForecast(st){
    if(!st)return;
    if(st.el&&st.el.isConnected){st.el.removeAttribute('clip-path');st.el.removeAttribute('data-rt-motion-pending');st.el.style.removeProperty('opacity');}
    if(st.clip&&st.clip.isConnected)st.clip.remove();
  }

  function points(svg){
    return Array.prototype.slice.call(svg.querySelectorAll('circle')).filter(function(c){
      var cls=String(c.getAttribute('class')||'');
      if(/forecast-ring|scrub|hover/i.test(cls))return false;
      return isFinite(num(c.getAttribute('cx')))&&isFinite(num(c.getAttribute('cy')));
    });
  }
  function preparePoints(svg){
    var list=points(svg);list.forEach(function(c){
      c.classList.add('rt-refined-series-point');try{c.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
      c.style.opacity='0';c.style.transform='scale(.82)';c.style.transformOrigin='center';c.style.transformBox='fill-box';
    });return list;
  }
  function prepareRings(svg){
    var list=Array.prototype.slice.call(svg.querySelectorAll('.rt-sales-forecast-ring'));
    list.forEach(function(r){try{r.getAnimations().forEach(function(a){a.cancel();});}catch(_){}r.style.animation='none';r.style.opacity='0';r.style.transform='scale(.82)';r.style.transformOrigin='center';r.style.transformBox='fill-box';});
    return list;
  }

  function settle(svg,key){
    clearRevealArtifacts(svg);
    Array.prototype.forEach.call(svg.querySelectorAll('circle.rt-refined-series-point,.rt-sales-forecast-ring'),function(el){el.style.removeProperty('opacity');el.style.removeProperty('transform');});
    svg.classList.add('rt-motion-ready');
    svg.__rtRefinedSalesState={key:key,svg:svg,history:[],forecast:[],points:[],rings:[],played:true,cancelled:false,jobs:[],raf:0,renderId:++renderSerial};
    return svg.__rtRefinedSalesState;
  }
  function prepare(svg,key){
    if(!svg)return null;
    cancel(svg.__rtRefinedSalesState);
    clearRevealArtifacts(svg);
    svg.classList.remove('rt-chart-draw');
    svg.classList.add('rt-refined-sales-motion');
    if(reducedMotion())return settle(svg,key);

    var history=[],forecast=[];
    geometryElements(svg).forEach(function(p){
      var isForecast=forecastCandidate(p);
      var originalDash=isForecast?dash(p):'';
      var st=isForecast?prepareForecast(svg,p,0,originalDash):prepareHistory(p);
      if(st)(isForecast?forecast:history).push(st);
    });
    var state={key:key,svg:svg,history:history,forecast:forecast,points:preparePoints(svg),rings:prepareRings(svg),played:false,cancelled:false,jobs:[],raf:0,geometryRetries:0,renderId:++renderSerial};
    svg.__rtRefinedSalesState=state;
    svg.classList.add('rt-motion-ready');
    return state;
  }

  function revealPoints(state){
    if(!state.points.length)return;
    var xs=state.points.map(function(c){return num(c.getAttribute('cx'));});
    var min=Math.min.apply(Math,xs),max=Math.max.apply(Math,xs),span=Math.max(1,max-min);
    state.points.forEach(function(c){
      var p=(num(c.getAttribute('cx'))-min)/span,delay=HISTORY_DELAY+100+p*(HISTORY_MS-170);
      tween(state,delay,120,easeHistory,function(e){if(c.isConnected){c.style.opacity=String(e);c.style.transform='scale('+(0.82+0.18*e).toFixed(3)+')';}},function(){if(c.isConnected){c.style.removeProperty('opacity');c.style.removeProperty('transform');}});
    });
  }
  function revealRings(state){
    state.rings.forEach(function(r,i){
      tween(state,FORECAST_DELAY+FORECAST_MS+35+i*30,170,easeHistory,function(e){
        if(r.isConnected){r.style.opacity=String(e);r.style.transform='scale('+(0.82+0.18*e).toFixed(3)+')';}
      },function(){if(r.isConnected){r.style.removeProperty('opacity');r.style.removeProperty('transform');}});
    });
  }
  function retryGeometry(svg,state){
    if(!state||state.played||state.cancelled||state.geometryRetries>=8)return;
    state.geometryRetries++;
    requestAnimationFrame(function(){requestAnimationFrame(function(){playWhenVisible(svg);});});
  }
  function play(svg){
    if(!svg||!visible(svg)||reducedMotion())return false;
    var state=svg.__rtRefinedSalesState;
    if(!state||state.played||state.cancelled)return false;
    if(!state.history.length&&!state.forecast.length&&geometryElements(svg).length){
      state=prepare(svg,state.key);
      if(!state)return false;
    }
    if(!hydratePending(state)){retryGeometry(svg,state);return false;}
    state.played=true;

    state.history.forEach(function(st,i){
      var extra=st.el.classList.contains('rt-chart-tertiary-line')?35:Math.min(i,2)*16;
      tween(state,HISTORY_DELAY+extra,HISTORY_MS,easeHistory,function(e){
        if(st.el.isConnected)st.el.style.strokeDashoffset=(st.len*(1-e)).toFixed(2)+'px';
      },function(){finishHistory(st);});
    });
    revealPoints(state);
    state.forecast.forEach(function(st,i){
      tween(state,FORECAST_DELAY+i*34,FORECAST_MS,linear,function(e){drawForecastStep(st,e);},function(){drawForecastStep(st,1);finishForecast(st);});
    });
    revealRings(state);
    return true;
  }
  function playWhenVisible(svg){
    if(!svg)return false;
    if(play(svg))return true;
    var s=svg.__rtRefinedSalesState;
    return !!(s&&s.played);
  }

  var before=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=before.apply(this,arguments);
    if(isSales(svgEl,opts)){
      prepare(svgEl,periodKey());
      requestAnimationFrame(function(){playWhenVisible(svgEl);});
    }
    return out;
  };

  var existing=document.getElementById('monthly-profitability-svg');
  if(existing&&existing.querySelector('path,line,polyline')){
    prepare(existing,periodKey());
    requestAnimationFrame(function(){playWhenVisible(existing);});
  }
  requestAnimationFrame(function(){document.documentElement.classList.remove('rt-motion-prep');});

  try{
    var page=document.getElementById('p-monthly');
    if(page){
      var observer=new MutationObserver(function(){var svg=document.getElementById('monthly-profitability-svg');if(svg)playWhenVisible(svg);});
      observer.observe(page,{attributes:true,attributeFilter:['class','hidden','aria-busy']});
    }
  }catch(_){}
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){var svg=document.getElementById('monthly-profitability-svg');if(svg)playWhenVisible(svg);}});

  window.__RT_LINE_MOTION_BUILD='20260908-line-motion-5';
})();
