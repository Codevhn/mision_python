/* Course-only dock: geometry follows the reading column and open tool panels.
   Lesson ordering and navigation handlers remain owned by _updateCourseNav. */
(() => {
  function mount(){
    const root=document.documentElement,area=document.getElementById('contentArea'),entry=document.getElementById('entryView');
    if(!area||!entry)return;
    let frame=0;
    const visible=node=>node&&!node.hidden&&!node.classList.contains('hidden')&&node.getClientRects().length;
    function paint(){
      frame=0;
      const nav=document.getElementById('courseNavBar');
      if(!nav){root.classList.remove('atlas-course-navigation');return;}
      const rect=area.getBoundingClientRect(),left=Math.max(0,rect.left),bottom=window.visualViewport?innerHeight-window.visualViewport.height-window.visualViewport.offsetTop:0;
      let right=Math.min(root.clientWidth,rect.right);
      for(const panel of [document.getElementById('assistantArea'),document.querySelector('#pagePeekOverlay:not(.hidden) .page-peek-modal')]){
        if(!visible(panel))continue;
        const bounds=panel.getBoundingClientRect();
        if(bounds.right>left&&bounds.left<right)right=Math.min(right,bounds.left);
      }
      nav.hidden=!visible(entry)||right-left<240;
      root.classList.toggle('atlas-course-navigation',!nav.hidden);
      if(nav.hidden)return;
      for(const [name,value] of Object.entries({left:`${left}px`,width:`${Math.max(0,right-left)}px`,bottom:`${Math.max(0,bottom)}px`})){
        if(nav.style[name]!==value)nav.style[name]=value;
      }
      const height=`${Math.ceil(nav.getBoundingClientRect().height)}px`;
      if(root.style.getPropertyValue('--atlas-course-nav-height')!==height)root.style.setProperty('--atlas-course-nav-height',height);
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
    const observer=new MutationObserver(schedule);
    for(const node of [entry,document.getElementById('assistantArea'),document.getElementById('pagePeekOverlay')])if(node)observer.observe(node,{attributes:true,attributeFilter:['class','data-peek-mode']});
    new MutationObserver(changes=>{if(changes.some(change=>[...change.addedNodes,...change.removedNodes].some(node=>node.id==='courseNavBar')))schedule();}).observe(document.body,{childList:true});
    if(typeof ResizeObserver!=='undefined'){
      const sizes=new ResizeObserver(schedule);
      for(const node of [area,document.getElementById('assistantArea'),document.querySelector('#pagePeekOverlay .page-peek-modal')])if(node)sizes.observe(node);
    }
    window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
