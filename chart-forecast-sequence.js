/* RETRADE dashboard forecast sequence v1.4.56
 * Loaded after chart-line-motion.js.
 *
 * Calendar Year dashboard motion has two deliberate acts:
 * 1) actual Revenue/Profit bars complete their normal left-to-right reveal
 * 2) only then does the current-month forecast extension arrive in slower,
 *    stepped increments, using the existing dashed forecast-shell language
 *
 * Presentation only: no forecast calculation, accounting or persisted data.
 */
(function(){
  'use strict';

  if(typeof _renderChartInto!=='function')return;

  var STEP_MS=96;
  var STEPS=10;
  var AFTER_ACTUAL_GAP=145;
  var FALLBACK_MAIN_MS=1120;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function clamp(min,v,max){return Math.max(min,Math.min(max,v));}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function periodKey(){
    try{if(typeof SUMMARY_PERIOD!=='undefined')return String(SUMMARY_PERIOD||'').toLowerCase();}catch(_){}
    return '';
  }
  function selectedSummaryText(){
    var el=document.getElementById('summary-period-select')||document.querySelector('#p-summary select.period-select-inline,#p-summary select');
    if(!el)return '';
    try{return String(el.options[el.selectedIndex].text||'').toLowerCase();}catch(_){return '';}
  }
  function isCalendarYear(){
    var p=periodKey().replace(/[\s_-]+/g,'');
    if(p==='cy'||p==='currentyear'||p==='calendaryear'||p==='currentcy')return true;
    return /calendar\s+year|this\s+calendar\s+year|(^|\s)cy($|\s)/.test(selectedSummaryText());
  }
  function isDashboardBars(opts){
    return !!(opts&&opts.primaryBars&&opts.secondaryBarsInPrimary&&opts.primaryLabel==='Gross Revenue'&&opts.secondaryLabel==='Gross Profit');
  }
  function loadingHandoffActive(){
    try{if(typeof _realLayoutLoading!=='undefined'&&_realLayoutLoading)return true;}catch(_){}
    var body=document.body;if(body&&body.classList.contains('rt-data-loading-active'))return true;
    var page=document.getElementById('p-summary');
    return !!(page&&(page.getAttribute('aria-busy')==='true'||page.classList.contains('rt-loading')));
  }
  function isVisible(svg){
    if(!svg||!svg.isConnected)return false;
    var r;try{r=svg.getBoundingClientRect();}catch(_){r=null;}
    return !!(r&&r.width>80&&r.height>80);
  }

  function installStyles(){
    var old=document.getElementById('rt-cy-forecast-sequence-css');if(old)old.remove();
    var s=document.createElement('style');s.id='rt-cy-forecast-sequence-css';
    s.textContent='\
#p-summary svg.rt-cy-forecast-sequence .rt-chart-forecast-shell{animation:none!important;transform-box:fill-box;transform-origin:50% 100%;will-change:transform,opacity}\
#p-summary svg.rt-cy-forecast-sequence .rt-chart-forecast-shell.rt-cy-forecast-waiting{opacity:0!important}\
@media(prefers-reduced-motion:reduce){#p-summary svg.rt-cy-forecast-sequence .rt-chart-forecast-shell{transform:none!important;opacity:1!important}}';
    document.head.appendChild(s);
  }
  installStyles();

  function cancelSequence(svg){
    if(!svg)return;
    var timers=svg.__rtCyForecastTimers||[];
    timers.forEach(function(t){clearTimeout(t);});svg.__rtCyForecastTimers=[];
  }
  function settle(svg){
    if(!svg)return;
    cancelSequence(svg);
    svg.classList.remove('rt-cy-forecast-sequence');
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-chart-forecast-shell'),function(shell){
      shell.classList.remove('rt-cy-forecast-waiting');
      shell.style.removeProperty('animation');shell.style.removeProperty('opacity');shell.style.removeProperty('transform');
      shell.style.removeProperty('transform-origin');shell.style.removeProperty('transform-box');
    });
  }
  function startRatio(shell){
    var raw='';try{raw=shell.style.getPropertyValue('--rt-forecast-start')||getComputedStyle(shell).getPropertyValue('--rt-forecast-start');}catch(_){}
    var v=parseFloat(raw);return isFinite(v)?clamp(.05,v,.96):.55;
  }
  function mainActualEnd(svg){
    var maxDelay=0,found=false;
    var actual=svg.querySelectorAll('.rt-chart-primary-bar:not(.rt-chart-forecast-shell),.rt-chart-primary-actual,.rt-chart-profit-actual');
    Array.prototype.forEach.call(actual,function(el){
      var raw='';try{raw=el.style.getPropertyValue('--rt-bar-delay');}catch(_){}
      var d=parseFloat(raw);if(isFinite(d)){found=true;maxDelay=Math.max(maxDelay,d);}
    });
    /* Production Revenue is 590ms; Profit is 500ms with an 86ms offset.
       650ms safely covers either without adding dead time to the interaction. */
    return found?maxDelay+650:FALLBACK_MAIN_MS;
  }
  function stepEase(q){return 1-Math.pow(1-clamp(0,q,1),2.05);}

  function runSequence(svg){
    if(!svg||!svg.isConnected)return;
    var shells=Array.prototype.slice.call(svg.querySelectorAll('.rt-chart-forecast-shell'));
    if(!shells.length){svg.classList.remove('rt-cy-forecast-sequence');return;}
    if(reducedMotion()){settle(svg);return;}

    cancelSequence(svg);svg.classList.add('rt-cy-forecast-sequence');
    var states=shells.map(function(shell){
      try{shell.getAnimations().forEach(function(a){a.cancel();});}catch(_){}
      var start=startRatio(shell);
      shell.classList.add('rt-cy-forecast-waiting');
      shell.style.animation='none';shell.style.opacity='0';shell.style.transformBox='fill-box';shell.style.transformOrigin='50% 100%';shell.style.transform='scaleY('+start.toFixed(3)+')';
      return {el:shell,start:start};
    });

    var begin=mainActualEnd(svg)+AFTER_ACTUAL_GAP;
    var timers=svg.__rtCyForecastTimers=[];
    timers.push(setTimeout(function(){
      states.forEach(function(st){
        if(!st.el||!st.el.isConnected)return;
        st.el.classList.remove('rt-cy-forecast-waiting');
        st.el.style.opacity='.22';
      });
      for(var step=1;step<=STEPS;step++)(function(stepNo){
        timers.push(setTimeout(function(){
          var q=stepNo/STEPS,e=stepEase(q);
          states.forEach(function(st,index){
            if(!st.el||!st.el.isConnected)return;
            var local=clamp(0,q-(index*.018),1),le=stepEase(local);
            var scale=st.start+(1-st.start)*le;
            st.el.style.transform='scaleY('+scale.toFixed(4)+')';
            st.el.style.opacity=String((.22+.78*e).toFixed(3));
          });
          if(stepNo===STEPS){
            timers.push(setTimeout(function(){
              states.forEach(function(st){if(st.el&&st.el.isConnected){st.el.style.removeProperty('transform');st.el.style.removeProperty('opacity');}});
              svg.classList.add('rt-cy-forecast-complete');
            },80));
          }
        },stepNo*STEP_MS));
      })(step);
    },begin));
  }

  function prepareWhenReady(svg,attempt){
    attempt=attempt||0;
    if(!svg||!svg.isConnected)return;
    if((loadingHandoffActive()||!isVisible(svg))&&attempt<32){
      var timers=svg.__rtCyForecastTimers||(svg.__rtCyForecastTimers=[]);
      timers.push(setTimeout(function(){prepareWhenReady(svg,attempt+1);},80));
      return;
    }
    runSequence(svg);
  }

  var renderBeforeForecastSequence=_renderChartInto;
  _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
    var out=renderBeforeForecastSequence.apply(this,arguments);
    if(!isDashboardBars(opts))return out;
    if(!isCalendarYear()){settle(svgEl);return out;}
    prepareWhenReady(svgEl,0);
    return out;
  };

  /* The first dashboard render can precede this late presentation layer. If a
     CY forecast shell is already present, sequence it once after handoff. */
  try{
    var existing=document.getElementById('summary-chart-svg')||document.getElementById('summary-chart-svg-mobile');
    if(existing&&isCalendarYear()&&existing.querySelector('.rt-chart-forecast-shell'))prepareWhenReady(existing,0);
  }catch(_){}
})();
