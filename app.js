/* RETRADE app entrypoint.
 * The production bundle is kept intact in app-core.js; workflow-system.js owns
 * navigation/input coherence; surface-ownership.js arbitrates active dialogs,
 * panels and pages; interaction-health.js ensures closed visual layers release
 * hit-testing and body scroll immediately; workflow-qol.js owns fast editing;
 * listing-flow.js owns list-form copy + popup->listing transition coherence;
 * chart-polish.js, chart-motion.js, chart-finalize.js, chart-reveal.js,
 * chart-line-motion.js and motion-system.js own presentation motion;
 * fab-system.js keeps the bottom action shell mounted across routes while
 * retaining the intentional mobile collapse on genuine downward scrolling;
 * sales-undo.js exposes the existing safe lifecycle/activity undo from Sales
 * selection mode and item action menus;
 * dashboard-details.js owns exact Command Centre drill-down semantics;
 * stock-detail-profit.js keeps sourced-stock panel estimates financially coherent.
 */
(function(){
  'use strict';

  /* Content-specific asset versions. A single global query version used to make
     the browser re-fetch the 1.6 MB app-core bundle plus every presentation layer
     when only one tiny motion file changed. Unchanged assets now keep a stable URL
     and can use the browser/HTTP cache; changed files still get an immediate fresh
     URL on deploy. */
  var V={
    core:'afff7100',
    workflow:'6cb382ef',
    surface:'f31a3e3c',
    interaction:'984c3f20',
    qol:'7c923b17',
    listing:'e426f9af',
    polish:'9481578c',
    chartMotion:'d27d650a',
    finalize:'b7f72066',
    reveal:'79ff92a2',
    line:'fc7cee33',
    motion:'a79d0af1',
    fab:'ea658b4b',
    salesUndo:'a4911fd7',
    dashboard:'4539b2fb',
    stockDetail:'62301cdf'
  };

  /* First-paint motion pre-arm. The Sales SVG can be rendered by app-core before
     the refinement layer is loaded; keeping it transparent until that layer has
     prepared the paths prevents a visible fully-drawn -> rewind -> reveal jump. */
  document.documentElement.classList.add('rt-motion-prep');
  if(!document.getElementById('rt-motion-preflight')){
    var pre=document.createElement('style');pre.id='rt-motion-preflight';
    pre.textContent='html.rt-motion-prep #monthly-profitability-svg{opacity:0!important}#monthly-profitability-svg{transition:opacity 120ms cubic-bezier(.22,.61,.36,1)}@media(prefers-reduced-motion:reduce){html.rt-motion-prep #monthly-profitability-svg{opacity:1!important}#monthly-profitability-svg{transition:none!important}}';
    document.head.appendChild(pre);
  }
  /* Presentation must never hold useful data hostage to an animation layer. */
  setTimeout(function(){document.documentElement.classList.remove('rt-motion-prep');},1200);

  var scripts=[
    ['./app-core.js',V.core,'high'],
    ['./workflow-system.js',V.workflow,'auto'],
    ['./surface-ownership.js',V.surface,'auto'],
    ['./interaction-health.js',V.interaction,'auto'],
    ['./workflow-qol.js',V.qol,'auto'],
    ['./listing-flow.js',V.listing,'auto'],
    ['./chart-polish.js',V.polish,'low'],
    ['./chart-motion.js',V.chartMotion,'low'],
    ['./chart-finalize.js',V.finalize,'low'],
    ['./chart-reveal.js',V.reveal,'low'],
    ['./chart-line-motion.js',V.line,'low'],
    ['./motion-system.js',V.motion,'low'],
    ['./fab-system.js',V.fab,'auto'],
    ['./sales-undo.js',V.salesUndo,'auto'],
    ['./dashboard-details.js',V.dashboard,'auto'],
    ['./stock-detail-profit.js',V.stockDetail,'auto']
  ];

  function url(src,version){return src+'?v='+version;}

  /* app.js is loaded at the bottom of index.html, after the real page/modal DOM
     and after accounting/reports. Dynamic non-async scripts can therefore start
     downloading together without parser blocking. `async=false` preserves exact
     execution order, while fetch priority gives the large app-core bundle first
     claim on the connection and lets decorative presentation layers fill spare capacity.
     The previous document.write chain made first-load execution unnecessarily
     serial even though the phone/network could do more work in parallel. */
  scripts.forEach(function(spec){
    var s=document.createElement('script');
    s.async=false;
    s.src=url(spec[0],spec[1]);
    try{s.fetchPriority=spec[2];}catch(_){}
    document.head.appendChild(s);
  });
})();
