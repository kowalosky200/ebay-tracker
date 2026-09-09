/* RETRADE Sales forecast hard-gate v1.4.57
 * Loaded before chart-line-motion.js so the final dotted projection cannot paint
 * during the historical reveal, including Safari/WebKit SVG edge cases.
 *
 * - finds forecast geometry across path / line / polyline elements
 * - hard-hides it until the historical line has reached the previous month
 * - lets chart-line-motion own known forecast paths
 * - gives any otherwise-unowned dotted segment the same stepped mask reveal
 * - presentation only: no forecast maths, accounting, sync or persisted data
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  var NS='http://www.w3.org/2000/svg';
  var raf=0;
  var maskSerial=0;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function clamp(v){return Math.max(0,Math.min(1,v));}
  function now(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function isSalesChart(svgEl,opts){
    return !!(svgEl&&svgEl.id==='monthly-profitability-svg'&&opts&&opts.primaryLabel==='Net Revenue'&&opts.secondaryLabel==='Net Profit');
  }
  function classText(el){
    var out=String((el&&el.getAttribute&&el.getAttribute('class'))||'');
    var p=el&&el.parentElement;
    for(var i=0;p&&i<3;i++,p=p.parentElement)out+=' '+String(p.getAttribute('class')||'');
    return out;
  }
  function strokeValue(el){
    var s=String((el&&el.getAttribute&&el.getAttribute('stroke'))||'').trim();
    if(s&&s!=='none')return s;
    try{s=String(getComputedStyle(el).stroke||'').trim();}catch(_){}
    return s||'none';
  }
  function dashValue(el){
    var d=String((el&&el.getAttribute&&el.getAttribute('stroke-dasharray'))||'').trim();
    if(!d||d==='none'){try{d=String(getComputedStyle(el).strokeDasharray||'').trim();}catch(_){} }
    return d;
  }
  function isDashed(el){
    var d=dashValue(el);
    return !!(d&&d!=='none'&&d!=='0'&&d!=='0px'&&!/^none$/i.test(d));
  }
  function geomLength(el){
    try{var n=el.getTotalLength();return isFinite(n)?n:0;}catch(_){return 0;}
  }
  function isForecastGeometry(el){
    if(!el||el.closest('defs'))return false;
    var cls=classText(el);
    if(/axis|grid|scrub|hover|hit|range|confidence|threshold|baseline|refund/i.test(cls))return false;
    if(strokeValue(el)==='none')return false;
    if(/forecast|projection|partial/i.test(cls))return geomLength(el)>5;
    return isDashed(el)&&geomLength(el)>12;
  }

  function installStyles(){
    var old=document.getElementById('rt-sales-forecast-hard-gate-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-sales-forecast-hard-gate-css';
    s.textContent='\
#p-monthly #monthly-profitability-svg.rt-sales-history-stage .rt-sales-forecast-geometry{visibility:hidden!important;opacity:0!important}\
#p-monthly #monthly-profitability-svg.rt-sales-history-stage .rt-sales-forecast-ring{visibility:hidden!important;opacity:0!important}\
#p-monthly #monthly-profitability-svg.rt-sales-forecast-stage .rt-sales-forecast-geometry{visibility:visible!important}\
@media(prefers-reduced-motion:reduce){#p-monthly #monthly-profitability-svg .rt-sales-forecast-geometry,#p-monthly #monthly-profitability-svg .rt-sales-forecast-ring{visibility:visible!important;opacity:1!important}}';
    document.head.appendChild(s);
  }
  installStyles();

  function ensureDefs(svg){
    var defs=svg.querySelector('defs');
    if(!defs){defs=document.createElementNS(NS,'defs');svg.insertBefore(defs,svg.firstChild);}
    return defs;
  }
  function cloneMaskGeometry(el){
    var clone=el.cloneNode(false);
    clone.removeAttribute('class');clone.removeAttribute('style');clone.removeAttribute('mask');clone.removeAttribute('filter');clone.removeAttribute('opacity');
    clone.setAttribute('fill','none');clone.setAttribute('stroke','white');clone.setAttribute('stroke-opacity','1');
    clone.removeAttribute('stroke-dasharray');clone.removeAttribute('stroke-dashoffset');
    var sw=2;try{sw=parseFloat(getComputedStyle(el).strokeWidth)||num(el.getAttribute('stroke-width'))||2;}catch(_){sw=num(el.getAttribute('stroke-width'))||2;}
    clone.setAttribute('stroke-width',String(Math.max(6,sw*3.3)));
    clone.setAttribute('stroke-linecap','butt');clone.setAttribute('stroke-linejoin','round');
    return clone;
  }
  function removeOwnedMask(st){
    if(!st)return;
    if(st.el&&st.el.isConnected&&st.maskId&&st.el.getAttribute('mask')==='url(#'+st.maskId+')'){
      if(st.originalMask)st.el.setAttribute('mask',st.originalMask);else st.el.removeAttribute('mask');
    }
    if(st.mask&&st.mask.isConnected)st.mask.remove();
    st.mask=null;st.wipe=null;st.maskId='';
  }
  function prepareUnownedMask(svg,el){
    if(!svg||!el||!el.isConnected||el.classList.contains('rt-refined-forecast-line'))return null;
    var existing=el.__rtForecastFinalGate;
    if(existing&&existing.svg===svg)return existing;
    if(existing)removeOwnedMask(existing);
    var len=geomLength(el);if(len<=12)return null;
    var originalMask=el.getAttribute('mask')||'';
    /* Do not replace a renderer-owned mask. In that case the hard visibility gate
       still guarantees the segment stays absent until the forecast stage. */
    if(originalMask)return null;
    var defs=ensureDefs(svg),mask=document.createElementNS(NS,'mask');
    var id='rt-final-forecast-mask-'+Date.now()+'-'+(++maskSerial),vb=svg.viewBox&&svg.viewBox.baseVal;
    var W=vb&&vb.width?vb.width:num(svg.getAttribute('width'))||800,H=vb&&vb.height?vb.height:num(svg.getAttribute('height'))||320;
    mask.setAttribute('id',id);mask.setAttribute('data-rt-final-forecast-mask','1');mask.setAttribute('maskUnits','userSpaceOnUse');
    mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',String(W));mask.setAttribute('height',String(H));
    var wipe=cloneMaskGeometry(el);
    wipe.style.strokeDasharray=len.toFixed(2)+'px '+len.toFixed(2)+'px';wipe.style.strokeDashoffset=len.toFixed(2)+'px';
    mask.appendChild(wipe);defs.appendChild(mask);el.setAttribute('mask','url(#'+id+')');
    var dashNums=(dashValue(el).match(/[0-9]*\.?[0-9]+/g)||[]).map(Number).filter(function(v){return isFinite(v)&&v>0;});
    var cycle=dashNums.length?dashNums.reduce(function(a,b){return a+b;},0):8;
    var st={svg:svg,el:el,mask:mask,wipe:wipe,maskId:id,originalMask:originalMask,len:len,steps:Math.max(6,Math.min(28,Math.round(len/Math.max(4,cycle))))};
    el.__rtForecastFinalGate=st;
    return st;
  }

  function markForecastGeometry(svg){
    if(!svg)return [];
    var out=[];
    Array.prototype.forEach.call(svg.querySelectorAll('path,line,polyline'),function(el){
      if(!isForecastGeometry(el))return;
      el.classList.add('rt-sales-forecast-geometry');out.push(el);
      prepareUnownedMask(svg,el);
    });
    return out;
  }
  function cleanupMasks(svg){
    if(!svg)return;
    Array.prototype.forEach.call(svg.querySelectorAll('[data-rt-final-forecast-mask="1"]'),function(m){m.remove();});
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-sales-forecast-geometry'),function(el){
      var st=el.__rtForecastFinalGate;if(st){removeOwnedMask(st);el.__rtForecastFinalGate=null;}
    });
  }
  function setUnownedProgress(svg,q,done){
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-sales-forecast-geometry'),function(el){
      var st=el.__rtForecastFinalGate;if(!st||!st.wipe||!st.wipe.isConnected)return;
      if(done){removeOwnedMask(st);el.__rtForecastFinalGate=null;return;}
      var step=Math.floor(clamp(q)*st.steps),stepped=st.steps?step/st.steps:clamp(q);
      st.wipe.style.strokeDashoffset=(st.len*(1-stepped)).toFixed(2)+'px';
    });
  }

  function stageFrame(svg){
    if(!svg||!svg.isConnected)return false;
    markForecastGeometry(svg);
    if(reducedMotion()){
      svg.classList.remove('rt-sales-history-stage','rt-sales-forecast-stage');cleanupMasks(svg);return false;
    }
    var state=svg.__rtRefinedSalesState,session=state&&state.session,timing=session&&session.timing;
    if(!session||session.completed){
      svg.classList.remove('rt-sales-history-stage','rt-sales-forecast-stage');cleanupMasks(svg);return false;
    }
    if(session.startedAt==null||!timing){
      svg.classList.add('rt-sales-history-stage');svg.classList.remove('rt-sales-forecast-stage');setUnownedProgress(svg,0,false);return true;
    }
    var elapsed=Math.max(0,now()-session.startedAt),forecastStart=num(timing.forecastStart),forecastMs=Math.max(1,num(timing.forecastMs));
    if(elapsed<forecastStart){
      svg.classList.add('rt-sales-history-stage');svg.classList.remove('rt-sales-forecast-stage');setUnownedProgress(svg,0,false);return true;
    }
    svg.classList.remove('rt-sales-history-stage');svg.classList.add('rt-sales-forecast-stage');
    var q=clamp((elapsed-forecastStart)/forecastMs),done=q>=1;
    setUnownedProgress(svg,q,done);
    if(done&&timing.completeAt&&elapsed>=num(timing.completeAt)){
      svg.classList.remove('rt-sales-forecast-stage');return false;
    }
    return true;
  }
  function run(){
    raf=0;var svg=document.getElementById('monthly-profitability-svg');
    if(stageFrame(svg))raf=requestAnimationFrame(run);
  }
  function kick(){if(raf)return;raf=requestAnimationFrame(run);}

  var renderBeforeGate=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=renderBeforeGate.apply(this,arguments);
    if(isSalesChart(svgEl,opts)){
      markForecastGeometry(svgEl);
      svgEl.classList.add('rt-sales-history-stage');
      kick();
    }
    return out;
  };

  var existing=document.getElementById('monthly-profitability-svg');
  if(existing){markForecastGeometry(existing);existing.classList.add('rt-sales-history-stage');kick();}
  try{
    var page=document.getElementById('p-monthly');
    if(page){new MutationObserver(function(){var svg=document.getElementById('monthly-profitability-svg');if(svg){markForecastGeometry(svg);kick();}}).observe(page,{childList:true,subtree:true});}
    document.addEventListener('visibilitychange',function(){if(!document.hidden)kick();},{passive:true});
    window.addEventListener('pageshow',kick,{passive:true});
  }catch(_){}
})();
