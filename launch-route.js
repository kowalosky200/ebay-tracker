/* RETRADE cold-launch route normalisation.
 *
 * A new document always opens on Home / Command Centre. Existing in-app route
 * changes are untouched, and a real user gesture immediately cancels the boot
 * guard so an intentional tap during startup can never be redirected.
 *
 * This only owns initial navigation. It does not touch period filters, data,
 * persistence, accounting, Supabase or background/resume behaviour.
 */
(function(){
  'use strict';

  if(window.__RT_LAUNCH_ROUTE)return;
  var BUILD='20260908-launch-home-1';
  var active=true;
  var normalising=false;
  var nativeGo=typeof window.goToTab==='function'?window.goToTab:null;

  function userTookControl(e){
    if(!active)return;
    if(e&&e.isTrusted===false)return;
    active=false;
  }

  /* pointerdown runs before inline onclick/goToTab handlers on iPhone, so an
     intentional first tap wins over the cold-launch normaliser. */
  document.addEventListener('pointerdown',userTookControl,true);
  document.addEventListener('keydown',userTookControl,true);

  function summaryControl(){
    return document.querySelector('[data-tab="summary"],#bottom-nav [data-tab="summary"],.side-nav-item[data-tab="summary"]');
  }

  function currentPage(){
    return document.querySelector('.page.on');
  }

  function openHome(){
    if(!active||normalising||typeof nativeGo!=='function')return false;
    var page=currentPage();
    if(page&&page.id==='p-summary')return true;
    /* Do not manufacture a route while the app has not mounted any page yet.
       The later boot checkpoints will catch the first restored page. */
    if(!page)return false;
    normalising=true;
    try{
      nativeGo.call(window,'summary',summaryControl());
      try{window.scrollTo(0,0);}catch(_e){}
      return true;
    }catch(e){
      console.warn('[RETRADE] launch Home normalisation failed',e);
      return false;
    }finally{
      normalising=false;
    }
  }

  /* Core can restore its previous route once before async data hydration and
     once again as saved UI state is applied. Check both handoff points, then get
     out of the way permanently. No polling or long-lived observer is used. */
  requestAnimationFrame(openHome);
  setTimeout(openHome,180);
  setTimeout(openHome,650);
  setTimeout(function(){openHome();active=false;},1800);

  window.__RT_LAUNCH_ROUTE={build:BUILD,openHome:openHome};
  console.info('[RETRADE] launch route loaded',BUILD);
})();
