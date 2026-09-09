/* RETRADE bundle Sales-row presentation polish.
 * Loaded after bundle-panel.js.
 *
 * Keeps the normal sold-status column aligned, then places the bundle disclosure
 * affordance beside it. Gives grouped orders their own generated row label and
 * keeps expanded bundle members visually subordinate to the parent order.
 */
(function(){
  'use strict';

  if(typeof window.renderBundleSaleRow!=='function')return;

  var originalRenderBundleSaleRow=window.renderBundleSaleRow;

  function injectStyles(){
    if(document.getElementById('rt-bundle-row-polish-css'))return;
    var s=document.createElement('style');
    s.id='rt-bundle-row-polish-css';
    s.textContent='\
.bundle-row .rt-bundle-leftslot{display:flex;align-items:center;gap:6px!important;flex:0 0 auto}\
.bundle-row .rt-bundle-leftslot .status-dot{order:1;margin:0!important;flex:0 0 auto}\
.bundle-row .rt-bundle-leftslot .item-checkbox-left{order:1;margin:0!important;flex:0 0 auto}\
.bundle-row .rt-bundle-disclosure{order:2;width:27px!important;height:29px!important;flex:0 0 27px!important;border:1px solid color-mix(in srgb,var(--border) 88%,transparent)!important;border-radius:8px!important;background:color-mix(in srgb,var(--surface2) 88%,var(--accent) 12%)!important;color:var(--text-secondary)!important;padding:0!important;box-shadow:0 1px 0 rgba(0,0,0,.04);transition:background 160ms cubic-bezier(.22,.61,.36,1),border-color 160ms cubic-bezier(.22,.61,.36,1),color 160ms cubic-bezier(.22,.61,.36,1),transform 120ms ease!important}\
.bundle-row .rt-bundle-disclosure:hover{background:color-mix(in srgb,var(--surface2) 78%,var(--accent) 22%)!important;border-color:color-mix(in srgb,var(--border) 62%,var(--accent) 38%)!important;color:var(--text)!important}\
.bundle-row .rt-bundle-disclosure:active{transform:scale(.94)}\
.bundle-row .rt-bundle-disclosure:focus-visible{outline:2px solid var(--accent);outline-offset:2px}\
.bundle-row .rt-bundle-disclosure.expanded{background:color-mix(in srgb,var(--surface) 78%,var(--accent) 22%)!important;border-color:color-mix(in srgb,var(--border) 48%,var(--accent) 52%)!important;color:var(--accent)!important}\
.bundle-row .rt-bundle-disclosure svg{width:13px!important;height:13px!important}\
.bundle-row .item-row-name .rt-bundle-count{color:var(--text-secondary);font-weight:600;font-size:.91em;white-space:nowrap}\
.rt-bundle-children{padding:5px 10px 8px 34px!important;border-top:0!important;background:transparent!important}\
.rt-bundle-child{margin:5px 0 0!important;min-height:58px!important;border:1px solid color-mix(in srgb,var(--border) 82%,transparent)!important;border-radius:9px!important;background:color-mix(in srgb,var(--surface2) 78%,var(--surface))!important;box-shadow:0 1px 0 rgba(0,0,0,.025)}\
.rt-bundle-child:first-child{margin-top:0!important;border-top:1px solid color-mix(in srgb,var(--border) 82%,transparent)!important}\
.rt-bundle-child .item-main{padding-left:8px!important}.rt-bundle-child .item-row-inner{min-height:56px!important}\
.rt-bundle-child .rt-bundle-child-branch{width:14px!important;flex:0 0 14px!important;font-size:13px!important;opacity:.78}\
.rt-bundle-child .item-row-name{font-size:12.75px!important;line-height:1.28}\
.rt-bundle-child .item-row-meta{display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:5px!important;margin-top:4px!important}\
.rt-bundle-child .item-row-meta .item-badge{margin:0!important}\
.rt-bundle-child .item-badge.sold{font-size:9px!important;padding:2px 6px!important}\
.rt-bundle-child .item-badge.bundle{font-size:9px!important;padding:2px 6px!important}\
.rt-bundle-child .item-row-price{font-size:12.75px!important}.rt-bundle-child .item-row-profit{font-size:10.75px!important}\
@media(max-width:639px){.rt-bundle-children{padding-left:20px!important;padding-right:7px!important}.rt-bundle-child .item-main{padding-left:6px!important}}\
@media(prefers-reduced-motion:reduce){.bundle-row .rt-bundle-disclosure{transition:none!important}}';
    document.head.appendChild(s);
  }

  function polishMarkup(markup,members){
    if(typeof document==='undefined'||!markup)return markup;
    var template=document.createElement('template');
    template.innerHTML=markup;
    var row=template.content.querySelector('.bundle-row');
    if(row){
      var left=row.querySelector('.rt-bundle-leftslot');
      if(left){
        var disclosure=left.querySelector('.rt-bundle-disclosure');
        var anchor=left.querySelector('.status-dot')||left.querySelector('.item-checkbox-left');
        if(disclosure&&anchor&&disclosure.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',disclosure);
        if(disclosure){
          var open=disclosure.getAttribute('aria-expanded')==='true';
          disclosure.setAttribute('title',open?'Hide bundle items':'Show bundle items');
          disclosure.setAttribute('aria-label',open?'Collapse bundle items':'Expand bundle items');
        }
      }
      var count=(members||[]).length;
      var name=row.querySelector('.item-row-name');
      if(name){
        name.innerHTML='Bundle order <span class="rt-bundle-count">· '+count+' item'+(count===1?'':'s')+'</span>';
      }
    }

    template.content.querySelectorAll('.rt-bundle-child').forEach(function(child){
      var meta=child.querySelector('.item-row-meta');
      if(!meta)return;
      var oldBundle=meta.querySelector('.item-badge.bundle');
      if(oldBundle)oldBundle.remove();
      var sold=document.createElement('span');
      sold.className='item-badge sold';
      sold.textContent='SOLD';
      var bundle=document.createElement('span');
      bundle.className='item-badge bundle';
      bundle.textContent='≋ BUNDLE';
      var firstElement=meta.firstElementChild;
      if(firstElement){
        meta.insertBefore(bundle,firstElement);
        meta.insertBefore(sold,bundle);
      }else{
        meta.appendChild(sold);
        meta.appendChild(bundle);
      }
    });

    var holder=document.createElement('div');
    holder.appendChild(template.content);
    return holder.innerHTML;
  }

  window.renderBundleSaleRow=function(bid,members){
    injectStyles();
    return polishMarkup(originalRenderBundleSaleRow.apply(this,arguments),members);
  };

  injectStyles();
})();
