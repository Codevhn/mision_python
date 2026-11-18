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

const fragments = [
  'Argumentos de la línea de comandos. Un uso importante de las cadenas en Java',
  'consiste en permitir que se pase información desde la línea de comandos al',
  'programa. El mecanismo es sencillo. Cuando escribes la orden',
  'java', 'seguida del',
  'nombre de una biblioteca y de una secuencia de cadenas, el sistema Java invoca el',
  'método', 'main()',
  'de esa biblioteca y le pasa como argumento un arreglo con las',
  'cadenas que escribiste después del nombre de la biblioteca. Por ejemplo,',
  'main()', 'de', 'BusquedaBinaria',
  'recibe un argumento de la línea de comandos, por lo que el sistema',
  'crea un arreglo de tamaño uno. El programa usa ese valor,', 'args[0]',
  ', como nombre del', 'archivo que contiene la lista blanca, para pasarlo como argumento a',
  'In.readInts()', '.',
];
const expected = fragments.join(' ').replace('args[0] ,','args[0],').replace('In.readInts() .','In.readInts().');
assert.equal(reflowClipboardText(fragments.join('\n')),expected);
assert.equal(reflowClipboardText('Título corto\n'+fragments.join('\n')),'Título corto\n'+expected);
assert.equal(reflowClipboardText(fragments.join('\n')+'\n\nOtro párrafo.'),expected+'\n\nOtro párrafo.');
assert.equal(reflowClipboardText('String\nint\ndouble\nparseInt()'),'String\nint\ndouble\nparseInt()');
console.log('PASS fragmented PDF prose: inline identifiers, punctuation, leading title and real paragraph boundaries');

assert.equal(reflowClipboardText('Necesitarás:\n• Primer elemento.\n• Segundo elemento.'),'Necesitarás:\n- Primer elemento.\n- Segundo elemento.');
assert.equal(reflowClipboardText('```text\n• Literal\n```'),'```text\n• Literal\n```');
assert.equal(reflowClipboardText('1. '+fragments.join('\n')+'\n2. Otro paso.'),'1. '+expected+'\n2. Otro paso.');
