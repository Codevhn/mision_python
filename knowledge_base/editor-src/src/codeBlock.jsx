// Native codeBlock spec (replaces @blocknote/core's `createCodeBlockSpec`).
//
// BlockNote ships the codeBlock's language picker as a near-invisible native
// <select> glued to the top-left corner of the block — no header bar, no
// execute button, nothing that reads like the Jupyter-style runner this app
// already had (and lost). Rather than keep patching that DOM with CSS, this
// re-implements the whole block with `createReactBlockSpec` so the header
// (searchable language dropdown + ► Ejecutar) and the TTY terminal are real,
// native React elements rendered in-flow inside the block — never injected
// elsewhere and never touched outside ProseMirror's own node-view lifecycle.
//
// Everything ProseMirror actually depends on is preserved from the core spec:
//   - content: "inline" + the same propSchema (language)
//   - the prosemirror-highlight plugin (shiki decorations on the node)
//   - the code-block keyboard shortcuts (Delete/Tab/Enter/Shift-Enter)
//   - the ```lang input rule
//   - PRE > CODE parse + parseContent (so HTML pastes still work)

import { createReactBlockSpec } from "@blocknote/react";
import { createExtension } from "@blocknote/core";
import { createHighlightPlugin } from "prosemirror-highlight";
import { createParser } from "prosemirror-highlight/shiki";
import { DOMParser } from "@tiptap/pm/model";
import { useState, useEffect, useRef } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// ── Language list ─────────────────────────────────────────────────────
// Canonical id = what gets persisted in the markdown fence AND what the shiki
// highlighter is asked to tokenize with. `text` never highlights (plain).
// Aliases map legacy fences (py, js, c++, c#, sh…) onto the canonical id.
export const SUPPORTED_LANGUAGES = {
  text:        { name: "Plain Text" },
  python:      { name: "Python", aliases: ["py", "python3"] },
  javascript:  { name: "JavaScript", aliases: ["js"] },
  typescript:  { name: "TypeScript", aliases: ["ts"] },
  java:        { name: "Java" },
  c:           { name: "C" },
  cpp:         { name: "C++", aliases: ["c++"] },
  csharp:      { name: "C#", aliases: ["c#", "cs"] },
  go:          { name: "Go", aliases: ["golang"] },
  rust:        { name: "Rust", aliases: ["rs"] },
  php:         { name: "PHP" },
  ruby:        { name: "Ruby", aliases: ["rb"] },
  kotlin:      { name: "Kotlin", aliases: ["kt", "kts"] },
  swift:       { name: "Swift" },
  html:        { name: "HTML" },
  css:         { name: "CSS" },
  scss:        { name: "SCSS" },
  sass:        { name: "Sass" },
  tailwind:    { name: "Tailwind CSS", aliases: ["tailwindcss"] },
  bash:        { name: "Bash / Shell", aliases: ["shell", "sh", "zsh"] },
  powershell:  { name: "PowerShell", aliases: ["ps", "ps1"] },
  dockerfile:  { name: "Dockerfile", aliases: ["docker"] },
  yaml:        { name: "YAML", aliases: ["yml"] },
  json:        { name: "JSON" },
  toml:        { name: "TOML" },
  xml:         { name: "XML" },
  ini:         { name: "INI / ENV", aliases: ["properties", "env"] },
  sql:         { name: "SQL" },
  markdown:    { name: "Markdown", aliases: ["md"] },
  asm:         { name: "Assembly", aliases: ["assembly"] },
  http:        { name: "HTTP / REST API", aliases: ["rest"] },
};

// Lightweight inline icons for the dropdown rows (no new dependency).
const LANGUAGE_ICONS = {
  text: "📄", python: "🐍", javascript: "🟨", typescript: "🔷", java: "☕",
  c: "🧩", cpp: "⚙️", csharp: "🎯", go: "🐹", rust: "🦀", php: "🐘",
  ruby: "💎", kotlin: "🎈", swift: "🐦", html: "🌐", css: "🎨",
  scss: "💄", sass: "🧴", tailwind: "🌬️", bash: "🐚", powershell: "🪟",
  dockerfile: "🐳", yaml: "📜", json: "📦", toml: "🗂️", xml: "🧾",
  ini: "🔧", sql: "🗄️", markdown: "📝", asm: "🔩", http: "🌍",
};

// Canonical id -> shiki grammar name. Only deviations need an entry: every
// other id is either a shiki grammar's own name or one of its loaded aliases.
const SHIKI_LANG = {
  tailwind: "css",
};

// Mirror of @blocknote/core's getLanguageId, made case-insensitive so legacy
// fences like ```Python / ```Shell still resolve.
export function getLanguageId(languageName) {
  const raw = String(languageName ?? "").toLowerCase();
  return Object.entries(SUPPORTED_LANGUAGES).find(
    ([id, { aliases }]) =>
      id.toLowerCase() === raw ||
      (aliases || []).some((a) => a.toLowerCase() === raw),
  )?.[0];
}

function isPython(language) {
  return getLanguageId(language) === "python";
}

// Fine-grained shiki/core bundle: only the grammars/themes we actually list
// above get inlined into the IIFE, instead of all ~200 bundled languages.
function createHighlighter() {
  return createHighlighterCore({
    themes: [
      import("shiki/themes/github-dark.mjs"),
      import("shiki/themes/github-light.mjs"),
    ],
    langs: [
      import("shiki/langs/python.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/java.mjs"),
      import("shiki/langs/c.mjs"),
      import("shiki/langs/cpp.mjs"),
      import("shiki/langs/csharp.mjs"),
      import("shiki/langs/go.mjs"),
      import("shiki/langs/rust.mjs"),
      import("shiki/langs/php.mjs"),
      import("shiki/langs/ruby.mjs"),
      import("shiki/langs/kotlin.mjs"),
      import("shiki/langs/swift.mjs"),
      import("shiki/langs/html.mjs"),
      import("shiki/langs/css.mjs"),
      import("shiki/langs/scss.mjs"),
      import("shiki/langs/sass.mjs"),
      import("shiki/langs/shellscript.mjs"),
      import("shiki/langs/powershell.mjs"),
      import("shiki/langs/dockerfile.mjs"),
      import("shiki/langs/yaml.mjs"),
      import("shiki/langs/json.mjs"),
      import("shiki/langs/toml.mjs"),
      import("shiki/langs/xml.mjs"),
      import("shiki/langs/ini.mjs"),
      import("shiki/langs/sql.mjs"),
      import("shiki/langs/markdown.mjs"),
      import("shiki/langs/asm.mjs"),
      import("shiki/langs/http.mjs"),
    ],
    engine: createJavaScriptRegexEngine(),
  });
}

const shikiParserSymbol = Symbol.for("blocknote.shikiParser");
const shikiHighlighterPromiseSymbol = Symbol.for(
  "blocknote.shikiHighlighterPromise",
);

// Same lazy pattern as @blocknote/core's lazyShikiPlugin: return [] until the
// highlighter is ready, then decorate the node's content with shiki tokens.
// The highlighter/parser are cached on globalThis so every codeBlock shares
// a single creation.
function lazyShikiPlugin() {
  const globalThisForShiki = globalThis;

  let highlighter;
  let parser;
  const lazyParser = (parserOptions) => {
    const language = getLanguageId(parserOptions.language ?? "text");
    if (!language || language === "text") return [];

    const shikiLang = SHIKI_LANG[language] || language;

    if (!highlighter) {
      globalThisForShiki[shikiHighlighterPromiseSymbol] =
        globalThisForShiki[shikiHighlighterPromiseSymbol] || createHighlighter();
      return globalThisForShiki[shikiHighlighterPromiseSymbol].then(
        (created) => {
          highlighter = created;
        },
      );
    }

    if (!highlighter.getLoadedLanguages().includes(shikiLang)) {
      return highlighter.loadLanguage(shikiLang);
    }

    if (!parser) {
      parser =
        globalThisForShiki[shikiParserSymbol] || createParser(highlighter);
      globalThisForShiki[shikiParserSymbol] = parser;
    }

    return parser({ ...parserOptions, language: shikiLang });
  };

  return createHighlightPlugin({
    parser: lazyParser,
    languageExtractor: (node) => node.attrs.language,
    nodeTypes: ["codeBlock"],
  });
}

// ── React render ───────────────────────────────────────────────────────
function codeText(block) {
  const content = (block && block.content) || [];
  return content
    .map((c) => (c && c.text != null ? c.text : ""))
    .join("");
}

function CodeBlockComponent({ block, editor, contentRef }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);
  const menuRef = useRef(null);

  const language = block.props.language || "text";
  const entry = SUPPORTED_LANGUAGES[language] || { name: language };
  const python = isPython(language);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const pickLanguage = (id) => {
    setMenuOpen(false);
    setSearch("");
    if (id === language) return;
    editor.updateBlock(block.id, { props: { language: id } });
  };

  const run = () => {
    if (running) return;
    // Read the freshest block from the doc at click-time (the render prop's
    // block may lag a keystroke behind), then fall back to the render prop.
    let fresh;
    try { fresh = editor.getBlock(block.id); } catch (_) { fresh = undefined; }
    const code = codeText(fresh || block);
    if (!code.trim()) {
      setOutput({ error: "El bloque está vacío — escribe código antes de ejecutar." });
      return;
    }
    setRunning(true);
    setOutput(null);
    fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language: "python" }),
    })
      .then((r) => r.json())
      .then((data) => setOutput(data))
      .catch((err) => setOutput({ error: "Error de red: " + err.message }))
      .finally(() => setRunning(false));
  };

  const filtered = Object.entries(SUPPORTED_LANGUAGES).filter(([id, lang]) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      lang.name.toLowerCase().includes(q) ||
      id.toLowerCase().includes(q) ||
      (lang.aliases || []).some((a) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="code-block-native">
      <div
        className="code-block-header"
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="code-block-lang" ref={menuRef}>
          <button
            type="button"
            className="code-block-lang-btn"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            title="Cambiar lenguaje"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            <span className={"code-block-lang-dot" + (python ? " py" : "")} />
            <span className="code-block-lang-name">{entry.name}</span>
            <span className="code-block-lang-caret">▾</span>
          </button>
          {menuOpen && (
            <div className="code-block-lang-menu" role="listbox">
              <input
                className="code-block-lang-search"
                autoFocus
                type="text"
                placeholder="Buscar lenguaje…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <div className="code-block-lang-list">
                {filtered.length === 0 ? (
                  <div className="code-block-lang-empty">Sin resultados</div>
                ) : (
                  filtered.map(([id, lang]) => (
                    <button
                      type="button"
                      key={id}
                      role="option"
                      aria-selected={id === language}
                      className={"code-block-lang-item" + (id === language ? " active" : "")}
                      onClick={(e) => { e.stopPropagation(); pickLanguage(id); }}
                    >
                      <span className="code-block-lang-item-icon">{LANGUAGE_ICONS[id] || ""}</span>
                      <span className="code-block-lang-item-name">{lang.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="code-block-header-spacer" />
        {python && (
          <button
            type="button"
            className="code-block-run"
            disabled={running}
            onClick={run}
          >
            {running ? "⏳ Ejecutando…" : "▶ Ejecutar"}
          </button>
        )}
      </div>

      <pre className="code-block-pre">
        <code className="code-block-code">
          <div ref={contentRef} />
        </code>
      </pre>

      {output && (
        <div className="code-block-terminal">
          <div
            className="code-block-term-bar"
            contentEditable={false}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="code-block-term-title">TERMINAL</span>
            <button
              type="button"
              className="code-block-term-close"
              title="Cerrar terminal"
              onClick={() => setOutput(null)}
            >
              ✕
            </button>
          </div>
          <div className="code-block-term-body" contentEditable={false}>
            {output.error ? (
              <pre className="code-block-term-error">{output.error}</pre>
            ) : (
              <>
                <pre className="code-block-term-out">{String(output.stdout || "").replace(/\n$/, "")}</pre>
                {output.stderr ? (
                  <pre className="code-block-term-err">{String(output.stderr).replace(/\n$/, "")}</pre>
                ) : null}
                <div className="code-block-term-meta">
                  {output.returncode === 0
                    ? "✓ salió con código 0"
                    : `⚠ código de salida: ${output.returncode ?? "?"}`}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CodeBlockExternalHTML({ block, contentRef }) {
  return (
    <pre>
      <code
        className={`language-${block.props.language || ""}`}
        data-language={block.props.language || ""}
      >
        <div ref={contentRef} />
      </code>
    </pre>
  );
}

// ── Spec ───────────────────────────────────────────────────────────────
const codeBlockExtensions = [
  createExtension({
    key: "code-block-highlighter",
    prosemirrorPlugins: [lazyShikiPlugin()],
  }),
  createExtension({
    key: "code-block-keyboard-shortcuts",
    keyboardShortcuts: {
      Delete: ({ editor }) => {
        return editor.transact((tr) => {
          const { block } = editor.getTextCursorPosition();
          if (block.type !== "codeBlock") return false;
          const { $from } = tr.selection;
          if (!$from.parent.textContent) {
            editor.removeBlocks([block]);
            return true;
          }
          return false;
        });
      },
      Tab: ({ editor }) => {
        return editor.transact((tr) => {
          const { block } = editor.getTextCursorPosition();
          if (block.type === "codeBlock") {
            tr.insertText("  ");
            return true;
          }
          return false;
        });
      },
      Enter: ({ editor }) => {
        return editor.transact((tr) => {
          const { block, nextBlock } = editor.getTextCursorPosition();
          if (block.type !== "codeBlock") return false;
          const { $from } = tr.selection;

          const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;
          const endsWithDoubleNewline = $from.parent.textContent.endsWith("\n\n");

          if (isAtEnd && endsWithDoubleNewline) {
            tr.delete($from.pos - 2, $from.pos);
            if (nextBlock) {
              editor.setTextCursorPosition(nextBlock, "start");
              return true;
            }
            const [newBlock] = editor.insertBlocks(
              [{ type: "paragraph" }],
              block,
              "after",
            );
            editor.setTextCursorPosition(newBlock, "start");
            return true;
          }

          tr.insertText("\n");
          return true;
        });
      },
      "Shift-Enter": ({ editor }) => {
        return editor.transact(() => {
          const { block } = editor.getTextCursorPosition();
          if (block.type !== "codeBlock") return false;

          const [newBlock] = editor.insertBlocks(
            [{ type: "paragraph" }],
            block,
            "after",
          );
          editor.setTextCursorPosition(newBlock, "start");
          return true;
        });
      },
    },
    inputRules: [
      {
        find: /^```(.*?)\s$/,
        replace: ({ match }) => {
          const languageName = match[1].trim();
          return {
            type: "codeBlock",
            props: {
              language: getLanguageId(languageName) ?? languageName,
            },
            content: [],
          };
        },
      },
    ],
  }),
];

export const codeBlock = createReactBlockSpec(
  {
    type: "codeBlock",
    propSchema: {
      language: { default: "text" },
    },
    content: "inline",
  },
  {
    meta: {
      code: true,
      defining: true,
      isolating: false,
    },
    parse: (el) => {
      if (el.tagName !== "PRE") return undefined;
      if (el.childElementCount !== 1 || el.firstElementChild?.tagName !== "CODE") {
        return undefined;
      }
      const code = el.firstElementChild;
      const language =
        code.getAttribute("data-language") ||
        code.className
          .split(" ")
          .find((name) => name.includes("language-"))
          ?.replace("language-", "") ||
        "";
      return { language };
    },
    parseContent: ({ el, schema }) => {
      const parser = DOMParser.fromSchema(schema);
      const code = el.firstElementChild;
      return parser.parse(code, {
        preserveWhitespace: "full",
        topNode: schema.nodes["codeBlock"].create(),
      }).content;
    },
    render: CodeBlockComponent,
    toExternalHTML: CodeBlockExternalHTML,
  },
  codeBlockExtensions,
);
