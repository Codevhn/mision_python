import React,{useRef} from 'react';
import {resizeWidgetSize,widgetWidth} from './dashboardModel.js';

export function DashboardResizeHandle({widget,onPreview,onCommit,onCancel}){
  const session=useRef(null);
  const measure=element=>{
    const section=element.closest('.adb-dashboard-widget');
    const grid=section.parentElement;
    const rect=section.getBoundingClientRect();
    const scale=rect.width/section.offsetWidth||1;
    const gap=(parseFloat(getComputedStyle(grid).columnGap)||0)*scale;
    const gridWidth=grid.getBoundingClientRect().width;
    const widthLocked=grid.clientWidth<=640;
    return {width:widgetWidth(widget),renderedWidth:(rect.width+gap)/(gridWidth+gap)*100,
      height:widget.height,scale,gap,gridWidth,widthLocked};
  };
  const finish=(element,commit)=>{
    const active=session.current;
    if(!active)return;
    session.current=null;
    if(element.hasPointerCapture(active.pointer))element.releasePointerCapture(active.pointer);
    if(commit&&active.next&&(active.next.width!==active.start.width||active.next.height!==active.start.height))onCommit(active.next);
    else onCancel();
  };
  const help='Flechas para cambiar ancho y altura; Mayús acelera. Escape cancela el arrastre. En panel estrecho sólo cambia la altura.';
  return <button type="button" className="adb-dashboard-resize" aria-label={'Redimensionar widget '+widget.title}
    aria-describedby={'widget-size-help-'+widget.id} title={help}
    onPointerDown={e=>{
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});
      session.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,start:measure(e.currentTarget)};
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e=>{
      const active=session.current;
      if(!active||e.pointerId!==active.pointer)return;
      e.preventDefault();e.stopPropagation();
      active.next=resizeWidgetSize(active.start,e.clientX-active.x,e.clientY-active.y);
      onPreview(active.next);
    }} onPointerUp={e=>{e.stopPropagation();finish(e.currentTarget,true);}}
    onPointerCancel={e=>finish(e.currentTarget,false)} onLostPointerCapture={e=>finish(e.currentTarget,false)}
    onClick={e=>e.stopPropagation()} onKeyDown={e=>{
      if(e.key==='Escape'&&session.current){e.preventDefault();e.stopPropagation();finish(e.currentTarget,false);return;}
      const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      const direction=directions[e.key];
      if(!direction||session.current)return;
      e.preventDefault();e.stopPropagation();
      const step=e.shiftKey?40:10;
      const start=measure(e.currentTarget);
      const next=resizeWidgetSize(start,direction[0]*step*start.scale,direction[1]*step*start.scale);
      if(next.width!==widgetWidth(widget)||next.height!==widget.height)onCommit(next);
    }}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 13 13 5M9 13l4-4"/></svg>
    <span className="adb-sr-only" id={'widget-size-help-'+widget.id}>{help}</span>
  </button>;
}
