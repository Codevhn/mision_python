import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { BlockNoteEditor, defaultBlockSpecs } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import {
  BLOCK_CATALOG, buildInsertBlockItems, buildConversionBlockItems,
  convertCatalogBlock, duplicateCatalogBlock,
} from "../src/blockCatalog.jsx";
import { duplicateIdentityRepairs, editorDatabaseContext } from "../src/databaseIdentity.js";
import { schema } from "../src/schema.js";
import { blocksToMd, mdToBlocks } from "../src/markdown.js";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

function fixture() {
  const blockSpecs = {
    ...defaultBlockSpecs,
    pageLink: { config: { type: "pageLink", content: "none", propSchema: {} } },
    database: { config: { type: "database", content: "none", propSchema: {} } },
  };
  const blockSchema = Object.fromEntries(Object.entries(blockSpecs).map(([type, spec]) => [type, spec.config]));
  let current = { id: "cursor", type: "paragraph", props: {}, content: [], children: [] };
  const writes = [];
  const inserted = [];
  const editor = {
    schema: { blockSpecs, blockSchema }, dictionary: es, writes, inserted,
    getTextCursorPosition: () => ({ block: current, nextBlock: { id: "next", type: "paragraph" } }),
    setTextCursorPosition: block => { current = typeof block === "object" ? block : current; },
    updateBlock: (block, patch) => {
      writes.push({ block, patch });
      current = { ...block, ...patch, props: { ...block.props, ...patch.props } };
      return current;
    },
    insertBlocks: (blocks, anchor, placement) => {
      const copies = blocks.map((block, index) => ({ ...block, id: `copy-${inserted.length}-${index}` }));
      inserted.push({ blocks, anchor, placement, copies });
      return copies;
    },
    // Explicit conversion must never reinterpret raw Markdown into other blocks.
    tryParseMarkdownToBlocks: () => { throw new Error("Unexpected Markdown parse"); },
    replaceBlocks: () => { throw new Error("Unexpected destructive replacement"); },
  };
  return editor;
}

const editor = fixture();
const paragraph = { id: "source", type: "paragraph", props: {}, content: [{ type: "text", text: "Conservar" }], children: [] };
const inserted = buildInsertBlockItems(editor);
const converted = buildConversionBlockItems(editor, paragraph);
assert.equal(inserted[0].title, "Párrafo");
assert.equal(converted[0].name, "Párrafo");
assert.equal(new Set(inserted.map(item => item.key)).size, inserted.length);
assert.deepEqual(inserted.filter(item => converted.some(target => target.key === item.key)).map(item => [item.key, item.title, item.group]),
  converted.map(item => [item.key, item.name, item.group]));
for (const item of converted) {
  const insertion = inserted.find(candidate => candidate.key === item.key);
  assert.equal(insertion.icon.props.item.icon, item.icon, item.key + " icon must be shared");
}
assert(inserted.find(item => item.key === "paragraph").aliases.includes("parrafo"));
assert.deepEqual(inserted.filter(item => ["page", "database", "table", "image", "video", "audio", "file", "emoji"].includes(item.key)).map(item => item.key),
  ["page", "table", "database", "image", "video", "audio", "file", "emoji"]);
assert(!inserted.some(item => item.key === "callout"), "Do not advertise an unregistered custom block");

const constrained = fixture();
constrained.schema.blockSchema = { ...constrained.schema.blockSchema, heading: {
  ...constrained.schema.blockSchema.heading,
  propSchema: { ...constrained.schema.blockSchema.heading.propSchema, level: { default: 1, values: [1, 2] } },
} };
assert(!buildConversionBlockItems(constrained, paragraph).some(item => item.props?.level > 2));
assert(!buildInsertBlockItems(constrained).some(item => item.key === "heading_3"));
for (const type of ["database", "pageLink", "table", "image", "file", "divider"]) {
  const source = { ...paragraph, type };
  assert.deepEqual(buildConversionBlockItems(editor, source), []);
  assert.equal(convertCatalogBlock(editor, source, converted[0]), false);
}
assert.equal(editor.writes.length, 0);
const rawCode = { ...paragraph, type: "codeBlock", props: { language: "markdown" },
  content: [{ type: "text", text: "## Literal\n\n- No reinterpretar" }] };
assert.equal(convertCatalogBlock(editor, rawCode, converted[0]), true);
assert.equal(editor.writes.at(-1).patch.type, "paragraph");
assert.equal(editor.writes.at(-1).block, rawCode);
assert(!("content" in editor.writes.at(-1).patch), "Preserve literal content and the existing block ID");

const pageEditor = fixture();
const oldWindow = globalThis.window;
let pagePrompt;
globalThis.window = { _promptPageName: (...args) => { pagePrompt = args; } };
editorDatabaseContext.set(pageEditor, { pageId: "peek-owner" });
buildInsertBlockItems(pageEditor).find(item => item.key === "page").onItemClick();
assert.equal(pageEditor.writes.at(-1).patch.type, "pageLink");
assert.deepEqual(pagePrompt, ["cursor", { pageId: "peek-owner" }]);
globalThis.window = oldWindow;
const databaseEditor = fixture();
buildInsertBlockItems(databaseEditor).find(item => item.key === "database").onItemClick();
const newSource = JSON.parse(databaseEditor.writes.at(-1).patch.props.data);
assert(newSource.database_id.startsWith("db_"));

const original = { id: "original", type: "database", props: { data: JSON.stringify(newSource) }, content: undefined,
  children: [{ id: "child-original", type: "paragraph", props: {}, content: paragraph.content, children: [] }] };
const duplicate = duplicateCatalogBlock(databaseEditor, original);
assert.notEqual(duplicate.id, original.id);
assert.equal(databaseEditor.inserted.at(-1).blocks[0].children[0].id, undefined);
assert.equal(databaseEditor.inserted.at(-1).placement, "after");
assert.equal(original.children[0].id, "child-original");
const repaired = duplicateIdentityRepairs([original, duplicate], new Map([[original.id, newSource.database_id]]));
assert.equal(repaired.repairs.length, 1);
assert.equal(repaired.repairs[0].id, duplicate.id);
assert.notEqual(JSON.parse(repaired.repairs[0].data).database_id, newSource.database_id);

// Run conversion against the real editor model, not just a callback spy.
const live = BlockNoteEditor.create({ schema, _headless: true, dictionary: es });
live.replaceBlocks(live.document, [{ type: "codeBlock", props: { language: "markdown" },
  content: "## Texto literal\n\n- Mantener **literal** _dato_" }]);
const before = live.document[0];
assert(convertCatalogBlock(live, before, buildConversionBlockItems(live, before)[0]));
const after = live.document[0];
assert.equal(after.type, "paragraph");
assert.equal(after.id, before.id);
assert.equal(after.content.map(item => item.text || "").join(""), "## Texto literal\n\n- Mantener **literal** _dato_");
const saved = blocksToMd(live.document);
live.replaceBlocks(live.document, mdToBlocks(saved));
assert.equal(live.document[0].type, "paragraph");
assert.equal(live.document[0].content.map(item => item.text || "").join(""), "## Texto literal\n\n- Mantener **literal** _dato_");
assert(live.document[0].content.every(item => !item.styles?.bold && !item.styles?.italic));

const withChild = { ...paragraph, children: [{ ...paragraph, id: "child" }] };
const childTargets = buildConversionBlockItems(editor, withChild);
assert(childTargets.some(item => item.type === "bulletListItem"));
assert(!childTargets.some(item => item.type === "paragraph" || item.type === "codeBlock"));
const indentedCode = { ...rawCode, content: [{ type: "text", text: "if True:\n    print('Conservar')" }] };
assert.deepEqual(buildConversionBlockItems(editor, indentedCode).map(item => item.type), ["codeBlock"]);

console.log(`blockCatalog: ${BLOCK_CATALOG.length} canonical definitions, consistent insert/conversion, guarded content models and independent duplication`);
