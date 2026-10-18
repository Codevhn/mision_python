import assert from 'node:assert/strict';
import {SideMenuExtension} from '@blocknote/core/extensions';
import {foregroundEditorAtPoint,installForegroundEditorHitTesting} from '../src/editorHitTesting.js';
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
console.log('editorHitTesting: foreground Peek wins overlapping-editor ties; normal pages keep native behavior');
