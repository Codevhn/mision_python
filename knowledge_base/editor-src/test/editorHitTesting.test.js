import assert from 'node:assert/strict';
import {SideMenuExtension} from '@blocknote/core/extensions';
import {foregroundEditorAtPoint,installForegroundEditorHitTesting,isSideMenuTransit,installSideMenuTransit} from '../src/editorHitTesting.js';
// Contract against the pinned BlockNote implementation: upgrades must not
// silently remove the method our narrow overlapping-surface adapter wraps.
const native=SideMenuExtension()({editor:{}});
assert.equal(typeof native.prosemirrorPlugins[0].spec.view,'function');
const editor={querySelector:()=>({getBoundingClientRect:()=>({left:100,right:400,top:100,bottom:300})})};
const surface={querySelector:()=>editor};
let active=true;
const root={elementFromPoint:()=>({closest:selector=>selector==='.page-peek-modal'&&active?surface:null})};
assert.equal(foregroundEditorAtPoint(root,{clientX:150,clientY:150}),editor);
const view={pmView:{dom:{ownerDocument:root}},findClosestEditorElement:()=>({element:'background',distance:0})};
const extension={prosemirrorPlugins:[{spec:{view:()=>view}}]};
installForegroundEditorHitTesting(extension);const once=extension.prosemirrorPlugins[0].spec.view;
installForegroundEditorHitTesting(extension);assert.equal(extension.prosemirrorPlugins[0].spec.view,once);
extension.prosemirrorPlugins[0].spec.view();
assert.deepEqual(view.findClosestEditorElement({clientX:150,clientY:150}),{element:editor,distance:0});
assert.equal(view.findClosestEditorElement({clientX:80,clientY:150}).distance,20);
active=false;assert.deepEqual(view.findClosestEditorElement({clientX:150,clientY:150}),{element:'background',distance:0});

const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
const handle={closest:()=>null};
const gap={closest:()=>null};
const menu={contains:target=>target===handle,getBoundingClientRect:()=>rect(100,100,148,124)};
const block={
  getAttribute:name=>name==='data-id'?'block-1':null,
  getBoundingClientRect:()=>rect(154,96,600,150),
  querySelector:()=>({getBoundingClientRect:()=>rect(165,100,560,140)}),
};
const listeners=[];
const movement=[];
const normalView={
  state:{show:true,block:{id:'block-1'}},hoveredBlock:block,menuFrozen:false,
  editor:{portalElement:{querySelector:()=>menu}},
  pmView:{dom:{closest:()=>null},root:{
    removeEventListener:(...args)=>listeners.push(['remove',...args]),
    addEventListener:(...args)=>listeners.push(['add',...args]),
  }},
  onMouseMove:event=>movement.push(event),
};
const throughGap={clientX:155,clientY:112,target:gap};
assert.equal(isSideMenuTransit(normalView,throughGap),true);
assert.equal(isSideMenuTransit(normalView,{clientX:120,clientY:112,target:handle}),true);
assert.equal(isSideMenuTransit(normalView,{clientX:195,clientY:112,target:gap}),false);
assert.equal(isSideMenuTransit(normalView,{clientX:155,clientY:175,target:gap}),false);
installSideMenuTransit(normalView);
assert.deepEqual(listeners.map(item=>[item[0],item[1],item[3]]),[['remove','mousemove',true],['add','mousemove',true]]);
normalView.onMouseMove(throughGap);
assert.equal(movement.length,0,'crossing the gutter retains the block and its click target');
normalView.onMouseMove({clientX:195,clientY:112,target:gap});
assert.equal(movement.length,1,'normal block hit testing resumes outside the narrow bridge');
installSideMenuTransit(normalView);
assert.equal(listeners.length,2,'pointer bridge is installed only once');
normalView.pmView.dom.closest=()=>({});
assert.equal(isSideMenuTransit(normalView,throughGap),false,'Peek keeps its native hover handling');
console.log('editorHitTesting: foreground Peek wins ties; full-page side controls retain a narrow interactive gutter');
