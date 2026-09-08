/* RETRADE chart motion + adaptive forecast pass v1.4.49
 * Presentation-only layer loaded after chart-polish.js.
 *
 * Command Centre
 * - 7d + 30d use daily detail (30d rebuilt here; 7d already canonical)
 * - short operational ranges show ACTUALS ONLY: no forecast on 7/30/60/90/FY
 * - Calendar Year may retain the existing forecast treatment
 * - refunds are isolated red event dots, never a connecting trend
 * - short, capped, left-to-right bar motion
 *
 * Sales
 * - current-month forecast = actual-to-date + expected remainder
 * - expected remainder learns weekday shape, recent level/trend and same-month
 *   seasonality; older years naturally carry less weight
 * - current-month momentum gains influence as the month progresses
 * - revenue and net profit are projected independently
 * - an uncertainty range narrows as the month is completed and history grows
 * - mobile month labels are collision-managed (e.g. no "FebMar")
 * - chart -> actual point -> forecast remains one coherent motion sequence
 *
 * Accounting, sync, inventory lifecycle and persisted data are untouched.
 */
(function(){
  'use strict';

  var NS='http://www.w3.org/2000/svg';
  var EASE='cubic-bezier(.22,.61,.36,1)';
  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function clamp(min,v,max){return Math.max(min,Math.min(max,v));}
  function reducedMotion(){
    try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
  }
  function money(v,decimals){
    v=num(v);var neg=v<0,a=Math.abs(v);
    var s='£'+a.toLocaleString('en-GB',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
    return (neg?'−':'')+s;
  }
  function compactMoney(v){
    v=num(v);var neg=v<0,a=Math.abs(v),s;
    if(a>=1000000){var m=a/1000000;s='£'+m.toFixed(m>=10||Math.abs(m-Math.round(m))<.01?0:1)+'m';}
    else if(a>=1000){var k=a/1000;s='£'+k.toFixed(k>=10||Math.abs(k-Math.round(k))<.01?0:1)+'k';}
    else s='£'+Math.round(a);
    return (neg?'−':'')+s;
  }
  function dateFromISO(ds){
    var p=String(ds||'').split('-');
    return p.length===3?new Date(Number(p[0]),Number(p[1])-1,Number(p[2]),12,0,0,0):new Date(NaN);
  }
  function isoDate(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function dateAdd(ds,days){var d=dateFromISO(ds);d.setDate(d.getDate()+days);return isoDate(d);}
  function todayISO(){return isoDate(new Date());}
  function shortDate(ds){var p=String(ds||'').split('-');return p.length===3?(Number(p[1])+'/'+Number(p[2])):String(ds||'');}
  function dayFraction(){
    var d=new Date(),sec=d.getHours()*3600+d.getMinutes()*60+d.getSeconds();
    return clamp(.02,sec/86400,.995);
  }
  function monthProgress(){
    var now=new Date(),dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    return clamp(.025,((now.getDate()-1)+dayFraction())/dim,1);
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
  function isCalendarYearDashboard(){
    var p=periodKey();
    if(p==='cy'||p==='current_year'||p==='calendar_year'||p==='current_cy'||p==='calendar-year')return true;
    var txt=selectedSummaryText();
    return /(^|\s)cy($|\s)|calendar\s+year|this\s+calendar\s+year/.test(txt);
  }
  function isDashboardBars(opts){
    return !!(opts&&opts.primaryBars&&opts.secondaryBarsInPrimary&&opts.primaryLabel==='Gross Revenue'&&opts.secondaryLabel==='Gross Profit');
  }
  function parseIndex(el){
    if(!el)return -1;var s='';try{s=el.style.getPropertyValue('--bar-i');}catch(_){}
    var i=parseInt(s,10);return isFinite(i)?i:-1;
  }

  function installStyles(){
    var old=document.getElementById('rt-chart-motion-v1440');if(old)old.remove();
    if(document.getElementById('rt-chart-motion-v1441'))return;
    var s=document.createElement('style');s.id='rt-chart-motion-v1441';
    s.textContent='\
/* Refunds are events, not a continuous state. */\
#p-summary .summary-chart-legend .legend-event-mark{display:inline-block!important;width:7px!important;height:7px!important;background:var(--red)!important;border:0!important;border-radius:50%!important;opacity:.92!important;}\
#p-summary .rt-chart-refund-trend{display:none!important;}\
#p-summary .rt-chart-refund-dot{fill:var(--red);stroke:var(--surface-1);stroke-width:1.15;opacity:.9;vector-effect:non-scaling-stroke;}\
/* Calm operational motion. Long daily series use JS-capped per-bar delay. */\
@keyframes rtRevenueBarV1441{from{transform:scaleY(.02);opacity:.12}to{transform:scaleY(1);opacity:1}}\
@keyframes rtProfitBarV1441{from{transform:scaleY(.02);opacity:.08}to{transform:scaleY(1);opacity:1}}\
@keyframes rtForecastGrowV1441{from{transform:scaleY(var(--rt-forecast-start,.55));opacity:.24}to{transform:scaleY(1);opacity:1}}\
@keyframes rtRefundDotV1441{from{opacity:0;transform:scale(.5)}to{opacity:.9;transform:scale(1)}}\
#p-summary svg.rt-chart-draw .rt-chart-primary-bar:not(.rt-chart-profit-bar):not(.rt-chart-forecast-shell),\
#p-summary svg.rt-chart-draw .rt-chart-primary-actual{animation:rtRevenueBarV1441 590ms '+EASE+' both!important;animation-delay:var(--rt-bar-delay,0ms)!important;}\
#p-summary svg.rt-chart-draw .rt-chart-profit-bar:not(.rt-chart-forecast-shell),\
#p-summary svg.rt-chart-draw .rt-chart-profit-actual{animation:rtProfitBarV1441 500ms '+EASE+' both!important;animation-delay:calc(var(--rt-bar-delay,0ms) + 86ms)!important;}\
#p-summary svg.rt-chart-draw .rt-chart-forecast-shell{animation:rtForecastGrowV1441 450ms '+EASE+' both!important;animation-delay:calc(var(--rt-bar-delay,0ms) + 390ms)!important;}\
#p-summary svg.rt-chart-draw .rt-chart-refund-dot{transform-box:fill-box;transform-origin:center;animation:rtRefundDotV1441 220ms ease-out both!important;animation-delay:var(--rt-refund-delay,470ms)!important;}\
/* Sales forecast language: filled = achieved, hollow = projected finish. */\
#p-monthly .rt-sales-actual-dot{stroke:var(--surface-1);stroke-width:1.55;vector-effect:non-scaling-stroke;}\
#p-monthly .rt-sales-forecast-ring{fill:var(--surface-1);stroke-width:1.9;vector-effect:non-scaling-stroke;opacity:.98;}\
#p-monthly .rt-sales-forecast-label,#p-monthly .rt-sales-range-label{font-family:var(--font-body);fill:var(--text-tertiary);font-weight:600;letter-spacing:.01em;}\
#p-monthly .rt-sales-range-label{font-weight:500;opacity:.82;}\
@keyframes rtSalesActualIn{from{opacity:0;transform:scale(.66)}to{opacity:1;transform:scale(1)}}\
@keyframes rtSalesForecastIn{from{opacity:0;transform:scale(.68)}to{opacity:1;transform:scale(1)}}\
#p-monthly svg.rt-chart-draw .rt-sales-actual-dot{transform-box:fill-box;transform-origin:center;animation:rtSalesActualIn 220ms ease-out both;animation-delay:690ms;}\
#p-monthly svg.rt-chart-draw .rt-sales-forecast-ring,#p-monthly svg.rt-chart-draw .rt-sales-forecast-label,#p-monthly svg.rt-chart-draw .rt-sales-range-label{transform-box:fill-box;transform-origin:center;animation:rtSalesForecastIn 300ms ease-out both;animation-delay:900ms;}\
#p-monthly .mf-fill{transform-origin:left center;will-change:transform;}\
#p-monthly .mf-val{font-variant-numeric:tabular-nums;}\
@media(prefers-reduced-motion:reduce){\
 #p-summary svg.rt-chart-draw .rt-chart-primary-bar,#p-summary svg.rt-chart-draw .rt-chart-actual-overlay,#p-summary svg.rt-chart-draw .rt-chart-forecast-shell,#p-summary svg.rt-chart-draw .rt-chart-refund-dot,\
 #p-monthly svg.rt-chart-draw .rt-sales-actual-dot,#p-monthly svg.rt-chart-draw .rt-sales-forecast-ring,#p-monthly svg.rt-chart-draw .rt-sales-forecast-label,#p-monthly svg.rt-chart-draw .rt-sales-range-label{animation:none!important;transform:none!important;opacity:1!important;}\
 #p-monthly .mf-fill{transition:none!important;transform:none!important;}\
}';
    document.head.appendChild(s);
  }
  installStyles();

  // -----------------------------------------------------------------------
  // Command Centre: 30 days is a genuinely daily operational view.
  // -----------------------------------------------------------------------
  function buildDaily30(){
    if(typeof getSummaryDateRange!=='function'||typeof getSaleEventsInRange!=='function'||typeof _saleBreakdown!=='function')return null;
    var tf=getSummaryDateRange();
    if(!tf||!tf.from||!tf.to)return null;
    var events;try{events=getSaleEventsInRange(tf.from,tf.to)||[];}catch(_){return null;}
    var byDay={};
    events.forEach(function(e){if(e&&e.saleDate)(byDay[e.saleDate]||(byDay[e.saleDate]=[])).push(e);});
    var labels=[],rev=[],profit=[],refunds=[],counts=[],handlers=[];
    for(var day=tf.from;;day=dateAdd(day,1)){
      var inDay=byDay[day]||[],r=0,p=0,rf=0,rc=0;
      inDay.forEach(function(e){
        if(e.isReturnAdjustment){rf+=Math.max(0,-num(e.salePrice));rc++;return;}
        var b;try{b=_saleBreakdown(e);}catch(_){b=null;}
        if(!b)return;
        r+=num(b.salePrice)+num(b.postage);p+=num(b.netProfit);
      });
      var label=shortDate(day);
      labels.push(label);rev.push(+r.toFixed(2));profit.push(+p.toFixed(2));refunds.push(+rf.toFixed(2));counts.push(rc);
      handlers.push(inDay.length?{fn:'showRangeSnapshot',args:[label,day,day]}:null);
      if(day===tf.to)break;
      if(labels.length>31)break;
    }
    return {labels:labels,rev:rev,profit:profit,refunds:refunds,counts:counts,handlers:handlers};
  }
  if(typeof renderSummaryChart==='function'){
    var _renderSummaryChartBeforeMotion=renderSummaryChart;
    renderSummaryChart=function(labels,revData,profitData,returnData,returnCounts,partialLast){
      var is30=false;try{is30=(typeof SUMMARY_PERIOD!=='undefined'&&SUMMARY_PERIOD==='30d');}catch(_){}
      if(is30){
        var d=buildDaily30();
        if(d&&d.labels.length){
          try{window.__chartClickHandlers=d.handlers;}catch(_){}
          return _renderSummaryChartBeforeMotion.call(this,d.labels,d.rev,d.profit,d.refunds,d.counts,partialLast);
        }
      }
      return _renderSummaryChartBeforeMotion.apply(this,arguments);
    };
  }

  // -----------------------------------------------------------------------
  // Adaptive Sales forecast model.
  // -----------------------------------------------------------------------
  function eventMetrics(ev){
    if(!ev)return {rev:0,profit:0};
    var b=null;try{if(typeof _saleBreakdown==='function')b=_saleBreakdown(ev)||null;}catch(_){}
    if(ev.isReturnAdjustment){
      var adj=num(ev.salePrice);
      var pr=(b&&isFinite(Number(b.netProfit)))?num(b.netProfit):adj;
      return {rev:adj,profit:pr};
    }
    if(!b)return {rev:0,profit:0};
    return {rev:num(b.salePrice)+num(b.postage),profit:num(b.netProfit)};
  }
  function historyRows(){
    if(typeof getSaleEventsInRange!=='function')return null;
    var today=todayISO(),end=dateAdd(today,-1),start=dateAdd(today,-1460),events;
    try{events=getSaleEventsInRange(start,end)||[];}catch(_){return null;}
    if(!events.length)return {rows:[],events:[]};
    var earliest=null,map={};
    events.forEach(function(ev){
      if(!ev||!ev.saleDate||ev.saleDate>end||ev.saleDate<start)return;
      if(!earliest||ev.saleDate<earliest)earliest=ev.saleDate;
      var row=map[ev.saleDate]||(map[ev.saleDate]={rev:0,profit:0});
      var m=eventMetrics(ev);row.rev+=m.rev;row.profit+=m.profit;
    });
    if(!earliest)return {rows:[],events:events};
    var rows=[];
    for(var ds=earliest;;ds=dateAdd(ds,1)){
      var d=dateFromISO(ds),r=map[ds]||{rev:0,profit:0};
      rows.push({date:ds,year:d.getFullYear(),month:d.getMonth(),dow:d.getDay(),rev:r.rev,profit:r.profit});
      if(ds===end)break;if(rows.length>1465)break;
    }
    return {rows:rows,events:events};
  }
  function weightedMeanRecent(rows,metric,maxDays,halfLife){
    if(!rows||!rows.length)return null;
    var slice=rows.slice(-maxDays),sum=0,w=0,n=slice.length;
    for(var i=0;i<n;i++){
      var age=n-1-i,ww=Math.pow(.5,age/halfLife);
      sum+=num(slice[i][metric])*ww;w+=ww;
    }
    return w?sum/w:null;
  }
  function simpleMean(vals){if(!vals.length)return null;var s=0;vals.forEach(function(v){s+=num(v);});return s/vals.length;}
  function stdDev(vals){
    if(!vals||vals.length<2)return 0;var m=simpleMean(vals),s=0;
    vals.forEach(function(v){var x=num(v)-m;s+=x*x;});return Math.sqrt(s/(vals.length-1));
  }
  function weekdayFactors(rows,metric){
    var recent=(rows||[]).slice(-364),sums=[0,0,0,0,0,0,0],counts=[0,0,0,0,0,0,0];
    recent.forEach(function(r){sums[r.dow]+=num(r[metric]);counts[r.dow]++;});
    var overall=simpleMean(recent.map(function(r){return num(r[metric]);}));
    var out=[1,1,1,1,1,1,1];
    if(overall===null||Math.abs(overall)<.01)return out;
    for(var i=0;i<7;i++){
      if(!counts[i])continue;
      var raw=(sums[i]/counts[i])/overall;
      out[i]=clamp(.55,1+(raw-1)*.62,1.65);
    }
    return out;
  }
  function seasonalSameMonth(rows,metric,month,currentYear){
    var byYear={},years=[];
    (rows||[]).forEach(function(r){
      if(r.month!==month||r.year>=currentYear)return;
      var a=byYear[r.year]||(byYear[r.year]=[]);a.push(num(r[metric]));
    });
    Object.keys(byYear).map(Number).sort(function(a,b){return b-a;}).forEach(function(y){years.push(y);});
    if(!years.length)return {mean:null,years:0};
    var sum=0,w=0;
    years.forEach(function(y,idx){
      var avg=simpleMean(byYear[y]);if(avg===null)return;
      var ww=Math.pow(.64,idx);sum+=avg*ww;w+=ww;
    });
    return {mean:w?sum/w:null,years:years.length};
  }
  function historyYears(rows){
    var seen={};(rows||[]).forEach(function(r){seen[r.year]=1;});return Object.keys(seen).length;
  }
  function expectedRemainder(rows,metric,actual){
    var now=new Date(),month=now.getMonth(),year=now.getFullYear(),dim=new Date(year,month+1,0).getDate();
    var elapsed=(now.getDate()-1)+dayFraction(),progress=clamp(.025,elapsed/dim,1);
    var recent28=weightedMeanRecent(rows,metric,56,20);
    var recent84=weightedMeanRecent(rows,metric,168,52);
    var base;
    if(recent28===null&&recent84===null)base=0;
    else if(recent28===null)base=recent84;
    else if(recent84===null)base=recent28;
    else base=recent28*.62+recent84*.38;

    var seas=seasonalSameMonth(rows,metric,month,year),seasonW=Math.min(.36,seas.years*.12);
    if(seas.mean!==null)base=base*(1-seasonW)+seas.mean*seasonW;

    var wd=weekdayFactors(rows,metric);
    var currentPace=elapsed>0?num(actual)/elapsed:base;
    var denom=Math.abs(base)>.5?base:(Math.abs(currentPace)>.5?currentPace:1);
    var momentumFactor=clamp(.35,currentPace/denom,2.4);
    var momentumW=clamp(.10,progress*.72,.72);

    var remainder=0,remainingEq=0,fracToday=Math.max(0,1-dayFraction());
    for(var day=now.getDate();day<=dim;day++){
      var d=new Date(year,month,day,12,0,0,0),portion=(day===now.getDate()?fracToday:1);
      if(portion<=0)continue;
      var expected=base*(wd[d.getDay()]||1);
      expected*=((1-momentumW)+momentumW*momentumFactor);
      if(metric==='rev'&&base>=0)expected=Math.max(-Math.abs(base)*.45,expected);
      remainder+=expected*portion;remainingEq+=portion;
    }

    var recentVals=(rows||[]).slice(-180).map(function(r){return num(r[metric]);});
    var sd=stdDev(recentVals),yrs=historyYears(rows),histDays=(rows||[]).length;
    var reliability=1.32-Math.min(histDays/365,1)*.18-Math.min(yrs/3,1)*.12;
    var statistical=1.28*sd*Math.sqrt(Math.max(0,remainingEq))*Math.max(.88,reliability);
    var modelPct=Math.max(.08,.25-Math.min(yrs,3)*.035)*(1-progress*.62);
    var model=Math.abs(remainder)*modelPct;
    var uncertainty=Math.sqrt(statistical*statistical+model*model);
    var score=progress*.55+Math.min(yrs/3,1)*.25+Math.min(histDays/365,1)*.12+Math.min(elapsed/14,1)*.08;
    var confidence=score>=.72?'High':score>=.42?'Medium':'Low';
    return {remainder:remainder,uncertainty:uncertainty,confidence:confidence,progress:progress,years:yrs,seasonYears:seas.years,historyDays:histDays};
  }
  function monthlyFallback(series,isRevenue){
    if(!series||!series.length)return {forecast:0,uncertainty:0,confidence:'Low'};
    var actual=num(series[series.length-1]),progress=monthProgress();
    var prior=series.slice(0,-1).map(num).slice(-6),sum=0,w=0;
    prior.forEach(function(v,i){var ww=i+1;sum+=v*ww;w+=ww;});
    var hist=w?sum/w:null,pace=actual/Math.max(.04,progress),paceW=clamp(.28,progress*.78,.78);
    var fc=hist===null?pace:(pace*paceW+hist*(1-paceW));
    if(isRevenue&&actual>=0)fc=Math.max(actual,fc);
    var spread=prior.length>1?stdDev(prior):Math.abs(fc-actual)*.5;
    return {forecast:fc,uncertainty:spread*(1-progress),confidence:progress>.7?'Medium':'Low'};
  }
  function salesForecast(revData,profitData,opts){
    if(!opts||opts.partialLast!==true||!revData||revData.length<1)return null;
    var last=revData.length-1,ar=num(revData[last]),ap=num(profitData[last]);
    var hist=historyRows(),rModel,pModel;
    if(hist&&hist.rows&&hist.rows.length>=21){
      rModel=expectedRemainder(hist.rows,'rev',ar);
      pModel=expectedRemainder(hist.rows,'profit',ap);
      var fr=ar+rModel.remainder,fp=ap+pModel.remainder;
      var rUnc=rModel.uncertainty,pUnc=pModel.uncertainty;
      return {
        rev:fr,profit:fp,actualRev:ar,actualProfit:ap,
        revLow:fr-rUnc,revHigh:fr+rUnc,profitLow:fp-pUnc,profitHigh:fp+pUnc,
        confidence:rModel.confidence,profitConfidence:pModel.confidence,
        years:rModel.years,seasonYears:rModel.seasonYears,progress:rModel.progress,
        method:'weekday + recent trend + seasonality + live-month momentum'
      };
    }
    var rf=monthlyFallback(revData,true),pf=monthlyFallback(profitData,false);
    return {
      rev:rf.forecast,profit:pf.forecast,actualRev:ar,actualProfit:ap,
      revLow:rf.forecast-rf.uncertainty,revHigh:rf.forecast+rf.uncertainty,
      profitLow:pf.forecast-pf.uncertainty,profitHigh:pf.forecast+pf.uncertainty,
      confidence:rf.confidence,profitConfidence:pf.confidence,years:0,seasonYears:0,progress:monthProgress(),method:'recent months + live-month pace'
    };
  }

  function baseLineGeometry(revData,profitData,opts){
    var W=opts.W,H=opts.H,pad=opts.pad,n=revData.length,innerW=W-pad.l-pad.r,innerH=H-pad.t-pad.b;
    var tert=(Array.isArray(opts.tertiaryData)&&!opts.tertiaryEvents)?opts.tertiaryData:[];
    var rawMax=Math.max.apply(Math,[0].concat(revData,profitData,tert).map(num));
    var rawMin=Math.min.apply(Math,[0].concat(revData,profitData,tert).map(num));
    function niceBound(v){v=Math.abs(v);if(v<=0)return 0;var mag=Math.pow(10,Math.floor(Math.log10(v))),norm=v/mag;return (norm<=1?1:norm<=2?2:norm<=5?5:10)*mag;}
    var yMax=niceBound(rawMax)||100,yMin=rawMin<0?-niceBound(rawMin):0;if(yMin===yMax){yMin=0;yMax=100;}
    var yr=(yMax-yMin)||1,step=n>1?innerW/(n-1):0;
    return {W:W,H:H,pad:pad,innerW:innerW,sx:function(i){return n>1?pad.l+i*step:pad.l+innerW/2;},sy:function(v){return pad.t+innerH-((num(v)-yMin)/yr)*innerH;}};
  }
  function svgCircle(x,y,r,fill,stroke,cls){
    var c=document.createElementNS(NS,'circle');c.setAttribute('class',cls);c.setAttribute('cx',x.toFixed(1));c.setAttribute('cy',y.toFixed(1));c.setAttribute('r',r);c.setAttribute('fill',fill);c.setAttribute('stroke',stroke||fill);return c;
  }
  function addSalesForecastOverlay(svgEl,labels,actualRev,actualProfit,fc,opts,forecastRev,forecastProfit){
    if(!svgEl||!fc||!labels.length)return;
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-so-far,.rt-sales-forecast-layer'),function(n){n.remove();});
    var g=baseLineGeometry(forecastRev,forecastProfit,opts),last=labels.length-1,x=g.sx(last),before=svgEl.querySelector('.rt-chart-scrub');
    var layer=document.createElementNS(NS,'g');layer.setAttribute('class','rt-sales-forecast-layer');
    layer.appendChild(svgCircle(x,g.sy(fc.actualRev),3.5,'var(--state-listed)','var(--state-listed)','rt-sales-actual-dot'));
    layer.appendChild(svgCircle(x,g.sy(fc.actualProfit),3.2,'var(--profit)','var(--profit)','rt-sales-actual-dot'));
    layer.appendChild(svgCircle(x,g.sy(fc.rev),4.4,'var(--surface-1)','var(--state-listed)','rt-sales-forecast-ring'));
    layer.appendChild(svgCircle(x,g.sy(fc.profit),4.0,'var(--surface-1)','var(--profit)','rt-sales-forecast-ring'));

    var y=Math.max(opts.pad.t+opts.fontSize,g.sy(fc.rev)-10),anchor=x>g.W-opts.pad.r-92?'end':'end';
    var t=document.createElementNS(NS,'text');t.setAttribute('class','rt-sales-forecast-label');t.setAttribute('x',(x-5).toFixed(1));t.setAttribute('y',y.toFixed(1));t.setAttribute('text-anchor',anchor);t.setAttribute('font-size',Math.max(10,Math.round(opts.fontSize*.9)));t.textContent='Forecast '+compactMoney(fc.rev);layer.appendChild(t);
    if(g.W>=560){
      var r=document.createElementNS(NS,'text');r.setAttribute('class','rt-sales-range-label');r.setAttribute('x',(x-5).toFixed(1));r.setAttribute('y',(y+14).toFixed(1));r.setAttribute('text-anchor','end');r.setAttribute('font-size',Math.max(9,Math.round(opts.fontSize*.78)));
      r.textContent='Likely '+compactMoney(fc.revLow)+'–'+compactMoney(fc.revHigh)+' · '+fc.confidence;layer.appendChild(r);
    }
    var title=document.createElementNS(NS,'title');
    title.textContent='Current month: Net Revenue '+money(fc.actualRev,2)+' achieved; '+money(fc.rev,2)+' forecast; likely '+money(fc.revLow,2)+' to '+money(fc.revHigh,2)+' ('+fc.confidence+' confidence). Net Profit '+money(fc.actualProfit,2)+' achieved; '+money(fc.profit,2)+' forecast. Model: '+fc.method+'.';
    layer.appendChild(title);
    svgEl.insertBefore(layer,before||null);
    svgEl.setAttribute('aria-label','Monthly net revenue and net profit with current-month forecast and confidence range');

    if(typeof _setupChartScrub==='function'){
      try{_setupChartScrub(svgEl,{W:g.W,pad:g.pad,innerW:g.innerW,n:labels.length,sx:g.sx,sy:g.sy,revData:actualRev,profitData:actualProfit,labels:labels,primaryColor:opts.primaryColor||'var(--state-listed)',secondaryColor:opts.secondaryColor||'var(--profit)',primaryLabel:opts.primaryLabel||'Net Revenue',secondaryLabel:opts.secondaryLabel||'Net Profit',tertiaryData:Array.isArray(opts.tertiaryData)?opts.tertiaryData:null,tertiaryColor:opts.tertiaryColor||'var(--red)',tertiaryLabel:opts.tertiaryLabel||'Refunds',tertiaryCounts:Array.isArray(opts.tertiaryCounts)?opts.tertiaryCounts:null,tertiaryEvents:!!opts.tertiaryEvents,tertiaryEventY:NaN,extraTooltipData:Array.isArray(opts.extraTooltipData)?opts.extraTooltipData:null,extraTooltipLabel:opts.extraTooltipLabel||'Gross Profit',extraTooltipColor:opts.extraTooltipColor||'var(--text-secondary)'});}catch(_){}
    }
  }

  function fixMonthlyAxisLabels(svgEl){
    if(!svgEl)return;
    var box;try{box=svgEl.getBoundingClientRect();}catch(_){box=null;}
    var width=box&&box.width?box.width:num(svgEl.getAttribute('width'));
    var all=Array.prototype.slice.call(svgEl.querySelectorAll('text'));
    var monthRE=/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\s+\d{2})?$/;
    var labels=all.filter(function(t){return monthRE.test(String(t.textContent||'').trim())&&isFinite(parseFloat(t.getAttribute('x')));});
    labels.forEach(function(t){t.style.display='';});
    if(width>=620||labels.length<3)return;
    labels.sort(function(a,b){return parseFloat(a.getAttribute('x'))-parseFloat(b.getAttribute('x'));});
    var minGap=width<430?44:40,kept=[];
    labels.forEach(function(t,i){
      var x=parseFloat(t.getAttribute('x'));
      if(i===0||i===labels.length-1){kept.push(t);return;}
      var prev=kept[kept.length-1],px=prev?parseFloat(prev.getAttribute('x')):-Infinity;
      if(x-px>=minGap)kept.push(t);else t.style.display='none';
    });
    var last=labels[labels.length-1],lastX=parseFloat(last.getAttribute('x'));
    var visible=labels.filter(function(t){return t.style.display!=='none'&&t!==last;});
    if(visible.length){
      var prev=visible[visible.length-1],prevX=parseFloat(prev.getAttribute('x'));
      if(lastX-prevX<minGap){prev.style.display='none';}
    }
  }

  function tuneDashboard(svgEl,n,opts,forecastAllowed){
    if(!svgEl||!n)return;
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-refund-trend'),function(p){p.remove();});
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-so-far'),function(t){t.remove();});
    if(!forecastAllowed){
      Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-forecast-label,.rt-chart-actual-overlay'),function(n){n.remove();});
    }
    var isDaily30=(periodKey()==='30d'&&n>=24);
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-primary-bar'),function(rect){
      var i=parseIndex(rect);if(i<0)return;var stagger=isDaily30?17:(n>12?25:44);rect.style.setProperty('--rt-bar-delay',(i*stagger)+'ms');
    });
    Array.prototype.forEach.call(svgEl.querySelectorAll('.rt-chart-forecast-shell'),function(shell){
      var i=parseIndex(shell),isProfit=shell.classList.contains('rt-chart-profit-bar'),candidates=svgEl.querySelectorAll(isProfit?'.rt-chart-profit-actual':'.rt-chart-primary-actual'),actual=null;
      Array.prototype.some.call(candidates,function(c){if(parseIndex(c)===i){actual=c;return true;}return false;});
      if(actual){var sh=Math.max(.1,num(shell.getAttribute('height'))),ah=Math.max(.1,num(actual.getAttribute('height')));shell.style.setProperty('--rt-forecast-start',clamp(.04,ah/sh,3).toFixed(3));}
    });
    var dots=svgEl.querySelectorAll('.rt-chart-refund-dot');Array.prototype.forEach.call(dots,function(d,i){d.style.setProperty('--rt-refund-delay',(470+i*30)+'ms');});
    if(!forecastAllowed)svgEl.setAttribute('aria-label','Gross revenue and gross profit actuals with refund events');
  }

  if(typeof _renderChartInto==='function'){
    var _renderBeforeMotion=_renderChartInto;
    _renderChartInto=function(svgEl,labels,revData,profitData,handlers,opts){
      var dashboard=isDashboardBars(opts);
      if(dashboard){
        var allowForecast=isCalendarYearDashboard(),cleanOpts=Object.assign({},opts);
        if(!allowForecast)cleanOpts.partialLast=false;
        var out=_renderBeforeMotion.call(this,svgEl,labels,revData,profitData,handlers,cleanOpts);
        tuneDashboard(svgEl,labels.length,cleanOpts,allowForecast);
        return out;
      }

      var isSales=!!(svgEl&&svgEl.id==='monthly-profitability-svg'&&opts&&opts.primaryLabel==='Net Revenue'&&opts.secondaryLabel==='Net Profit');
      if(isSales){
        var fc=salesForecast(revData,profitData,opts);
        if(fc&&isFinite(fc.rev)&&isFinite(fc.profit)){
          var actualR=revData.slice(),actualP=profitData.slice(),forecastR=revData.slice(),forecastP=profitData.slice(),last=forecastR.length-1;
          forecastR[last]=fc.rev;forecastP[last]=fc.profit;
          var result=_renderBeforeMotion.call(this,svgEl,labels,forecastR,forecastP,handlers,opts);
          addSalesForecastOverlay(svgEl,labels,actualR,actualP,fc,opts,forecastR,forecastP);
          fixMonthlyAxisLabels(svgEl);
          window.__rtSalesMotionToken=(window.__rtSalesMotionToken||0)+1;
          window.__rtSalesMotionAt=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
          return result;
        }
        var plain=_renderBeforeMotion.apply(this,arguments);fixMonthlyAxisLabels(svgEl);
        window.__rtSalesMotionToken=(window.__rtSalesMotionToken||0)+1;window.__rtSalesMotionAt=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
        return plain;
      }
      return _renderBeforeMotion.apply(this,arguments);
    };
  }

  var _moneyHost=null,_moneyPeriod=null,_moneyMotionSerial=0;
  function animateMoneyFlow(host){
    if(!host||reducedMotion())return;
    var token=++_moneyMotionSerial,fillDur=260,stagger=22;
    var fills=host.querySelectorAll('.mf-fill');

    /* Values are information, not decoration: keep the final £ figures readable
       immediately. Only the bar fill gets a short compositor transform. The old
       version hid values at £0, waited 660ms, then animated width for 650ms,
       causing delayed readability plus layout work on every transition frame. */
    Array.prototype.forEach.call(fills,function(fill,i){
      fill.style.transition='none';
      fill.style.transform='scaleX(.04)';
      fill.style.opacity='.72';
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          if(token!==_moneyMotionSerial||!fill.isConnected)return;
          fill.style.transition='transform '+fillDur+'ms '+EASE+' '+(i*stagger)+'ms,opacity 150ms ease-out '+(i*stagger)+'ms';
          fill.style.transform='scaleX(1)';
          fill.style.opacity='1';
        });
      });
    });
  }
  if(typeof renderMonthlyMoneyFlow==='function'){
    var _renderMoneyBeforeMotion=renderMonthlyMoneyFlow;
    renderMonthlyMoneyFlow=function(){
      var ret=_renderMoneyBeforeMotion.apply(this,arguments),host=document.getElementById('monthly-money-flow'),key='';
      try{key=(typeof MONTHLY_PERIOD!=='undefined'?String(MONTHLY_PERIOD):'');}catch(_){}
      var should=!!host&&(host!==_moneyHost||key!==_moneyPeriod);
      _moneyHost=host;_moneyPeriod=key;if(should)animateMoneyFlow(host);return ret;
    };
  }

  window.__RT_CHART_MOTION_BUILD='20260907-chart-motion-13';
})();