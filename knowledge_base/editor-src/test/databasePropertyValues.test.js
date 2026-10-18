import assert from 'node:assert/strict';
import {numberDraft,dateParts,dateWithTime,dateLabel,moveOption} from '../src/databasePropertyValues.js';
assert.equal(numberDraft('0'),0);assert.equal(numberDraft(' -8,5 '),-8.5);assert.equal(numberDraft('1e2'),100);assert.equal(numberDraft(' '),'');
for(const value of ['1e','-','NaN','Infinity','1e999','1,234.5','0x12'])assert.throws(()=>numberDraft(value));
const original='2026-10-18T00:10:05+03:00',parts=dateParts(original);
assert.equal(dateWithTime(parts.day,parts.time,parts.zone),original);
assert(dateLabel(original).includes('00:10:05 UTC+03:00'));assert(dateLabel(original).includes('18'));
assert.equal(dateWithTime('2026-10-18','','Z'),'2026-10-18');
assert.equal(dateParts('legacy value').original,'legacy value');
const options=[{id:'a',label:'A',color:'#123456',_original:'A',group:'Pendiente'},{id:'b',label:'B'},{id:'c',label:'C'}];
const moved=moveOption(options,0,2);assert.equal(moved[2],options[0]);assert.equal(moved[2]._original,'A');assert.equal(moved[2].group,'Pendiente');assert.equal(options[0].id,'a');assert.equal(moveOption(options,0,-1),options);
console.log('databasePropertyValues: invalid number drafts never become null, zoned timestamps survive edits, option identity/order preserved');

const dates=await import('../src/databasePropertyValues.js');
const range={start:'2026-10-18T01:10:05+03:00',end:'2026-10-21T02:11:06+03:00'};
assert.equal(dates.dateStart(range),range.start);assert.equal(dates.dateEnd(range),range.end);
assert(dates.dateLabel(range).includes('→')&&dates.dateLabel(range).includes('02:11:06'));
assert.equal(dates.dateStart('2026-10-18'),'2026-10-18');

assert(dates.dateLabel(range,{date_format:'iso',time_format:'12'}).includes('2026-10-21 02:11:06 a. m. UTC+03:00'));
assert(dates.dateLabel('2026-10-18T13:10:05+03:00',{time_format:'12'}).includes('01:10:05 p. m.'));
assert(dates.dateLabel('2026-10-18',{date_format:'long'}).includes('octubre'));
