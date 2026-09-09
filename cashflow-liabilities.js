/* RETRADE Cashflow liability visibility refinement.
 * Loaded after app-core.js.
 *
 * The cash ledger remains authoritative for money physically held. This layer
 * adds the operational view the reseller needs: free cash after amounts already
 * owed to suppliers / partners, while keeping reconciliation tied to real cash.
 */
(function(){
  'use strict';

  if(typeof window.renderCash!=='function'||typeof calcCashSummary!=='function')return;

  var originalRenderCash=window.renderCash;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function money(v){return typeof fmt==='function'?fmt(num(v)):'£'+num(v).toFixed(2);}

  function enhanceCashflow(){
    var page=document.getElementById('p-cash');if(!page)return;
    var c;try{c=calcCashSummary();}catch(_){return;}
    var liabilities=c.unpaidLiabilities||{supplier:0,partner:0,total:0};
    var partner=Math.max(0,num(liabilities.partner)),supplier=Math.max(0,num(liabilities.supplier));
    var reserved=Math.max(0,num(liabilities.total));
    var free=+(num(c.cashAvailable)-reserved).toFixed(2);

    /* The native headline is real cash held. Present the more useful operating
       number without changing the ledger or the reconciliation baseline. */
    var hero=null;
    Array.prototype.some.call(page.querySelectorAll('.card'),function(card){
      var label=card.querySelector('.kpi-label');
      if(label&&/business cash available/i.test(String(label.textContent||''))){hero=card;return true;}
      return false;
    });
    if(hero){
      var breakdown=[];
      if(partner>0)breakdown.push('partner '+money(partner));
      if(supplier>0)breakdown.push('supplier '+money(supplier));
      hero.id='rt-free-cash-card';
      hero.innerHTML='<div class="kpi-label">Free cash after commitments</div>'
        +'<div class="num" style="font-size:clamp(28px,7vw,40px);font-weight:800;line-height:1.05;margin-top:4px;'+(free<0?'color:var(--red);':'')+'">'+money(free)+'</div>'
        +'<div class="kpi-foot" style="margin-top:8px;line-height:1.5;">'+money(c.cashAvailable)+' cash held − '+money(reserved)+' already committed'
          +(breakdown.length?' ('+breakdown.join(' · ')+')':'')+'. Outstanding settlements stay in the bank/platform balance until paid, but are not treated as free to spend.</div>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--text-secondary);">'
          +'<span style="flex:1;min-width:120px">Cash held <strong class="num" style="color:var(--text)">'+money(c.cashAvailable)+'</strong></span>'
          +'<span style="flex:1;min-width:120px">Reserved <strong class="num" style="color:'+(reserved>0?'var(--accent)':'var(--text)')+'">'+money(reserved)+'</strong></span>'
        +'</div>';
    }

    /* Keep partner money visible even when the lower combined liability card is
       collapsed/off-screen. This does not create a cash event; paid settlements
       already do that through the canonical ledger. */
    var cashHeading=Array.prototype.slice.call(page.querySelectorAll('.sl')).find(function(el){return String(el.textContent||'').trim().toLowerCase()==='cash';});
    var grid=cashHeading&&cashHeading.nextElementSibling&&cashHeading.nextElementSibling.classList.contains('kgrid')?cashHeading.nextElementSibling:null;
    if(grid&&!document.getElementById('rt-partner-due-kpi')){
      var card=document.createElement('div');card.className='card kpi';card.id='rt-partner-due-kpi';
      card.innerHTML='<div class="kpi-label">Partner money due</div><div class="kpi-value num" style="color:'+(partner>0?'var(--accent)':'var(--text)')+'">'+money(partner)+'</div><div class="kpi-foot">Outstanding partner share already reserved from free cash</div>';
      grid.appendChild(card);
    }
  }

  window.renderCash=function(){
    var out=originalRenderCash.apply(this,arguments);
    enhanceCashflow();
    return out;
  };

  requestAnimationFrame(function(){var p=document.getElementById('p-cash');if(p&&p.children.length)enhanceCashflow();});
})();