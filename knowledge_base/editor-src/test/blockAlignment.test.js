import assert from 'node:assert/strict';
import {firstLineAlignment,firstLineCenter} from '../src/blockAlignment.js';

function fixture({top=120,lineTop=145,lineHeight=38,blockHeight=240,scale=1,empty=false}={}){
  const text={textContent:'Heading with multiple lines',length:27};
  const doc={createTreeWalker:()=>{let seen=false;return {nextNode:()=>seen?null:(seen=true,empty?null:text)};},
    createRange:()=>({setStart(){},setEnd(){},getClientRects:()=>[{top:lineTop,height:lineHeight,width:100}]}),
    defaultView:{getComputedStyle:()=>({paddingTop:'8px',lineHeight:'32px',fontSize:'20px'})}};
  const inline={ownerDocument:doc,getBoundingClientRect:()=>({top,height:blockHeight})};
  const content={querySelector:()=>inline};
  const element={querySelector:()=>content,getBoundingClientRect:()=>({top,height:blockHeight})};
  const state={elements:{reference:{contextElement:element}},rects:{reference:{y:40,height:blockHeight/scale},floating:{height:24}}};
  return {inline,element,state};
}
for(const size of [16,26,32,48]){
  const {element,state}=fixture({lineHeight:size});
  assert.equal(firstLineCenter(element),145+size/2);
  assert.equal(firstLineAlignment().fn(state).y,40+25+size/2-12);
}
// Wrapped blocks anchor the first fragment regardless of total height.
assert.equal(firstLineAlignment().fn(fixture({blockHeight:600}).state).y,firstLineAlignment().fn(fixture({blockHeight:100}).state).y);
assert.equal(firstLineAlignment().fn(fixture({scale:1.5}).state).y,40+44/1.5-12);
assert.equal(firstLineCenter(fixture({empty:true}).element),144);
assert.deepEqual(firstLineAlignment().fn({elements:{reference:{}}}),{});
console.log('blockAlignment: first rendered line, heading sizes, wrapped/empty blocks and scaled offset-parent coordinates passed');
