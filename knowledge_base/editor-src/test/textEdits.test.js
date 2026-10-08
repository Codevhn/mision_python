import assert from 'node:assert/strict';
import {textEdits} from '../src/textEdits.js';

for (const [before,after] of [
  ['Hola, mi bro, increible.','Hola, mi bro, increíble.'],
  ['😀 8 anos en llegar almillon','😀 8 años en llegar al millón'],
  ['un texto con faltas y mas faltas','un texto con errores y más faltas'],
  ['Hola','¡Hola!'], ['', 'Nuevo'], ['Borrar', ''], ['sin cambios','sin cambios'],
]) {
  let value = before;
  for (const e of textEdits(before,after).reverse()) value = value.slice(0,e.from) + e.text + value.slice(e.to);
  assert.equal(value,after);
}
const edits = textEdits('un texto correcto y otro incorecto', 'un texto correcto y otro incorrecto');
assert.equal(edits.length,1);
assert.equal(edits[0].from,25); // unchanged formatted words are never replaced
console.log('PASS: conservative spelling edits, punctuation, Unicode, insertions and deletions.');
