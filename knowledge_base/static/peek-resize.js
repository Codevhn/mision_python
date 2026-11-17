/* Side Peek geometry is a local UI preference, independent of record content. */
(() => {
  function mount(){
    const overlay=document.getElementById('pagePeekOverlay');
    const panel=overlay?.querySelector('.page-peek-modal');
    if(!panel)return;
    const root=document.documentElement,key='atlas_db_peek_width';
    let preferred=null,drag=null,frame=0,width=0;
    try{const value=Number(localStorage.getItem(key));if(Number.isFinite(value)&&value>=320&&value<=10000)preferred=value;}catch{}
    const handle=document.createElement('div');
    handle.className='peek-resize-handle';handle.tabIndex=0;handle.hidden=true;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');
    handle.setAttribute('aria-label','Cambiar ancho de Peek');
    handle.title='Arrastra para ajustar el ancho. Doble clic para restablecer.';
    panel.prepend(handle);
    const viewport=()=>document.documentElement.clientWidth;
    const side=()=>!overlay.classList.contains('hidden')&&overlay.classList.contains('db-preview-peek')&&overlay.dataset.peekMode==='side'&&viewport()>650;
    function limits(){
      const vw=viewport(),area=document.getElementById('contentArea'),rect=area?.getBoundingClientRect();
      const margin=area?parseFloat(getComputedStyle(area).marginRight)||0:0;
      const available=rect?Math.min(vw,rect.right+margin)-rect.left:vw;
      const max=vw>=1100?Math.max(360,available-320):vw-48;
      return {min:Math.min(360,max),max};
    }
    const clamp=(value,bounds=limits())=>Math.round(Math.max(bounds.min,Math.min(bounds.max,value)));
    function paint(value){
      const bounds=limits();width=clamp(value,bounds);
      const pixels=width+'px';if(root.style.getPropertyValue('--atlas-peek-side-width')!==pixels)root.style.setProperty('--atlas-peek-side-width',pixels);
      handle.setAttribute('aria-valuemin',String(Math.round(bounds.min)));
      handle.setAttribute('aria-valuemax',String(Math.round(bounds.max)));
      handle.setAttribute('aria-valuenow',String(width));
      handle.setAttribute('aria-valuetext',width+' píxeles');
    }
    function apply(){
      frame=0;
      if(drag){paint(drag.next);return;}
      handle.hidden=!side();
      paint(preferred??Math.min(780,Math.max(640,viewport()*.52)));
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(apply);}
    function persist(){preferred=width;try{localStorage.setItem(key,String(preferred));}catch{}}
    function finish(commit){
      if(!drag)return;
      const previous=drag;drag=null;
      if(frame){cancelAnimationFrame(frame);frame=0;}
      if(commit){paint(previous.next);persist();}else preferred=previous.preferred;
      root.classList.remove('atlas-peek-resizing');
      if(handle.hasPointerCapture?.(previous.pointerId))handle.releasePointerCapture(previous.pointerId);
      apply();
    }
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary||!side())return;
      event.preventDefault();handle.focus({preventScroll:true});
      drag={pointerId:event.pointerId,startX:event.clientX,startWidth:width,next:width,preferred};
      root.classList.add('atlas-peek-resizing');
      handle.setPointerCapture(event.pointerId);
    });
    window.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      drag.next=drag.startWidth+drag.startX-event.clientX;schedule();
    },{passive:true});
    window.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId)finish(true);});
    window.addEventListener('pointercancel',event=>{if(drag&&event.pointerId===drag.pointerId)finish(false);});
    handle.addEventListener('lostpointercapture',()=>finish(false));
    handle.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(false);return;}
      if(!side()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();const bounds=limits(),step=event.shiftKey?50:20;
      paint(event.key==='Home'?bounds.min:event.key==='End'?bounds.max:width+(event.key==='ArrowLeft'?step:-step));persist();
    });
    handle.addEventListener('dblclick',()=>{finish(false);preferred=null;try{localStorage.removeItem(key);}catch{}apply();});
    new MutationObserver(()=>{if(!side())finish(false);schedule();}).observe(overlay,{attributes:true,attributeFilter:['class','data-peek-mode']});
    window.addEventListener('resize',()=>{finish(false);schedule();},{passive:true});
    window.addEventListener('blur',()=>finish(false));
    const sidebar=document.getElementById('sidebar');
    if(sidebar&&typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(sidebar);
    if(typeof ResizeObserver!=='undefined'){
      let titleFrame=0;
      new ResizeObserver(()=>{
        if(titleFrame)return;
        titleFrame=requestAnimationFrame(()=>{titleFrame=0;if(overlay.classList.contains('hidden'))return;
          if(typeof _resizePeekTitle==='function')_resizePeekTitle();
        });
      }).observe(panel);
    }
    apply();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
