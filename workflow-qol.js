/* RETRADE workflow quality-of-life layer.
 * Interaction-only enhancements: one-tap replace, keyboard flow, and preserving
 * scroll/section context across item-page recalculations.
 */
(function(){
  'use strict';

  var BUILD='20260907-workflow-qol-1';
  var freshFocus=new WeakSet();

  function workflowSurface(el){
    return el&&el.closest?el.closest('#p-item,#slide-panel'):null;
  }

  function isNumericInput(el){
    if(!el||el.tagName!=='INPUT'||el.disabled||el.readOnly)return false;
    if(el.classList.contains('rt-token-native'))return true;
    return el.type==='number'||el.inputMode==='decimal'||el.getAttribute('inputmode')==='decimal';
  }

  function selectAll(el){
    if(!el||document.activeElement!==el)return;
    try{
      if(typeof el.select==='function')el.select();
      if(typeof el.setSelectionRange==='function')el.setSelectionRange(0,String(el.value||'').length);
    }catch(e){}
  }

  function markFirstFocus(el){
    freshFocus.add(el);
    selectAll(el);
    // Mobile Safari may place the caret again as the original tap completes.
    // Re-select after the click/default caret placement, without refocusing.
    setTimeout(function(){
      if(freshFocus.has(el))selectAll(el);
    },0);
    setTimeout(function(){freshFocus.delete(el);},180);
  }

  function tokenInputs(surface){
    if(!surface)return [];
    return Array.from(surface.querySelectorAll('input.rt-token-native:not([disabled])'));
  }

  function nextTokenInput(current){
    var surface=workflowSurface(current);
    var inputs=tokenInputs(surface);
    var idx=inputs.indexOf(current);
    return idx>=0&&idx<inputs.length-1?inputs[idx+1]:null;
  }

  function configureToken(input){
    if(!input||!input.classList||!input.classList.contains('rt-token-native'))return;
    var next=nextTokenInput(input);
    try{input.enterKeyHint=next?'next':'done';}catch(e){}
    input.setAttribute('enterkeyhint',next?'next':'done');
    input.setAttribute('autocorrect','off');
    input.setAttribute('autocapitalize','off');
  }

  // First focus on a price/cost/percentage field means "replace this value".
  // A second tap while the same input remains focused is left alone so the user
  // can deliberately place the caret for a small edit instead.
  document.addEventListener('focusin',function(e){
    var input=e.target;
    if(!isNumericInput(input)||!workflowSurface(input))return;
    configureToken(input);
    markFirstFocus(input);
  },true);

  // Belt-and-braces for iOS: after the first pointer gesture completes, restore
  // the full selection if Safari replaced it with a single caret position.
  document.addEventListener('pointerup',function(e){
    var input=e.target;
    if(!isNumericInput(input)||!freshFocus.has(input))return;
    selectAll(input);
  },true);

  // Tapping anywhere on an editable KPI card focuses its native editor. This is
  // intentionally only for workflow-system's stable token cards, not locked KPIs.
  document.addEventListener('pointerdown',function(e){
    var token=e.target&&e.target.closest?e.target.closest('.ip-token.rt-native-edit'):null;
    if(!token)return;
    var input=token.querySelector('input.rt-token-native');
    if(!input||e.target===input)return;
    configureToken(input);
    try{input.focus({preventScroll:true});}catch(err){input.focus();}
    markFirstFocus(input);
  },true);

  // Enter/Next moves through editable KPI cards without collapsing the keyboard.
  // Focusing the next input causes the current one to blur/commit through the
  // existing durable save path; workflow-system then sees another editor focused
  // and deliberately skips its destructive page re-render.
  document.addEventListener('keydown',function(e){
    var input=e.target;
    if(!input||!input.classList||!input.classList.contains('rt-token-native'))return;
    if(e.key!=='Enter')return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var next=nextTokenInput(input);
    if(next){
      configureToken(next);
      try{next.focus({preventScroll:true});}catch(err){next.focus();}
      markFirstFocus(next);
    }else{
      input.blur();
    }
  },true);

  // Preserve the user's place when recalculation needs a full item-page render.
  // Opening a different item is not intercepted; this only applies when the same
  // item already owns p-item. Collapsed P&L/detail sections and scroll position
  // therefore stop jumping around after a small price/cost correction.
  if(typeof window.renderItemPage==='function'&&!window.renderItemPage._rtQolWrapped){
    var baseRender=window.renderItemPage;
    var wrappedRender=function(month,id){
      var page=document.getElementById('p-item');
      var same=!!(page&&page.classList.contains('on')&&page.dataset.rtWorkflowView==='item'&&page.dataset.rtWorkflowItem===String(id));
      var y=same?(window.scrollY||window.pageYOffset||0):0;
      var states=null;
      if(same&&typeof _getSecStates==='function'){
        try{states=_getSecStates();}catch(e){}
      }
      var out=baseRender.apply(this,arguments);
      if(same&&states&&typeof _applySecStates==='function'){
        try{_applySecStates(states);}catch(e){}
      }
      if(same&&y>0){
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            if(document.getElementById('p-item')&&document.getElementById('p-item').classList.contains('on'))window.scrollTo(0,y);
          });
        });
      }
      var surface=document.getElementById('p-item');
      tokenInputs(surface).forEach(configureToken);
      return out;
    };
    wrappedRender._rtQolWrapped=true;
    window.renderItemPage=wrappedRender;
  }

  // Newly-created token inputs are configured before the next gesture wherever
  // possible, but all behaviour is delegated so no observer is required for
  // correctness and there is no permanent mutation-observer performance cost.
  document.addEventListener('pointerover',function(e){
    var token=e.target&&e.target.closest?e.target.closest('.ip-token.rt-native-edit'):null;
    if(token)configureToken(token.querySelector('input.rt-token-native'));
  },{passive:true,capture:true});

  console.info('[RETRADE] workflow QoL layer loaded',BUILD);
})();
