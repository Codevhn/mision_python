import { BlockNoteSchema, defaultBlockSpecs, createCodeBlockSpec } from "@blocknote/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { pageLink, database } from "./customBlocks.jsx";

// Mirrors the language coverage the old CodeMirror-based editor.js exposed
// (clike covered java/c/c++/c#, htmlmixed covered html).
const SUPPORTED_LANGUAGES = {
  text: { name: "Plain Text" },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  python: { name: "Python", aliases: ["py"] },
  java: { name: "Java" },
  c: { name: "C" },
  cpp: { name: "C++", aliases: ["c++"] },
  csharp: { name: "C#", aliases: ["c#", "cs"] },
  html: { name: "HTML" },
  css: { name: "CSS" },
  sql: { name: "SQL" },
  shell: { name: "Shell", aliases: ["bash", "sh"] },
  yaml: { name: "YAML", aliases: ["yml"] },
  xml: { name: "XML" },
  json: { name: "JSON" },
  markdown: { name: "Markdown", aliases: ["md"] },
};

const codeBlock = createCodeBlockSpec({
  defaultLanguage: "text",
  supportedLanguages: SUPPORTED_LANGUAGES,
  // Fine-grained shiki/core bundle: only the grammars/themes we actually
  // list above get inlined into the IIFE, instead of all ~200 bundled
  // languages (which is what plain `shiki`'s createHighlighter() pulls in
  // when built as a single non-code-split bundle).
  createHighlighter: () =>
    createHighlighterCore({
      themes: [import("shiki/themes/github-dark.mjs"), import("shiki/themes/github-light.mjs")],
      langs: [
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/java.mjs"),
        import("shiki/langs/c.mjs"),
        import("shiki/langs/cpp.mjs"),
        import("shiki/langs/csharp.mjs"),
        import("shiki/langs/html.mjs"),
        import("shiki/langs/css.mjs"),
        import("shiki/langs/sql.mjs"),
        import("shiki/langs/shellscript.mjs"),
        import("shiki/langs/yaml.mjs"),
        import("shiki/langs/xml.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/markdown.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    }),
});

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock,
    pageLink: pageLink(),
    database: database(),
  },
});
