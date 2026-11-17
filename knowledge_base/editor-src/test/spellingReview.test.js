import assert from 'node:assert/strict';
// No browser globals required to validate the common range contract.
import {mappedFinding,reviewContext,registerSpellingEngine} from '../src/spellingReview.js';
const fragment={text:'😀 abjeto',positions:[5,6,7,8,9,10,11,12,13],blocked:Array(9).fill(false),paragraph:4};
assert.equal(mappedFinding(fragment,{offset:1,length:1,replacements:['x']}),null,'Never split a surrogate pair');
assert.equal(mappedFinding(fragment,{offset:3,length:6,replacements:['objeto']}).from,8);
assert.equal(mappedFinding({...fragment,blocked:[false,false,false,true,false,false,false,false,false]}, {offset:3,length:6,replacements:['objeto']}),null,'Exclude protected content');
assert.equal(mappedFinding(fragment,{offset:9,length:0,replacements:['.']}).from,14,'Allow punctuation insertion at paragraph end');
let calls=0,finish;
globalThis.fetch=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
const first=reviewContext('A reciept.','en-US'),second=reviewContext('A reciept.','en-US');
finish({ok:true,json:async()=>({matches:[{offset:2,length:7,replacements:['receipt']}]})});
assert.deepEqual(await first,await second);assert.equal(calls,1,'Concurrent requests deduplicated');
await reviewContext('A reciept.','en-US');assert.equal(calls,1,'Success cached');
await assert.rejects(()=>reviewContext('Text','unknown'));
console.log('PASS: protected/Unicode ranges, contextual request deduplication, cache and language validation.');

registerSpellingEngine({correct:word=>['staging','identificadores'].includes(word),languageFor:()=> 'es'});
globalThis.fetch=async()=>({ok:true,json:async()=>({matches:[
  {offset:0,length:7,replacements:['stagings'],ruleId:'MORFOLOGIK_RULE_ES'},
  {offset:8,length:7,replacements:['objeto'],ruleId:'MORFOLOGIK_RULE_ES'},
  {offset:16,length:4,replacements:['más'],ruleId:'SPANISH_SPECIFIC_GRAMMAR'},
]})});
const findings=await reviewContext('staging abjetoo mas.','auto');
assert.ok(!findings.some(m=>m.offset===0),'Do not mark a valid foreign word as a generic dictionary miss');
assert.ok(findings.some(m=>m.ruleId==='SPANISH_SPECIFIC_GRAMMAR'),'Keep specific contextual grammar rules');
console.log('PASS: valid foreign words excluded from generic spelling findings, specific grammar findings retained.');
