import assert from 'node:assert/strict';
import {SaveQueue,filteredRows,groupRows,aggregate,normalizeSchema,PROPERTY_TYPES,VIEW_TYPES,displayValue} from '../src/databaseModel.js';
const rows=[{id:'a',title:'Alfa',order:0,properties:[{id:'n',value:0},{id:'s',value:'Pendiente'}]},{id:'b',title:'Beta',order:1,properties:[{id:'n',value:4},{id:'s',value:'Hecho'}]}];
assert.equal(PROPERTY_TYPES.length,22);assert.equal(VIEW_TYPES.length,11);
const schema=normalizeSchema({database_id:'db_a',views:[{id:'a',name:'A'},{id:'b',type:'board',hidden:['n']}]});
schema.views[0].hidden=['s'];assert.deepEqual(schema.views[1].hidden,['n']);
assert.deepEqual(filteredRows(rows,{filters:[{colId:'n',op:'is',value:'0'}]}).map(r=>r.id),['a']);
assert.deepEqual(filteredRows(rows,{sorts:[{colId:'n',dir:'desc'}]}).map(r=>r.id),['b','a']);
assert.deepEqual(groupRows(rows,{id:'s',name:'Estado',type:'select'}).map(([name,items])=>[name,items.map(r=>r.id)]),[['Pendiente',['a']],['Hecho',['b']]]);
assert.equal(aggregate(rows,'n','average'),2);
let fail=true;const saves=[];const queue=new SaveQueue(async payload=>{if(fail)throw new Error('offline');saves.push(payload);});
queue.set({raw_text:'cuerpo'});await assert.rejects(queue.flush(),/offline/);assert.equal(queue.pending.raw_text,'cuerpo');
queue.set({title:'Título'});fail=false;await queue.flush();assert.deepEqual(saves,[{raw_text:'cuerpo',title:'Título'}]);assert.equal(queue.pending,null);
let release;const held=new Promise(resolve=>{release=resolve;});let first=true;const serial=[];
const inFlight=new SaveQueue(async p=>{serial.push(p.raw_text);if(first){first=false;await held;}});
inFlight.set({raw_text:'uno'});const flush=inFlight.flush();inFlight.set({raw_text:'dos'});release();await flush;assert.deepEqual(serial,['uno','dos']);
console.log('databaseWorkspace: shared records, view state, calculations and save recovery passed');
const legacy=normalizeSchema({columns:[{id:'s',type:'status'}],filter:{colId:'s',value:'Hecho'},sort:{colId:'__title',dir:'desc'},calc:{__title:'count_all'},titleWidth:370});
assert.deepEqual(filteredRows(rows,legacy.views[0]).map(r=>r.id),['b']);assert.equal(legacy.views[0].calculations.title,'count');assert.equal(legacy.views[0].titleWidth,370);
assert.equal(aggregate(rows,'title','count_empty'),0);

assert.equal(displayValue('valor original','person'),'valor original');assert.equal(displayValue([null,'a']),', a');

assert.equal(filteredRows([{id:'empty',title:'Vacío',properties:[]}],{filters:[{colId:'n',op:'gt',value:-1}]}).length,0);
assert.equal(filteredRows([{id:'tags',title:'Etiquetas',properties:[{id:'tags',value:['A','B']}]}],{filters:[{colId:'tags',op:'not',value:'A'}]}).length,0);

const {columnsForView,moveViewColumn,emptyGroupLabel}=await import('../src/databaseModel.js');
const columnSchema={columns:[{id:'a'},{id:'b'},{id:'c'}]};const independent={hidden:['b']};
assert.deepEqual(columnsForView(columnSchema,{columnOrder:['c','missing','c'],hidden:['b']}).map(c=>c.id),['c','a']);
assert.deepEqual(moveViewColumn(columnSchema,{},'c','a'),['c','a','b']);
assert.deepEqual(moveViewColumn(columnSchema,{},'a','c',true),['b','c','a']);
assert.deepEqual(columnsForView(columnSchema,independent).map(c=>c.id),['a','c']);
assert.deepEqual(columnSchema.columns.map(c=>c.id),['a','b','c']);
const collisionCol={id:'s',type:'multi_select',name:'Estado',options:[{label:'Sin Estado'},{label:'Sin Estado especial'}]};
const collisionRows=[{title:'Real',properties:[{id:'s',value:['Sin Estado','Sin Estado']}]},{title:'Vacío',properties:[{id:'s',value:[]}]}];
const collisionGroups=groupRows(collisionRows,collisionCol);assert.equal(collisionGroups.find(([k])=>k==='Sin Estado')[1].length,1);assert.equal(collisionGroups.find(([k])=>k===emptyGroupLabel(collisionRows,collisionCol))[1][0].title,'Vacío');
console.log('databaseWorkspace: view column order, schema isolation and non-colliding/deduplicated multi-selection groups passed');
