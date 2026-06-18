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
check("toggle", ":::toggle Header\ninner text\n:::");
check("toggle-h2", ":::toggle-h2 Header2\ninner text\n:::");
check("database", ':::database\n{"cols":[{"id":"c0","name":"Nombre"}],"rows":[{"id":"r0","cells":{"c0":"x"}}]}\n:::');

// NOTE: toggle-inside-toggle round-tripping was already broken in the legacy
// static/editor.js (its fence-scanning loop stops at the first nested `:::`
// line, mistaking it for the closing fence). Not fixed here — out of scope,
// matches pre-existing behavior.

console.log("\nAll markdown round-trip tests passed.");
