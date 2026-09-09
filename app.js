/* RETRADE app entrypoint.
 * The production bundle is kept intact in app-core.js; bundle-orders.js owns
 * grouped-sale lifecycle, bundle-panel.js owns bundle presentation/navigation,
 * bundle-row-polish.js refines the combined Sales-row hierarchy,
 * cashflow-liabilities.js adds the free-cash liability view, and
 * performance-system.js owns query memoization + stable Sales sub-navigation.
 * Chart/motion refinements stay isolated presentation layers.
 */
(function(){
  'use strict';
  var v='20260909-v1455';

  /* First-paint motion pre-arm. The Sales SVG can be rendered by app-core before
     the refinement layer is loaded; keeping it transparent until that layer has
     prepared the paths prevents a visible fully-drawn -> rewind -> reveal jump. */
  document.documentElement.classList.add('rt-motion-prep');
  if(!document.getElementById('rt-motion-preflight')){
    var pre=document.createElement('style');pre.id='rt-motion-preflight';
    pre.textContent='html.rt-motion-prep #monthly-profitability-svg{opacity:0!important}#monthly-profitability-svg{transition:opacity 140ms cubic-bezier(.22,.61,.36,1)}@media(prefers-reduced-motion:reduce){html.rt-motion-prep #monthly-profitability-svg{opacity:1!important}#monthly-profitability-svg{transition:none!important}}';
    document.head.appendChild(pre);
  }
  /* Never let a presentation-layer failure strand the chart invisible. */
  setTimeout(function(){document.documentElement.classList.remove('rt-motion-prep');},3000);

  function writeScript(src){document.write('<script src="'+src+'"><\/script>');}
  if(document.readyState==='loading'){
    writeScript('./app-core.js?v='+v);
    writeScript('./bundle-orders.js?v='+v);
    writeScript('./bundle-panel.js?v='+v);
    writeScript('./bundle-row-polish.js?v='+v);
    writeScript('./cashflow-liabilities.js?v='+v);
    writeScript('./performance-system.js?v='+v);
    writeScript('./chart-polish.js?v='+v);
    writeScript('./chart-motion.js?v='+v);
    writeScript('./chart-finalize.js?v='+v);
    writeScript('./chart-reveal.js?v='+v);
    writeScript('./chart-line-motion.js?v='+v);
    writeScript('./motion-system.js?v='+v);
    return;
  }

  function append(src,onload){var s=document.createElement('script');s.src=src+'?v='+v;if(onload)s.onload=onload;document.head.appendChild(s);}
  append('./app-core.js',function(){
    append('./bundle-orders.js',function(){
      append('./bundle-panel.js',function(){
        append('./bundle-row-polish.js',function(){
          append('./cashflow-liabilities.js',function(){
            append('./performance-system.js',function(){
              append('./chart-polish.js',function(){
                append('./chart-motion.js',function(){
                  append('./chart-finalize.js',function(){
                    append('./chart-reveal.js',function(){
                      append('./chart-line-motion.js',function(){append('./motion-system.js');});
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
})();
