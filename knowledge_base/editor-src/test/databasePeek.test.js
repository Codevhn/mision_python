import assert from 'node:assert/strict';
import {peekNeighbors,recordPresentation,recordLayout} from '../src/databasePeekModel.js';
// The view's ordering and filtering determine navigation; no index wrap and
// no automatic fallback to another database for a newly created hidden row.
assert.deepEqual(peekNeighbors(['z','a','b'],'a'),{previous:'z',next:'b'});
assert.deepEqual(peekNeighbors(['z','a','b'],'z'),{previous:null,next:'a'});
assert.deepEqual(peekNeighbors(['z','a','b'],'b'),{previous:'a',next:null});
assert.deepEqual(peekNeighbors(['a','a','b'],'a'),{previous:null,next:'b'});
assert.deepEqual(peekNeighbors(['a','b'],'new'),{previous:null,next:null});
assert.deepEqual(recordPresentation({font:'serif',full_width:true,small_text:'false'}),{font:'serif',full_width:true,small_text:false,property_icons:true,table_of_contents:false});
assert.equal(recordPresentation({font:'injected-font'}).font,'default');
console.log('databasePeek: visible-record navigation boundaries and presentation compatibility passed');
assert.deepEqual(recordLayout({order:['removed','b','b'],hidden:['removed','b'],panel:['a']},[{id:'a'},{id:'b'},{id:'new'}]),{structure:'simple',property_icons:true,order:['b','a','new'],hidden:['b'],panel:['a']});

assert.equal(recordLayout(null).structure,"simple");
assert.deepEqual(recordLayout({order:"bad",hidden:false,panel:42},[{id:"a"}]).order,["a"]);
