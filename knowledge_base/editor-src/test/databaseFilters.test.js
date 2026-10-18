import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filteredRows} from '../src/databaseModel.js';
import {filterOperations,storedFilterOperations,relativeRange,validateFilterTree} from '../src/databaseFilters.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/databaseFilters.json',import.meta.url)));
for(const {rule,ids} of fixture.cases)assert.deepEqual(filteredRows(fixture.rows,{filters:[rule]}).map(r=>r.id),ids,JSON.stringify(rule));
assert(!filterOperations('checkbox').some(([op])=>op==='gt'));
assert(!filterOperations('text').some(([op])=>op==='gt'));
assert(filterOperations('date').some(([op,label])=>op==='lt'&&label==='Antes de'));
assert(storedFilterOperations('text','gt').some(([op,label])=>op==='gt'&&label.includes('guardado')),'Legacy rules remain visible for deliberate editing');
assert.equal(filteredRows(fixture.rows,{filterMode:'or',filters:[fixture.cases[0].rule,{colId:'n',op:'gt',value:4}]}).length,2);
console.log('database filters: shared Python/JS cases, zoned day equality/bounds, finite numbers, booleans, exact tags and legacy rule retention passed');

for(const {view,ids,now,rows=fixture.rows} of fixture.tree_cases)assert.deepEqual(filteredRows(rows,view,'',new Date(now||'2026-10-19T00:30:00Z')).map(r=>r.id),ids,JSON.stringify(view));
for(const test of fixture.range_cases)assert.deepEqual(relativeRange(test.period,test.today),test.range,JSON.stringify(test));
assert.throws(()=>validateFilterTree(Array.from({length:101},()=>({colId:'n'}))),/100/);
let deep={colId:'n',op:'is',value:0};for(let i=0;i<9;i++)deep={mode:'and',rules:[deep]};assert.throws(()=>validateFilterTree([deep]),/8 niveles/);
console.log('nested filters: empty groups, mixed AND/OR, zone boundaries, Monday weeks, leap/year transitions and bounded trees passed');
