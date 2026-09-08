/* RETRADE surface ownership layer.
 *
 * One interaction surface owns focus and editable DOM at a time. This prevents
 * a hidden page/panel/modal from continuing to receive input, and prevents
 * duplicate IDs on an underlying surface from winning legacy getElementById()
 * lookups while a newer surface is active.
 *
 * Deliberately interaction-only: no accounting, lifecycle, persistence, sync or
 * navigation decisions live here.
 */
(function(){
  'use strict';

  var BUILD='20260907-surface-ownership-3';
  var OPEN_SEQ=0;
  var scheduled=false;
  var currentOwner=null;
  var markedOwner=null;
  var seenOpen=new WeakMap();
  var openedAt=new WeakMap();
  var suspended=new Map();
  var workflowPanelIds=new Map();
  var knownSurfaces=new Set();
  var surfaceObservers=new Map();
  var pageObservers=new Map();

  var SURFACE_SELECTOR=[
    '#slide-panel',
    '#confirm-modal',
    '#sold-modal',
    '#resale-modal',
    '#more-sheet',
    '#auth-overlay',
    '[aria-modal="true"]',
    '[role="dialog"]',
    '[id$="-modal"]',
    '.prompt-modal',
    '.entry-modal',
    '.legal-modal-overlay',
    '.first-launch-overlay',
    '.platform-choice-overlay'
  ].join(',');

  function styleOf(el){
    try{return window.getComputedStyle(el);}catch(e){return null;}
  }

  function isOpen(el){
    if(!el||!el.isConnected||el.hidden)return false;
    if(el.id==='slide-panel'&&el.dataset.rtWorkflowSuspended==='true')return false;

    /* Our own suspension must not make an actually-open lower surface disappear
       from arbitration. Otherwise it would be restored, rediscovered, suspended
       again and oscillate forever. */
    var managed=el.dataset.rtSurfaceSuspended==='true';
    if(!managed&&el.getAttribute('aria-hidden')==='true')return false;

    /* Cheap inline/class checks reject the common closed states before asking the
       browser for computed style/layout. Only the small cached surface set ever
       reaches these reads; chart/SVG frame mutations never trigger this layer. */
    if(el.style&&el.style.display==='none')return false;
    if(el.id==='slide-panel'&&!el.classList.contains('on'))return false;

    var s=styleOf(el);
    if(!s||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;
    if(!managed&&s.pointerEvents==='none'&&Number(s.opacity||1)===0)return false;
    if(!el.getClientRects||!el.getClientRects().length)return false;
    return true;
  }

  function zIndex(el){
    var s=styleOf(el);
    if(!s)return 0;
    var z=parseInt(s.zIndex,10);
    return isFinite(z)?z:0;
  }

  function domAfter(a,b){
    if(a===b)return 0;
    try{
      var p=a.compareDocumentPosition(b);
      if(p&Node.DOCUMENT_POSITION_FOLLOWING)return -1;
      if(p&Node.DOCUMENT_POSITION_PRECEDING)return 1;
    }catch(e){}
    return 0;
  }

  function untrackSurface(el){
    var obs=surfaceObservers.get(el);
    if(obs){try{obs.disconnect();}catch(e){}surfaceObservers.delete(el);}
    knownSurfaces.delete(el);
    seenOpen.delete(el);
    openedAt.delete(el);
  }

  function trackSurface(el){
    if(!el||el.nodeType!==1||knownSurfaces.has(el))return;
    knownSurfaces.add(el);
    var obs=new MutationObserver(schedule);
    obs.observe(el,{
      attributes:true,
      attributeFilter:['class','style','hidden','aria-hidden','open','data-rt-workflow-suspended']
    });
    surfaceObservers.set(el,obs);
  }

  function trackPage(el){
    if(!el||el.nodeType!==1||pageObservers.has(el))return;
    var obs=new MutationObserver(schedule);
    obs.observe(el,{
      attributes:true,
      attributeFilter:['class','hidden','aria-hidden','data-rt-workflow-view','data-rt-workflow-item','data-rt-workflow-account']
    });
    pageObservers.set(el,obs);
  }

  function trackTree(node){
    if(!node||node.nodeType!==1)return;
    try{if(node.matches(SURFACE_SELECTOR))trackSurface(node);}catch(e){}
    try{if(node.matches('.page'))trackPage(node);}catch(e2){}
    try{node.querySelectorAll(SURFACE_SELECTOR).forEach(trackSurface);}catch(e3){}
    try{node.querySelectorAll('.page').forEach(trackPage);}catch(e4){}
  }

  function pruneTracked(){
    Array.from(knownSurfaces).forEach(function(el){if(!el.isConnected)untrackSurface(el);});
    Array.from(pageObservers.keys()).forEach(function(el){
      if(el.isConnected)return;
      try{pageObservers.get(el).disconnect();}catch(e){}
      pageObservers.delete(el);
    });
  }

  function collectSurfaces(){
    pruneTracked();
    var open=[];
    knownSurfaces.forEach(function(el){
      var now=isOpen(el);
      var before=seenOpen.get(el)===true;
      if(now&&!before)openedAt.set(el,++OPEN_SEQ);
      seenOpen.set(el,now);
      if(now)open.push(el);
    });
    return open;
  }

  function chooseOwner(open){
    if(!open.length)return null;
    open.sort(function(a,b){
      var za=zIndex(a),zb=zIndex(b);
      if(za!==zb)return za-zb;
      var oa=openedAt.get(a)||0,ob=openedAt.get(b)||0;
      if(oa!==ob)return oa-ob;
      return domAfter(a,b);
    });
    return open[open.length-1]||null;
  }

  function allIds(root){
    var ids=new Set();
    if(!root)return ids;
    if(root.id)ids.add(root.id);
    root.querySelectorAll('[id]').forEach(function(el){if(el.id)ids.add(el.id);});
    return ids;
  }

  function removeConflictingIds(root,owner,state){
    if(!root||!owner||root===owner||root.contains(owner))return;
    var ids=allIds(owner);
    if(!ids.size)return;

    root.querySelectorAll('[id]').forEach(function(el){
      var id=el.id;
      if(!id||!ids.has(id)||state.ids.has(el))return;
      state.ids.set(el,id);
      el.removeAttribute('id');
    });
  }

  function suspendRoot(root,owner){
    if(!root||root===owner||root.contains(owner)||owner.contains(root))return;
    if(root.id==='slide-panel'&&root.dataset.rtWorkflowSuspended==='true')return;

    var state=suspended.get(root);
    if(!state){
      state={
        inert:!!root.inert,
        ariaHidden:root.getAttribute('aria-hidden'),
        ids:new Map()
      };
      suspended.set(root,state);

      var active=document.activeElement;
      if(active&&root.contains(active)){
        try{active.blur();}catch(e){}
      }

      try{root.inert=true;}catch(e2){}
      root.setAttribute('aria-hidden','true');
      root.dataset.rtSurfaceSuspended='true';
    }

    removeConflictingIds(root,owner,state);
  }

  function restoreRoot(root){
    var state=suspended.get(root);
    if(!state)return;

    state.ids.forEach(function(id,el){
      if(el&&el.isConnected&&!el.id)el.id=id;
    });
    state.ids.clear();
    delete root.dataset.rtSurfaceSuspended;

    /* workflow-system may have taken ownership of the item panel while a modal
       was above it. In that case its stronger suspension must survive ours. */
    if(root.id==='slide-panel'&&root.dataset.rtWorkflowSuspended==='true'){
      try{root.inert=true;}catch(e){}
      root.setAttribute('aria-hidden','true');
    }else{
      try{root.inert=state.inert;}catch(e2){}
      if(state.ariaHidden===null)root.removeAttribute('aria-hidden');
      else root.setAttribute('aria-hidden',state.ariaHidden);
    }

    suspended.delete(root);
  }

  function restoreAll(){
    Array.from(suspended.keys()).forEach(restoreRoot);
  }

  function activePage(){
    return document.querySelector('.page.on');
  }

  function rootsToSuspend(owner,open){
    var roots=[];
    if(!owner)return roots;

    open.forEach(function(el){
      if(el!==owner&&!el.contains(owner)&&!owner.contains(el))roots.push(el);
    });

    var page=activePage();
    if(page&&page!==owner&&!page.contains(owner)&&!owner.contains(page))roots.push(page);

    return Array.from(new Set(roots));
  }

  /* workflow-system already makes the item panel inert when Full Details owns
     it. It removes the duplicated editable token IDs. This companion pass finds
     any OTHER duplicate IDs between those two renders, so legacy global ID
     lookups cannot accidentally reach a hidden popup control elsewhere either. */
  function syncWorkflowPanelConflicts(){
    var panel=document.getElementById('slide-panel');
    var page=document.getElementById('p-item');
    var active=!!(panel&&page&&panel.dataset.rtWorkflowSuspended==='true'&&
      page.classList.contains('on')&&page.dataset.rtWorkflowView==='item');

    if(!active){
      workflowPanelIds.forEach(function(id,el){
        if(el&&el.isConnected&&!el.id)el.id=id;
      });
      workflowPanelIds.clear();
      return;
    }

    var ownerIds=allIds(page);
    panel.querySelectorAll('[id]').forEach(function(el){
      var id=el.id;
      if(!id||!ownerIds.has(id)||workflowPanelIds.has(el))return;
      workflowPanelIds.set(el,id);
      el.removeAttribute('id');
    });
  }

  function markOwner(owner){
    if(markedOwner===owner)return;
    if(markedOwner&&markedOwner.isConnected)delete markedOwner.dataset.rtSurfaceOwner;
    markedOwner=owner||null;
    if(markedOwner)markedOwner.dataset.rtSurfaceOwner='true';
  }

  function reconcile(){
    scheduled=false;
    syncWorkflowPanelConflicts();

    var open=collectSurfaces();
    var owner=chooseOwner(open);

    if(owner!==currentOwner){
      restoreAll();
      currentOwner=owner;
    }

    markOwner(owner);

    if(!owner){
      restoreAll();
      return;
    }

    var desired=new Set(rootsToSuspend(owner,open));
    Array.from(suspended.keys()).forEach(function(root){
      if(!desired.has(root))restoreRoot(root);
    });
    desired.forEach(function(root){suspendRoot(root,owner);});
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(reconcile);
  }

  function focusableIn(owner){
    if(!owner)return null;
    var q='input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
    var all=owner.querySelectorAll(q);
    for(var i=0;i<all.length;i++){
      var el=all[i],s=styleOf(el);
      if(s&&s.display!=='none'&&s.visibility!=='hidden'&&el.getClientRects().length)return el;
    }
    return owner.tabIndex>=0?owner:null;
  }

  /* Keyboard/programmatic focus is the one path a visual backdrop does not
     reliably block. Redirect it to the current owner instead of letting a stale
     hidden form accept keystrokes. */
  var redirectingFocus=false;
  document.addEventListener('focusin',function(e){
    if(redirectingFocus)return;

    /* A newly-created generated modal can synchronously focus an input before the
       child-list observer has run. Register that one surface directly first. */
    try{
      var direct=e.target&&e.target.closest?e.target.closest(SURFACE_SELECTOR):null;
      if(direct)trackSurface(direct);
    }catch(_e){}

    var owner=chooseOwner(collectSurfaces());
    if(!owner||owner.contains(e.target))return;

    var lower=Array.from(suspended.keys()).some(function(root){return root.contains(e.target);});
    if(!lower)return;

    try{e.target.blur();}catch(err){}
    var target=focusableIn(owner);
    if(!target)return;
    redirectingFocus=true;
    try{target.focus({preventScroll:true});}catch(err2){try{target.focus();}catch(_err){}}
    redirectingFocus=false;
  },true);

  if(!document.getElementById('rt-surface-ownership-styles')){
    var style=document.createElement('style');
    style.id='rt-surface-ownership-styles';
    style.textContent='[data-rt-surface-suspended="true"]{pointer-events:none!important;user-select:none!important;-webkit-user-select:none!important}';
    document.head.appendChild(style);
  }

  /* Performance rule: never observe `style` across the whole document. Chart
     animation updates inline SVG styles every frame. The old global observer
     therefore woke the ownership system at frame rate and forced unrelated
     style/layout reads. Only actual interaction surfaces watch their own style;
     the document observer is structural only. */
  trackTree(document.documentElement);
  var structureObserver=new MutationObserver(function(records){
    var relevant=false;
    records.forEach(function(record){
      record.addedNodes.forEach(function(node){trackTree(node);relevant=true;});
      if(record.removedNodes&&record.removedNodes.length)relevant=true;
    });
    if(relevant)schedule();
  });
  structureObserver.observe(document.documentElement,{subtree:true,childList:true});

  window.addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')schedule();});
  schedule();

  window.__RT_SURFACE_OWNERSHIP_BUILD=BUILD;
  window.__RT_SURFACE_OWNERSHIP={
    build:BUILD,
    reconcile:reconcile,
    active:function(){return currentOwner?currentOwner.id||currentOwner.className||currentOwner.tagName:null;},
    suspended:function(){return Array.from(suspended.keys()).map(function(el){return el.id||el.className||el.tagName;});}
  };
  console.info('[RETRADE] surface ownership layer loaded',BUILD);
})();