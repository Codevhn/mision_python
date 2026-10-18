import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MenuItem} from '../src/databaseUI.jsx';
import {menuKeyDown,focusMenuItem} from '../src/databaseMenuNavigation.js';
import {PropertyFilterValue} from '../src/PropertyFilterValue.jsx';
// Exercise navigation policy independently of React, including mixed form controls.
let focused,clicked=0,closed=0,back=0,prevented=0;
const item=(name,extra={})=>({textContent:name,tagName:'BUTTON',dataset:{},getAttribute:()=>null,
  focus(){focused=this;},scrollIntoView(){},getClientRects:()=>[{}],matches:()=>false,...extra});
const a=item('A'),b=item('B',{dataset:{menuSubmenu:'true'},click(){clicked++;}}),c=item('C');
const root={querySelectorAll:()=>[a,b,c]};
const key=(key,target=a,extra={})=>menuKeyDown({key,target,currentTarget:root,preventDefault(){prevented++;},...extra},{onBack:()=>back++,onClose:()=>closed++});
key('ArrowDown');assert.equal(focused,b);key('ArrowUp');assert.equal(focused,c);
key('Home',c);assert.equal(focused,a);key('End');assert.equal(focused,c);
key('ArrowRight',b);assert.equal(clicked,1);key('ArrowLeft',b);assert.equal(back,1);
key('Escape',b);assert.equal(back,2);assert.equal(closed,0);
const text=item('search',{tagName:'INPUT',type:'text',matches:()=>true});
focused=null;key('Home',text);key('ArrowLeft',text);assert.equal(focused,null);assert.equal(back,2);
key('ArrowDown',text);assert.equal(focused,a);
focused=null;key('ArrowDown',{...text,tagName:'SELECT'});assert.equal(focused,null);
key('ArrowDown',a,{ctrlKey:true});assert.equal(focused,null);
key('Escape',text,{isComposing:true});assert.equal(back,2);
focusMenuItem(root,'B');assert.equal(focused,b);
focusMenuItem(root,'missing');assert.equal(focused,a);
const html=renderToStaticMarkup(<MenuItem icon="settings" label="Editar propiedad" submenu onClick={()=>{}}/>);
assert(html.includes('aria-haspopup="dialog"'));assert(html.includes('data-menu-submenu="true"'));
const disabled=renderToStaticMarkup(<MenuItem label="Indisponible" disabled checked/>);
assert(disabled.includes('disabled=""'));assert(disabled.includes('aria-pressed="true"'));
console.log('databaseMenus: keyboard, form editing, IME, focus return and submenu semantics passed');

for(const type of ['date','time','number','checkbox']){focused=null;key('ArrowDown',{...text,type});assert.equal(focused,null,type+' retains native arrow editing');}
const oldOption=renderToStaticMarkup(<PropertyFilterValue column={{type:'status',options:[{label:'Nuevo'}]}} rule={{op:'is',value:'Antiguo'}} label="Filtro" onChange={()=>{}}/>);
assert(oldOption.includes('Valor guardado: Antiguo'));
const oldDate=renderToStaticMarkup(<PropertyFilterValue column={{type:'date'}} rule={{op:'is',value:'2026-10-18T12:00:00Z'}} label="Fecha" onChange={()=>{}}/>);
assert(oldDate.includes('type="text"')&&oldDate.includes('2026-10-18T12:00:00Z'));
