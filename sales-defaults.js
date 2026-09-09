/* RETRADE Sales default-route refinement v1.4.58
 *
 * Sales is still one destination with a nav-button Yearly/Monthly toggle, but
 * the safe/default landing view is Monthly:
 * - every full app load/reload starts Sales in Monthly
 * - returning to Sales after 15 minutes away starts in Monthly
 * - resuming the app after 15+ minutes in the background resets Sales to Monthly
 * - short navigation hops keep the current Sales view, so the Sales button can
 *   still toggle naturally during an active working session
 *
 * No sales data, accounting, forecast maths, lifecycle or sync behaviour changes.
 */
(function(){
  'use strict';

  var IDLE_RESET_MS=15*60*1000;
  var LEFT_KEY='rt-sales-left-at-v1';
  var HIDDEN_KEY='rt-sales-hidden-at-v1';

  function wallNow(){return Date.now();}
  function activePageId(){var p=document.querySelector('.page.on');return p?p.id:'';}
  function currentMonth(){try{return typeof currentMonthKey==='function'?currentMonthKey():'';}catch(_){return '';}}
  function setStamp(key,value){try{sessionStorage.setItem(key,String(value));}catch(_){} }
  function getStamp(key){try{var v=Number(sessionStorage.getItem(key)||0);return isFinite(v)?v:0;}catch(_){return 0;}}
  function clearStamp(key){try{sessionStorage.removeItem(key);}catch(_){} }
  function contextualMonthOpen(){try{return !!_monthOpenFromContext;}catch(_){return false;}}

  function forceMonthly(){
    try{MONTHLY_VIEW='detail';}catch(_){}
    try{if(!SELECTED_MONTH)SELECTED_MONTH=currentMonth();}catch(_){}
    try{if(typeof _saveUIState==='function')_saveUIState();}catch(_){}
  }

  function renderMonthlyIfVisible(){
    if(activePageId()!=='p-monthly')return;
    try{
      if(typeof renderMonth==='function'){renderMonth();return;}
      if(typeof renderMonthlyPage==='function')renderMonthlyPage();
    }catch(_){}
  }

  /* A reload is a fresh working session: Sales should never reopen on Yearly
     merely because Yearly was the last toggle state before the reload. */
  forceMonthly();
  clearStamp(LEFT_KEY);
  clearStamp(HIDDEN_KEY);
  if(activePageId()==='p-monthly')requestAnimationFrame(renderMonthlyIfVisible);

  try{
    if(typeof goToTab==='function'){
      var nativeGoToTab=goToTab;
      goToTab=function(name,sourceEl){
        var before=activePageId();

        if(before==='p-monthly'&&name!=='monthly')setStamp(LEFT_KEY,wallNow());

        if(name==='monthly'&&before!=='p-monthly'&&!contextualMonthOpen()){
          var leftAt=getStamp(LEFT_KEY);
          if(leftAt&&wallNow()-leftAt>=IDLE_RESET_MS)forceMonthly();
          clearStamp(LEFT_KEY);
        }

        return nativeGoToTab.apply(this,arguments);
      };
    }
  }catch(_){}

  try{
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){
        if(activePageId()==='p-monthly')setStamp(HIDDEN_KEY,wallNow());
        return;
      }
      var hiddenAt=getStamp(HIDDEN_KEY);clearStamp(HIDDEN_KEY);
      if(activePageId()==='p-monthly'&&hiddenAt&&wallNow()-hiddenAt>=IDLE_RESET_MS){
        forceMonthly();
        renderMonthlyIfVisible();
      }
    },{passive:true});
  }catch(_){}
})();
