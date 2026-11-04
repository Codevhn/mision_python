import assert from 'node:assert/strict';
import { reflowClipboardText } from '../src/clipboardProse.js';
const line = 'Un párrafo extenso que viene del libro y debe adaptarse al ancho del editor';
assert.equal(reflowClipboardText(line + '\ncontinúa en la siguiente línea.'), line + ' continúa en la siguiente línea.');
for (const text of [
  line + '\n\nOtro párrafo independiente.',
  'Un verso breve\nOtro verso breve',
  line + '  \nSalto explícito Markdown.',
  line + '\\\nSalto explícito Markdown.',
  line + '\n- Un elemento de lista.',
  line + '\n1. Un elemento numerado.',
  line + '\n## Encabezado independiente',
  line + '\n> Una cita independiente',
  line + '\n    Código con sangría.',
  '```python\n' + line + '\ncontinúa como código literal\n```',
  '~~~~text\n' + line + '\ncontinúa como texto literal\n~~~~',
]) assert.equal(reflowClipboardText(text), text, text);
console.log('PASS clipboard prose: PDF reflow and structural/literal boundaries');
