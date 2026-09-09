/* RETRADE app entrypoint.
 * The production bundle is kept intact in app-core.js; bundle-orders.js owns
 * grouped-sale lifecycle, bundle-panel.js owns bundle presentation/navigation,
 * bundle-row-polish.js refines the combined Sales-row hierarchy,
 * cashflow-liabilities.js adds the free-cash liability view, and
 * performance-system.js owns query memoization + compact navigation behaviour.
 * sales-defaults.js keeps Monthly as the safe Sales landing route after reload/idle.
 * launch-experience.js coordinates the cold-start / wake presentation.
 * Chart/motion refinements stay isolated presentation layers.
 */
(function(){
  'use strict';
  var v='20260909-v1459';

  /* Arm cold-start styling synchronously, before any child bundle can paint.
     launch-experience.js releases this once the real-layout boot handoff is done. */
  document.documentElement.classList.add('rt-app-cold','rt-motion-prep');

  /* First-paint motion pre-arm. The Sales SVG can be rendered by app-core before
     the refinement layer is loaded; keeping it transparent until that layer has
     prepared the paths prevents a visible fully-drawn -> rewind -> reveal jump. */
  if(!document.getElementById('rt-motion-preflight')){
    var pre=document.createElement('style');pre.id='rt-motion-preflight';
    pre.textContent='html.rt-motion-prep #monthly-profitability-svg{opacity:0!important}#monthly-profitability-svg{transition:opacity 140ms cubic-bezier(.22,.61,.36,1)}@media(prefers-reduced-motion:reduce){html.rt-motion-prep #monthly-profitability-svg{opacity:1!important}#monthly-profitability-svg{transition:none!important}}';
    document.head.appendChild(pre);
  }
  /* Never let a presentation-layer failure strand the chart or cold-start shell. */
  setTimeout(function(){document.documentElement.classList.remove('rt-motion-prep');},3000);
  setTimeout(function(){
    if(!document.body||!document.body.classList.contains('rt-real-layout-loading')){
      document.documentElement.classList.remove('rt-app-cold');
    }
  },5000);

  /*
   * Ordered dynamic classic scripts are intentionally used instead of
   * document.write / nested onload chains. `async=false` preserves execution
   * order, while appending the full list immediately lets the browser discover
   * and download independent files in parallel and lets HTML parsing finish.
   */
  var files=[
    './launch-experience.js',
    './app-core.js',
    './bundle-orders.js',
    './bundle-panel.js',
    './bundle-row-polish.js',
    './cashflow-liabilities.js',
    './performance-system.js',
    './sales-defaults.js',
    './chart-polish.js',
    './chart-motion.js',
    './chart-finalize.js',
    './chart-reveal.js',
    './sales-forecast-gate.js',
    './chart-line-motion.js',
    './chart-forecast-sequence.js',
    './motion-system.js'
  ];

  files.forEach(function(src,index){
    var s=document.createElement('script');
    s.src=src+'?v='+v;
    s.async=false;
    /* The coordinator and core define startup behaviour; later presentation
       layers are deliberately lower priority than the first useful interface. */
    try{s.fetchPriority=index<2?'high':(index<8?'auto':'low');}catch(_){}
    s.onerror=function(){
      console.error('[RETRADE] startup script failed:',src);
      if(src==='./launch-experience.js')document.documentElement.classList.remove('rt-app-cold');
      if(src==='./chart-line-motion.js')document.documentElement.classList.remove('rt-motion-prep');
    };
    document.head.appendChild(s);
  });
})();
