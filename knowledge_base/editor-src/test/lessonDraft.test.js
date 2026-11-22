import assert from 'node:assert/strict';
import {lessonDraftBlocks} from '../src/lessonDraft.js';
const h=(id,label,level=2)=>({id,type:'heading',props:{level},content:[{type:'text',text:label}],children:[]});
const p=text=>({type:'paragraph',content:[{type:'text',text}],children:[]});
const first=h('one','IntelliJ IDEA'),second=h('two','Eclipse IDE');
const intro=p('Introducción escrita por el usuario.');
const original=[intro,first,p('Explicación anterior.'),h('child','Detalle',3),p('Texto anterior.'),second];
const generated=[h('generated-one','IntelliJ IDEA'),p('Nueva explicación uno.'),h('detail','Ejemplo',3),{type:'codeBlock',content:[{type:'text',text:'## No es un encabezado'}]},h('generated-two','Eclipse IDE'),p('Nueva explicación dos.')];
const before=JSON.stringify(original);
const result=lessonDraftBlocks(original,generated);
assert.equal(result[0],intro);assert.equal(result[1],first);assert.equal(result[5],second);
assert.equal(JSON.stringify(original),before);
assert.ok(!JSON.stringify(result).includes('Explicación anterior.'));
assert.ok(JSON.stringify(result).includes('Nueva explicación dos.'));
for(const invalid of [generated.slice(0,4),[...generated.slice(4),...generated.slice(0,4)],[p('Introducción generada sin destino.'),...generated],[...generated,h('extra','Otra lección')],[h('a','IntelliJ IDEA'),h('b','Eclipse IDE'),p('Solo uno desarrollado')]]){
  assert.throws(()=>lessonDraftBlocks(original,invalid));assert.equal(JSON.stringify(original),before);
}
assert.throws(()=>lessonDraftBlocks([first,h('duplicate','IntelliJ IDEA')],generated));
assert.throws(()=>lessonDraftBlocks([p('Sin temas')],generated));
console.log('PASS lesson draft mapping: headings/intro retained, sections replaced, nested code retained, ambiguous/incomplete drafts rejected without mutation.');
