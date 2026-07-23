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

console.log("\nAll markdown round-trip tests passed.");
