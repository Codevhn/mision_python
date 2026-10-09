import assert from "node:assert";
import { BlockNoteEditor } from "@blocknote/core";
import { schema } from "../src/schema.js";
import { mdToBlocks, blocksToMd } from "../src/markdown.js";

function roundTrip(md) {
  const editor = BlockNoteEditor.create({ schema, _headless: true });
  editor.replaceBlocks(editor.document, mdToBlocks(md));
  return blocksToMd(editor.document);
}

function check(name, md, expected) {
  const out = roundTrip(md);
  assert.strictEqual(out, expected ?? md, `FAILED: ${name}\n--- got ---\n${out}\n--- want ---\n${expected ?? md}`);
  console.log("ok -", name);
}

check("heading", "# Title");
check("h4", "#### Sub");
check("bullet", "- one\n\n- two");
check("todo checked", "- [x] done");
check("todo unchecked", "- [ ] pending");
check("quote", "> hello");
check("divider", "---");
check("code", "```js\nconsole.log(1)\n```");
check("pagelink", "[[Other Page|abc123]]");
check("color", "<!-- color:red bgColor:blue -->\n# Colored");

// A browser HTML paste can leave textColor/backgroundColor as a raw CSS
// value (e.g. "rgb(31, 31, 31)") instead of one of BlockNote's 9 named
// tokens. BlockNote has no CSS rule for anything but those tokens, so such
// a value never renders any color anyway — but the old color-comment regex
// only matched \w+, so re-parsing it back out failed silently and the
// whole "<!-- color:... -->" line fell through as literal paragraph text.
// Must now be dropped cleanly instead of leaking into the document.
check(
  "pasted raw-rgb color is dropped, not leaked as text",
  "<!-- color:rgb(31, 31, 31) bgColor:rgba(0, 0, 0, 0) -->\n# Hola",
  "# Hola",
);
check(
  "pasted raw-rgb color on a paragraph is dropped, not leaked as text",
  "<!-- color:rgb(31, 31, 31) bgColor:rgba(0, 0, 0, 0) -->\nHola mundo",
  "Hola mundo",
);
check("toggle", ":::toggle Header\ninner text\n:::");
check("toggle-h2", ":::toggle-h2 Header2\ninner text\n:::");
check("database", ':::database\n{"cols":[{"id":"c0","name":"Nombre"}],"rows":[{"id":"r0","cells":{"c0":"x"}}]}\n:::');
check("table", "| a | b |\n| c | d |", "| a | b |\n| --- | --- |\n| c | d |");

// Legacy content sometimes used a separator-only line (e.g. "|---|") as a
// blank-space hack before this editor existed. That has zero real rows, so
// BlockNote's table node would previously throw RangeError on load; it must
// now degrade to a blank paragraph instead of crashing the whole editor.
check("legacy blank table hack", "|---|", "");

// NOTE: toggle-inside-toggle round-tripping was already broken in the legacy
// static/editor.js (its fence-scanning loop stops at the first nested `:::`
// line, mistaking it for the closing fence). Not fixed here — out of scope,
// matches pre-existing behavior.

console.log("\nBase markdown round-trip tests passed.");

// Code marks exclude other marks; preserve emphasis around literal code.
check('italic surrounding inline code', '*Clave `id_cliente` compartida*', '_Clave _`id_cliente`_ compartida_');
check('bold surrounding inline code', '**Tabla `clientes` relacionada**', '**Tabla **`clientes`** relacionada**');
check('strike surrounding inline code', '~~Usar `viejo_id` aquí~~', '~~Usar ~~`viejo_id`~~ aquí~~');
check('inline code preserves markdown-looking literals', '`**literal** _variable_ [x](url)`');
check('mixed marks in table cell', '| Valor |\n| --- |\n| *Clave `id_cliente`* |', '| Valor |\n| --- |\n| _Clave _`id_cliente` |');

check('simple inline LaTeX becomes Unicode', 'Una relación \\(R\\) con \\(A_1, A_2, \\dots, A_n\\).', 'Una relación R con A₁, A₂, …, Aₙ.');
check('display LaTeX becomes a readable formula', '\\[\nR \\subseteq D_1 \\times D_2 \\times \\dots \\times D_n\n\\]', 'R ⊆ D₁ × D₂ × … × Dₙ');
check('math inside inline code stays literal', '`\\(x_1\\)`');
check('math inside fenced code stays literal', '```python\nprint("\\(x_1\\)")\n```');
check('unsupported complex LaTeX stays intact', '\\(\\frac{x}{y}\\)');

// CommonMark indents code and continuation prose under each numbered step.
const pipSteps = [
  '1. **Crear un entorno**',
  '   ```bash',
  '   # Linux/macOS',
  '   python3 -m venv .venv',
  '   # Windows',
  '   py -m venv .venv',
  '   ```',
  '',
  '2. **Activar el entorno**',
  '   - **Linux/macOS:** `source .venv/bin/activate`',
  '   - **Windows (cmd):** `.venv\\Scripts\\activate.bat`',
  '',
  '3. **Ejecutar pip**',
  '   ```bash',
  '   python -m pip install requests',
  '   ```',
  '   Usa el intérprete elegido con `python -m pip`.',
  '',
  '4. **Operaciones básicas**',
  '   - **Listar:** `python -m pip list`',
  '',
  '5. **Verificar el paquete**',
  '   ```bash',
  '   python -m pip show requests',
  '   ```',
].join('\n');
const pipBlocks = mdToBlocks(pipSteps);
assert.strictEqual(pipBlocks.length, 5);
assert(pipBlocks.every(block => block.type === 'numberedListItem'));
assert.strictEqual(pipBlocks[0].children[0].type, 'codeBlock');
assert.strictEqual(pipBlocks[0].children[0].props.language, 'bash');
assert.strictEqual(pipBlocks[0].children[0].content[0].text, '# Linux/macOS\npython3 -m venv .venv\n# Windows\npy -m venv .venv');
assert.strictEqual(pipBlocks[1].children.length, 2);
assert.strictEqual(pipBlocks[2].children[1].type, 'paragraph');
const savedPip = roundTrip(pipSteps);
assert.strictEqual(roundTrip(savedPip), savedPip, 'nested code must survive repeated save/reload');
const reloadedPip = mdToBlocks(savedPip);
assert.strictEqual(reloadedPip.length, 5);
assert.deepStrictEqual(reloadedPip.map(b => b.children.map(c => c.type)), [
  ['codeBlock'], ['bulletListItem', 'bulletListItem'], ['codeBlock', 'paragraph'], ['bulletListItem'], ['codeBlock'],
]);
console.log('ok - assistant pip workflow keeps code, paragraphs and lists nested across save/reload');
check('code indentation preserved inside list', '1. Run\n  ```python\n  if True:\n      print("ok")\n  ```');
check('tilde fence inside list', '1. Run\n   ~~~bash\n   echo hello\n   ~~~', '1. Run\n  ```bash\n  echo hello\n  ```');
check('long fence preserves embedded fence', '````text\n```\nliteral\n```\n````');
const longCode = '```text\n' + Array.from({length: 510}, (_, i) => `line ${i}`).join('\n') + '\n```';
check('long code is not truncated or leaked into paragraphs', longCode);
