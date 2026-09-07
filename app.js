/* RETRADE app entrypoint.
 * The production bundle is kept intact in app-core.js; workflow-system.js owns
 * navigation/input coherence; surface-ownership.js arbitrates active dialogs,
 * panels and pages; workflow-qol.js owns fast editing shortcuts;
 * chart-polish.js, chart-motion.js, chart-finalize.js, chart-reveal.js,
 * chart-line-motion.js and motion-system.js are deliberately isolated
 * presentation layers so chart/UI motion can be iterated without touching
 * accounting, sync or lifecycle logic.
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
    qol:'7c923b17',
    polish:'9481578c',
    chartMotion:'c1f248c3',
    finalize:'b7f72066',
    reveal:'79ff92a2',
    line:'fc7cee33',
    motion:'a7fd273d'
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
    ['./app-core.js',V.core],
    ['./workflow-system.js',V.workflow],
    ['./surface-ownership.js',V.surface],
    ['./workflow-qol.js',V.qol],
    ['./chart-polish.js',V.polish],
    ['./chart-motion.js',V.chartMotion],
    ['./chart-finalize.js',V.finalize],
    ['./chart-reveal.js',V.reveal],
    ['./chart-line-motion.js',V.line],
    ['./motion-system.js',V.motion]
  ];

  function url(src,version){return src+'?v='+version;}
  function writeScript(src,version){document.write('<script src="'+url(src,version)+'"><\/script>');}

  if(document.readyState==='loading'){
    scripts.forEach(function(spec){writeScript(spec[0],spec[1]);});
    return;
  }

  /* Dynamic scripts are non-async: browsers may fetch them in parallel but must
     execute them in insertion order, preserving the wrapper/dependency chain
     without the old one-request-per-onload network waterfall. */
  scripts.forEach(function(spec){
    var s=document.createElement('script');
    s.async=false;
    s.src=url(spec[0],spec[1]);
    document.head.appendChild(s);
  });
})();