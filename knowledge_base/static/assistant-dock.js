/* Reserve workspace space for the existing assistant. This never mounts an
   editor, reloads a page or changes conversation/document state. */
(() => {
  function mount(){
    const root=document.documentElement,layout=document.querySelector('.layout'),content=document.getElementById('contentArea'),assistant=document.getElementById('assistantArea');
    if(!layout||!content||!assistant)return;
    let frame=0;
    const set=(name,value)=>{if(root.style.getPropertyValue(name)!==value)root.style.setProperty(name,value);};
    const toggle=(name,value)=>{if(root.classList.contains(name)!==value)root.classList.toggle(name,value);};
    function paint(){
      frame=0;
      const open=!assistant.classList.contains('hidden');
      if(!open){toggle('atlas-assistant-docked',false);toggle('atlas-assistant-stacked',false);set('--atlas-assistant-space','0px');return;}
      const viewport=window.visualViewport;
      const top=Math.max(viewport?.offsetTop||0,layout.getBoundingClientRect().top);
      const bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight);
      const height=Math.max(200,bottom-top),available=root.clientWidth-Math.max(0,content.getBoundingClientRect().left);
      const stacked=root.clientWidth<=700||available<680;
      set('--atlas-assistant-top',`${top}px`);set('--atlas-assistant-height',`${height}px`);
      const peekOpen=!document.getElementById('pagePeekOverlay')?.classList.contains('hidden');
      set('--atlas-assistant-max-width',`${Math.max(320,available-(peekOpen?360:320))}px`);
      set('--atlas-assistant-stack-height',`${Math.round(Math.min(Math.max(320,height*.55),Math.max(200,height-160)))}px`);
      toggle('atlas-assistant-stacked',stacked);toggle('atlas-assistant-docked',!stacked);
      set('--atlas-assistant-space',stacked?'0px':`${Math.ceil(assistant.getBoundingClientRect().width)}px`);
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};
    new MutationObserver(schedule).observe(assistant,{attributes:true,attributeFilter:['class']});
    new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['class']});
    const peek=document.getElementById('pagePeekOverlay');
    if(peek)new MutationObserver(schedule).observe(peek,{attributes:true,attributeFilter:['class','data-peek-mode']});
    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(schedule);for(const node of [layout,content,assistant])observer.observe(node);
    }
    window.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
