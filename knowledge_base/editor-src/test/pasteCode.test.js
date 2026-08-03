import assert from "node:assert";
import { detectPastedCode, normalizeCodeLanguage, looksLikeCode } from "../src/pasteCode.js";

function check(name, input, wantLang, wantCode) {
  const got = detectPastedCode(input);
  assert.ok(got, `FAILED: ${name}\n--- got null, want a code block`);
  assert.strictEqual(got.language, wantLang, `FAILED: ${name} language`);
  assert.strictEqual(got.code, wantCode, `FAILED: ${name} code\n--- got ---\n${got.code}\n--- want ---\n${wantCode}`);
  console.log("ok -", name);
}

function checkNull(name, input) {
  const got = detectPastedCode(input);
  assert.strictEqual(got, null, `FAILED: ${name} — expected null, got ${JSON.stringify(got)}`);
  console.log("ok -", name);
}

check("fenced python", "```python\nprint('hola')\n```", "python", "print('hola')");
check("fenced bare fence defaults to python", "```\nx = 1\n```", "python", "x = 1");
check("fenced py alias", "```py\ndef f():\n    pass\n```", "python", "def f():\n    pass");
check("fenced python3 alias", "```python3\nprint(1)\n```", "python", "print(1)");
check("fenced js keeps language", "```js\nconsole.log(1)\n```", "javascript", "console.log(1)");
check("fenced trailing newline", "```python\nprint(1)\n```\n", "python", "print(1)");
check("fenced with spaces after fence", "```python\nx=1\n```  ", "python", "x=1");
check("tilde fence", "~~~python\nprint(1)\n~~~", "python", "print(1)");

check("indented fragment", "    a = 1\n    b = 2\n", "python", "    a = 1\n    b = 2");
check(
  "python snippet",
  "for i in range(3):\n    print(i)\n    total += i\n",
  "python",
  "for i in range(3):\n    print(i)\n    total += i",
);
check(
  "function fragment",
  "def suma(a, b):\n    return a + b\n\nprint(suma(2, 3))\n",
  "python",
  "def suma(a, b):\n    return a + b\n\nprint(suma(2, 3))",
);
check("single-line print", "print(2**10)", "python", "print(2**10)");
check("single-line assignment", 'nombre = "ana"', "python", 'nombre = "ana"');

checkNull("prose paragraph", "Hoy estudiamos Python, Flask y los bloques de código interactivos.");
checkNull("two prose lines", "El objetivo de esta unidad es aprender a manejar listas y diccionarios.\nSe practica con ejercicios paso a paso.");
checkNull("empty", "");
checkNull("single word", "Python");
checkNull("quoted one-liner", '"esto es una frase"');
checkNull("json-ish single line", '{"a": 1}');

assert.strictEqual(normalizeCodeLanguage("python3"), "python");
assert.strictEqual(normalizeCodeLanguage("PY"), "python");
assert.strictEqual(normalizeCodeLanguage("c++"), "cpp");
assert.strictEqual(normalizeCodeLanguage(""), "python");
assert.strictEqual(normalizeCodeLanguage("ruby"), "ruby");
console.log("ok - normalizeCodeLanguage aliases");
