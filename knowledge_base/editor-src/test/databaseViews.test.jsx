import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import {DatabaseAlternateView} from '../src/databaseViews.jsx';
import {VIEW_TYPES} from '../src/databaseModel.js';
const schema={columns:[{id:'s',name:'Estado',type:'status'},{id:'n',name:'Número',type:'number'},{id:'date',name:'Fecha',type:'date'},{id:'place',name:'Lugar',type:'place'}]};
const rows=[{id:'same-record',title:'Registro compartido',created_at:'2026-10-16',properties:[{id:'s',value:'No iniciado'},{id:'n',value:0},{id:'date',value:new Date().toISOString().slice(0,10)},{id:'place',value:{name:'Lugar de prueba',lat:14.08,lng:-87.2}}]}];
const outputs=new Map();
for(const[type]of VIEW_TYPES.filter(([id])=>id!=='table')){
  const html=renderToStaticMarkup(<DatabaseAlternateView view={{type,name:type,groupBy:'s',dateProperty:'date',placeProperty:'place',chartProperty:'n'}} schema={schema} rows={rows} base="/api/test" onRow={()=>{}} openRow={()=>{}} addRow={()=>{}}/>);
  outputs.set(type,html);
  assert(!html.includes('adb-table'),'Alternate views must not fall back to a table');
  assert(html.includes('Registro compartido')||['chart','dashboard','form'].includes(type),type+' must represent the record');
}
assert(outputs.get('board').includes('draggable="true"'));
assert(outputs.get('calendar').includes('adb-calendar-day'));
assert(outputs.get('timeline').includes('adb-timeline-bar'));
assert(outputs.get('map').includes('aria-label="Registro compartido · Lugar de prueba"'));
assert(outputs.get('form').includes('<form'));
assert.equal(new Set(outputs.values()).size,10);
console.log('databaseViews: ten distinct alternate renderers share records without table stand-ins');

for(const type of ['chart','dashboard'])assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(DatabaseAlternateView,{view:{type,name:type},schema,rows,base:'/api/test',openRow:()=>{},onRow:()=>{}})));

// One range is projected on multiple days without duplicating its identity.
const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const wednesday=new Date(monday);wednesday.setDate(wednesday.getDate()+2);
const rangeRows=[{...rows[0],properties:[{id:'date',type:'date',value:{start:localDay(monday),end:localDay(wednesday)}}]}];
const week=renderToStaticMarkup(<DatabaseAlternateView view={{type:'calendar',calendarLayout:'week',dateProperty:'date'}} schema={schema} rows={rangeRows} base="/api/test" openRow={()=>{}} onRow={()=>{}}/>);
assert.equal((week.match(/class="adb-calendar-record"/g)||[]).length,3);
assert.equal((week.match(/role="group" aria-label="Día /g)||[]).length,7);
assert(week.includes('Semana anterior')&&week.includes('Semana siguiente'));
const interval=renderToStaticMarkup(<DatabaseAlternateView view={{type:'timeline',dateProperty:'date'}} schema={schema} rows={rangeRows} base="/api/test" openRow={()=>{}}/>);
assert(interval.includes(localDay(monday))&&interval.includes(localDay(wednesday)));
console.log('date ranges: inclusive week projection, single identity and Timeline endpoint reuse passed');

assert(!interval.slice(interval.indexOf('class="adb-unscheduled"')).includes('Registro compartido'),'A range must not also appear under Sin fecha');
