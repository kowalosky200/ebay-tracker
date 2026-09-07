/* RETRADE dashboard drill-down coherence.
 *
 * Command Centre details must reconcile to the exact number the user touched.
 * This layer intentionally reuses the canonical sale-event accounting source:
 *   Gross Revenue = sale price + seller postage income, sales only
 *   Gross Profit  = sale-event net profit, sales only, before refunds/overheads
 *   Gross Margin  = total Gross Profit / total Gross Revenue (weighted)
 *
 * Dashboard chart taps are resolved from the tap X-position rather than the DOM
 * target, which makes iOS taps deterministic. FY month bars drill into that
 * chart datapoint only instead of opening the broader month-management snapshot.
 *
 * No accounting rules, persistence, sync, lifecycle or forecast maths live here.
 */
(function(){
  'use strict';

  var BUILD='20260907-dashboard-details-1';

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function money(v){
    try{if(typeof fmt==='function')return fmt(num(v));}catch(_){}
    return '£'+num(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function safe(s){
    try{if(typeof esc==='function')return esc(String(s==null?'':s));}catch(_){}
    return String(s==null?'':s).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function summaryRange(){try{return _periodDateRange(SUMMARY_PERIOD)||{};}catch(_){return {};}}
  function summaryLabel(){
    var labels={'7d':'Last 7 days','30d':'Last 30 days','60d':'Last 60 days','90d':'Last 90 days','current_fy':'Current FY','prev_fy':'Previous FY'};
    try{return labels[SUMMARY_PERIOD]||String(SUMMARY_PERIOD||'Selected period');}catch(_){return 'Selected period';}
  }
  function grossStats(){
    try{return calcSummaryGrossStats();}catch(_){
      var r=summaryRange(),sales=saleEvents(r),revenue=0,profit=0;
      sales.forEach(function(ev){var b=breakdown(ev);revenue+=num(b.salePrice)+num(b.postage);profit+=num(b.netProfit);});
      revenue=+revenue.toFixed(2);profit=+profit.toFixed(2);
      return {revenue:revenue,profit:profit,margin:revenue?+((profit/revenue)*100).toFixed(1):0,soldCount:sales.length};
    }
  }
  function allEvents(from,to){try{return getSaleEventsInRange(from,to)||[];}catch(_){return [];}}
  function saleEvents(range){
    range=range||summaryRange();
    return allEvents(range.from,range.to).filter(function(ev){return ev&&!ev.isReturnAdjustment;});
  }
  function breakdown(ev){try{return _saleBreakdown(ev)||{};}catch(_){return {};}}
  function saleNo(ev){return Math.max(1,num(ev&&ev.sale)||1);}
  function saleMeta(ev,b){
    var parts=['Sale '+saleNo(ev)];
    if(ev&&ev.saleDate)parts.push(ev.saleDate);
    if(b&&b.platform)parts.push(b.platform);
    return parts.join(' · ');
  }
  function saleMargin(b){var r=num(b.salePrice)+num(b.postage);return r?num(b.netProfit)/r*100:null;}
  function components(sales){
    var c={goods:0,postage:0,bpf:0,promo:0,shipping:0,packaging:0,itemCost:0,parts:0,listing:0,partner:0,revenue:0,costs:0,profit:0};
    sales.forEach(function(ev){
      var b=breakdown(ev);
      c.goods+=num(b.salePrice);c.postage+=num(b.postage);c.bpf+=num(b.bpf);c.promo+=num(b.promoFee);
      c.shipping+=num(b.shipping);c.packaging+=num(b.packaging);c.itemCost+=num(b.itemCost);c.parts+=num(b.parts);
      c.listing+=num(b.listingFee);c.partner+=num(b.partnerSplit);c.costs+=num(b.totalCosts);c.profit+=num(b.netProfit);
    });
    c.revenue=c.goods+c.postage;
    Object.keys(c).forEach(function(k){c[k]=+num(c[k]).toFixed(2);});
    return c;
  }
  function detailLine(label,value,opts){
    opts=opts||{};
    return '<div style="display:flex;justify-content:space-between;gap:14px;padding:7px 0;'+(opts.total?'font-weight:750;border-top:1px solid var(--border);margin-top:3px;padding-top:10px':'border-bottom:1px solid var(--border)')+';font-size:'+(opts.total?'13px':'12px')+'">'
      +'<span style="color:'+(opts.total?'var(--text)':'var(--text-secondary)')+'">'+safe(label)+'</span>'
      +'<strong style="color:'+(opts.color||'var(--text)')+'">'+value+'</strong></div>';
  }
  function hero(label,value,color,sub){
    return '<div style="margin-bottom:14px;background:var(--surface2);border-radius:11px;padding:14px 15px">'
      +'<div style="display:flex;align-items:center;gap:12px"><div class="stat-num" style="color:'+color+'">'+value+'</div>'
      +'<div><div style="font-size:10px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">'+safe(label)+'</div>'
      +'<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;line-height:1.45">'+sub+'</div></div></div></div>';
  }
  function sectionTitle(text){return '<div style="font-size:10px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin:15px 0 7px">'+safe(text)+'</div>';}
  function row(ev,body,right,border){
    var item=ev&&ev.item||{},month=ev&&ev.month||'',id=item.id||'';
    return '<div style="padding:11px 12px;background:var(--surface2);border-radius:9px;margin-bottom:8px;cursor:pointer;border-left:3px solid '+border+'" onclick="openItemDetail(\''+safe(month)+'\',\''+safe(id)+'\')">'
      +'<div style="display:flex;align-items:flex-start;gap:10px"><div style="flex:1;min-width:0">'
      +'<div style="font-weight:650;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+safe(item.item||'Item')+'</div>'+body+'</div>'
      +'<div style="font-size:13px;font-weight:750;font-family:var(--font-mono);white-space:nowrap">'+right+'</div></div></div>';
  }
  function empty(title){openPanel(title,'<div style="text-align:center;padding:32px 0;color:var(--muted);font-size:13px">No sales in this period.</div>',false);}

  function showGrossRevenueBreakdown(){
    var sales=saleEvents(),stats=grossStats();
    if(!sales.length){empty('Gross Revenue');return;}
    var c=components(sales),exact=num(stats.revenue);
    var recon='<div style="background:var(--surface2);border-radius:10px;padding:11px 14px;margin-bottom:14px">'
      +'<div style="font-size:10px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Reconciliation</div>'
      +detailLine('Item sale prices',money(c.goods))+detailLine('Buyer postage received',money(c.postage))
      +detailLine('Gross Revenue',money(exact),{total:true,color:'var(--state-listed)'})
      +'<div style="font-size:10.5px;color:var(--muted);margin-top:8px">Sales only. Refunds are deliberately separate from this headline.</div></div>';
    var rows=sales.slice().sort(function(a,b){return String(b.saleDate||'').localeCompare(String(a.saleDate||''));}).map(function(ev){
      var b=breakdown(ev),rev=num(b.salePrice)+num(b.postage);
      var sub='<div style="font-size:11px;color:var(--muted);margin-top:3px">'+safe(saleMeta(ev,b))+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Sale '+money(b.salePrice)+(num(b.postage)?' + postage '+money(b.postage):'')+'</div>';
      return row(ev,sub,money(rev),'var(--state-listed)');
    }).join('');
    openPanel('Gross Revenue — Breakdown',hero('Gross Revenue',money(exact),'var(--state-listed)',sales.length+' sale transaction'+(sales.length===1?'':'s')+' · '+safe(summaryLabel()))+recon+sectionTitle('Sales making up Gross Revenue')+rows,false);
  }

  function showGrossProfitBreakdown(){
    var sales=saleEvents(),stats=grossStats();
    if(!sales.length){empty('Gross Profit');return;}
    var c=components(sales),exact=num(stats.profit),costColor=c.costs>0?'var(--red)':'var(--text)';
    var recon='<div style="background:var(--surface2);border-radius:10px;padding:11px 14px;margin-bottom:14px">'
      +'<div style="font-size:10px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">How Gross Revenue becomes Gross Profit</div>'
      +detailLine('Gross Revenue',money(c.revenue),{color:'var(--state-listed)'})
      +(c.itemCost?detailLine('Item cost','−'+money(c.itemCost),{color:costColor}):'')
      +(c.parts?detailLine('Parts / repairs','−'+money(c.parts),{color:costColor}):'')
      +(c.bpf?detailLine('Platform fees','−'+money(c.bpf),{color:costColor}):'')
      +(c.promo?detailLine('Promotion / boost fees','−'+money(c.promo),{color:costColor}):'')
      +(c.shipping?detailLine('Shipping paid','−'+money(c.shipping),{color:costColor}):'')
      +(c.packaging?detailLine('Packaging','−'+money(c.packaging),{color:costColor}):'')
      +(c.listing?detailLine('Listing fees','−'+money(c.listing),{color:costColor}):'')
      +(c.partner?detailLine('Partner share','−'+money(c.partner),{color:costColor}):'')
      +detailLine('Gross Profit',money(exact),{total:true,color:exact>=0?'var(--green)':'var(--red)'})
      +'<div style="font-size:10.5px;color:var(--muted);margin-top:8px">Exactly the Dashboard definition: sale-level profit before refunds and general overheads.</div></div>';
    var rows=sales.slice().sort(function(a,b){return String(b.saleDate||'').localeCompare(String(a.saleDate||''));}).map(function(ev){
      var b=breakdown(ev),rev=num(b.salePrice)+num(b.postage),p=num(b.netProfit),m=saleMargin(b);
      var sub='<div style="font-size:11px;color:var(--muted);margin-top:3px">'+safe(saleMeta(ev,b))+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Revenue '+money(rev)+' · costs '+money(b.totalCosts)+(m!==null?' · '+m.toFixed(1)+'% margin':'')+'</div>';
      return row(ev,sub,money(p),p>=0?'var(--green)':'var(--red)');
    }).join('');
    openPanel('Gross Profit — Breakdown',hero('Gross Profit',money(exact),exact>=0?'var(--green)':'var(--red)',sales.length+' sale transaction'+(sales.length===1?'':'s')+' · before refunds and overheads')+recon+sectionTitle('Sale profit making up Gross Profit')+rows,false);
  }

  function showGrossMarginBreakdown(){
    var sales=saleEvents(),stats=grossStats();
    if(!sales.length){empty('Gross Margin');return;}
    var revenue=num(stats.revenue),profit=num(stats.profit),exact=revenue?profit/revenue*100:0,rounded=Math.round(num(stats.margin));
    var formula='<div style="background:var(--surface2);border-radius:10px;padding:11px 14px;margin-bottom:14px">'
      +'<div style="font-size:10px;font-weight:750;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Formula</div>'
      +detailLine('Gross Profit',money(profit),{color:profit>=0?'var(--green)':'var(--red)'})
      +detailLine('Gross Revenue',money(revenue),{color:'var(--state-listed)'})
      +detailLine('Gross Margin',rounded+'%',{total:true,color:'var(--accent)'})
      +'<div style="font-size:10.5px;color:var(--muted);margin-top:8px">'+money(profit)+' ÷ '+money(revenue)+' = '+exact.toFixed(1)+'% exact, shown as '+rounded+'% on the Dashboard. This is a revenue-weighted overall margin, not the average of each item\'s margin.</div></div>';
    var rows=sales.slice().sort(function(a,b){return String(b.saleDate||'').localeCompare(String(a.saleDate||''));}).map(function(ev){
      var b=breakdown(ev),rev=num(b.salePrice)+num(b.postage),p=num(b.netProfit),m=rev?p/rev*100:null;
      var sub='<div style="font-size:11px;color:var(--muted);margin-top:3px">'+safe(saleMeta(ev,b))+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">'+money(p)+' profit ÷ '+money(rev)+' revenue</div>';
      return row(ev,sub,m===null?'—':m.toFixed(1)+'%',m!==null&&m>=0?'var(--accent)':'var(--red)');
    }).join('');
    openPanel('Gross Margin — Breakdown',hero('Gross Margin',rounded+'%','var(--accent)',money(profit)+' Gross Profit ÷ '+money(revenue)+' Gross Revenue · '+safe(summaryLabel()))+formula+sectionTitle('Sale margins contributing to the weighted total')+rows,false);
  }

  function showDashboardRangeBreakdown(label,fromDate,toDate){
    var events=allEvents(fromDate,toDate),sales=events.filter(function(ev){return !ev.isReturnAdjustment;}),returns=events.filter(function(ev){return ev.isReturnAdjustment;});
    if(!events.length){openPanel(label,'<div style="text-align:center;padding:32px 0;color:var(--muted);font-size:13px">No sales or refund activity in this datapoint.</div>',false);return;}
    var c=components(sales),refunds=0;
    returns.forEach(function(ev){refunds+=Math.max(0,-num(ev.salePrice));});refunds=+refunds.toFixed(2);
    var margin=c.revenue?c.profit/c.revenue*100:0;
    var tiles='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'
      +'<div style="background:var(--surface2);border-radius:10px;padding:11px 12px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Gross Revenue</div><div style="font-size:18px;font-weight:750;color:var(--state-listed);margin-top:3px">'+money(c.revenue)+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">'+sales.length+' sale'+(sales.length===1?'':'s')+'</div></div>'
      +'<div style="background:var(--surface2);border-radius:10px;padding:11px 12px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Gross Profit</div><div style="font-size:18px;font-weight:750;color:'+(c.profit>=0?'var(--green)':'var(--red)')+';margin-top:3px">'+money(c.profit)+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">'+margin.toFixed(1)+'% margin</div></div>'
      +'<div style="background:var(--surface2);border-radius:10px;padding:11px 12px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Refunds</div><div style="font-size:18px;font-weight:750;color:'+(refunds?'var(--red)':'var(--text)')+';margin-top:3px">'+money(refunds)+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">'+returns.length+' event'+(returns.length===1?'':'s')+'</div></div>'
      +'<div style="background:var(--surface2);border-radius:10px;padding:11px 12px"><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Range</div><div style="font-size:13px;font-weight:700;color:var(--text);margin-top:4px">'+safe(fromDate===toDate?fromDate:(fromDate+' → '+toDate))+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Exact chart datapoint</div></div>'
      +'</div>';
    var saleRows=sales.slice().sort(function(a,b){return String(b.saleDate||'').localeCompare(String(a.saleDate||''));}).map(function(ev){
      var b=breakdown(ev),rev=num(b.salePrice)+num(b.postage),p=num(b.netProfit),m=rev?p/rev*100:null;
      var sub='<div style="font-size:11px;color:var(--muted);margin-top:3px">'+safe(saleMeta(ev,b))+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Revenue '+money(rev)+' · profit '+money(p)+(m!==null?' · '+m.toFixed(1)+'% margin':'')+'</div>';
      return row(ev,sub,money(rev),'var(--state-listed)');
    }).join('');
    var returnRows=returns.slice().sort(function(a,b){return String(b.saleDate||'').localeCompare(String(a.saleDate||''));}).map(function(ev){
      var refund=Math.max(0,-num(ev.salePrice)),n=Math.max(1,num(ev.returnEntry&&ev.returnEntry.saleNo)||1);
      return row(ev,'<div style="font-size:11px;color:var(--muted);margin-top:3px">Sale '+n+' return · '+safe(ev.saleDate||'')+'</div>','−'+money(refund),'var(--red)');
    }).join('');
    openPanel(label,tiles+(saleRows?sectionTitle('Sales in this datapoint')+saleRows:'')+(returnRows?sectionTitle('Refunds in this datapoint')+returnRows:''),false);
  }

  /* Intercept only the three Dashboard headline cards. Other callers of the
     legacy generic detail functions keep their existing meaning. The chart is
     explicitly excluded because its own exact-point handler runs on the SVG. */
  function installMetricCardRouting(){
    var page=document.getElementById('p-summary');
    if(!page||page.__rtMetricCardRouting)return;
    var onClick=function(e){
      if(e.target&&e.target.closest&&e.target.closest('#summary-chart-svg,#summary-chart-svg-mobile'))return;
      var card=e.target&&e.target.closest?e.target.closest('.card.kpi.clickable,.summary-hero-card'):null;
      if(!card||!page.contains(card))return;
      var label=card.querySelector('.kpi-label'),text=String(label&&label.textContent||'').trim().toLowerCase();
      var fn=null;
      if(text.indexOf('gross revenue')===0)fn=showGrossRevenueBreakdown;
      else if(text.indexOf('gross profit')===0)fn=showGrossProfitBreakdown;
      else if(text.indexOf('gross margin')===0)fn=showGrossMarginBreakdown;
      if(!fn)return;
      e.preventDefault();e.stopImmediatePropagation();fn();
    };
    page.__rtMetricCardRouting=onClick;
    page.addEventListener('click',onClick,true);
  }

  window.showGrossRevenueBreakdown=showGrossRevenueBreakdown;
  window.showGrossProfitBreakdown=showGrossProfitBreakdown;
  window.showGrossMarginBreakdown=showGrossMarginBreakdown;
  window.showDashboardRangeBreakdown=showDashboardRangeBreakdown;
  window.showRangeSnapshot=showDashboardRangeBreakdown;

  function monthBounds(key){
    try{
      var y=keyYear(key),m=MONTHS.indexOf(keyCode(key));if(m<0)return null;
      var mm=String(m+1).padStart(2,'0'),last=new Date(y,m+1,0).getDate();
      return {from:y+'-'+mm+'-01',to:y+'-'+mm+'-'+String(last).padStart(2,'0')};
    }catch(_){return null;}
  }
  function normalizeChartHandlers(labels){
    var handlers=window.__chartClickHandlers;
    if(!Array.isArray(handlers))return handlers;
    handlers.forEach(function(h,i){
      if(!h||h.fn!=='showMonthSnapshot'||!h.args||!h.args[0])return;
      var key=h.args[0],bounds=monthBounds(key);if(!bounds)return;
      h.fn='showRangeSnapshot';h.args=[(labels&&labels[i])||keyName(key),bounds.from,bounds.to];
    });
    return handlers;
  }
  function dispatchHandler(h){
    if(!h)return;
    try{
      if(h.fn==='showRangeSnapshot')return showDashboardRangeBreakdown.apply(null,h.args||[]);
      if(h.fn==='showMonthSnapshot'&&window.showMonthSnapshot)return window.showMonthSnapshot.apply(null,h.args||[]);
    }catch(err){try{console.warn('[RETRADE] dashboard drill failed',err);}catch(_){} }
  }
  function exactIndexFromClick(svg,clientX){
    var box;try{box=svg.getBoundingClientRect();}catch(_){box=null;}
    if(!box||!box.width||!isFinite(clientX))return -1;
    var vb=svg.viewBox&&svg.viewBox.baseVal,vx=vb&&isFinite(vb.x)?vb.x:0,vw=vb&&vb.width?vb.width:box.width;
    var x=vx+((clientX-box.left)/box.width)*vw,best=-1,bestDist=Infinity;
    Array.prototype.forEach.call(svg.querySelectorAll('.rt-chart-col'),function(col){
      var idx=parseInt(col.getAttribute('data-idx'),10),r=col.querySelector('rect');if(!isFinite(idx)||!r)return;
      var rx=num(r.getAttribute('x')),rw=num(r.getAttribute('width')),cx=rx+rw/2,dist=(x>=rx&&x<=rx+rw)?0:Math.abs(x-cx);
      if(dist<bestDist){bestDist=dist;best=idx;}
    });
    return best;
  }
  function installExactChartClick(svg){
    if(!svg)return;
    if(svg.__rtExactDashboardClick)svg.removeEventListener('click',svg.__rtExactDashboardClick,true);
    var handler=function(e){
      /* The SVG owns all taps inside its bounds. This prevents a quick iOS tap
         from falling through to the clickable mobile Gross Revenue hero card. */
      if(svg.__wasScrub&&svg.__wasScrub()){e.preventDefault();e.stopImmediatePropagation();return;}
      var idx=exactIndexFromClick(svg,e.clientX);
      e.preventDefault();e.stopImmediatePropagation();
      if(idx<0)return;
      var hs=normalizeChartHandlers();dispatchHandler(hs&&hs[idx]);
    };
    svg.__rtExactDashboardClick=handler;svg.addEventListener('click',handler,true);
  }
  function installChartClicks(){
    installExactChartClick(document.getElementById('summary-chart-svg'));
    installExactChartClick(document.getElementById('summary-chart-svg-mobile'));
  }

  if(typeof window.renderSummaryChart==='function'&&!window.renderSummaryChart._rtDashboardDetailsWrapped){
    var baseRenderSummaryChart=window.renderSummaryChart;
    var wrapped=function(labels){
      normalizeChartHandlers(labels);
      var out=baseRenderSummaryChart.apply(this,arguments);
      normalizeChartHandlers(labels);installChartClicks();installMetricCardRouting();
      return out;
    };
    wrapped._rtDashboardDetailsWrapped=true;window.renderSummaryChart=wrapped;
  }

  normalizeChartHandlers();installChartClicks();installMetricCardRouting();
  window.__RT_DASHBOARD_DETAILS_BUILD=BUILD;
  console.info('[RETRADE] dashboard details layer loaded',BUILD);
})();