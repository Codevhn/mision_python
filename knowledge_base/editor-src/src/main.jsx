import React from "react";
import { createRoot } from "react-dom/client";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import "./custom-blocks.css";
import { schema } from "./schema.js";
import { mdToBlocks, blocksToMd } from "./markdown.js";

// The "database" block type is registered in schema.js (so old content still
// renders), but BlockNote's built-in slash menu only auto-lists its own
// default block types — a custom block needs an explicit entry to ever be
// insertable from the UI. Without this, there was no way to create a new
// database block at all (confirmed empirically: typing "/" only showed
// Heading/Quote/Table/etc., never "Base de datos").
function getCustomSlashMenuItems(editor) {
  return [
    {
      title: "Base de datos",
      subtext: "Tabla en vivo de sub-páginas, con propiedades por fila",
      aliases: ["database", "db", "tabla", "base de datos"],
      group: "Avanzado",
      icon: <span style={{ fontSize: "18px" }}>🗃️</span>,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: "database", props: { data: "{}" } });
      },
    },
  ];
}

function currentAppTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

// Reads a File into a base64 data URL and uploads it through the same
// endpoint the cover-image picker already uses, so no backend changes
// are needed to support image blocks.
async function uploadFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const res = await fetch("/api/upload/cover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

function EditorView({ instanceRef, onChange, onReady }) {
  const editor = useCreateBlockNote({ schema, uploadFile });
  const [theme, setTheme] = React.useState(currentAppTheme());

  React.useEffect(() => {
    instanceRef.editor = editor;
    onReady && onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  React.useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentAppTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <BlockNoteView
      editor={editor}
      theme={theme}
      slashMenu={false}
      onChange={() => {
        if (instanceRef.suppressChange) return;
        if (onChange) onChange(blocksToMd(editor.document));
      }}
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            [...getDefaultReactSlashMenuItems(editor), ...getCustomSlashMenuItems(editor)],
            query,
          )
        }
      />
    </BlockNoteView>
  );
}

function createInstance(opts) {
  const { container, onChange } = opts || {};
  const instanceRef = { editor: null, suppressChange: false };
  const root = createRoot(container);
  let pendingMarkdown = null;
  let ready = false;
  let readyResolvers = [];

  const whenReady = () => new Promise((resolve) => {
    if (ready) resolve();
    else readyResolvers.push(resolve);
  });

  root.render(
    <EditorView
      instanceRef={instanceRef}
      onChange={onChange}
      onReady={() => {
        ready = true;
        if (pendingMarkdown !== null) {
          applyMarkdown(pendingMarkdown);
          pendingMarkdown = null;
        }
        readyResolvers.forEach((r) => r());
        readyResolvers = [];
      }}
    />,
  );

  function applyMarkdown(markdown) {
    const editor = instanceRef.editor;
    const blocks = mdToBlocks(markdown || "");
    instanceRef.suppressChange = true;
    editor.replaceBlocks(editor.document, blocks);
    instanceRef.suppressChange = false;
  }

  const api = {
    load(markdown) {
      if (ready) applyMarkdown(markdown);
      else pendingMarkdown = markdown;
    },
    loadMarkdown(markdown) { api.load(markdown); },
    getMarkdown() {
      return instanceRef.editor ? blocksToMd(instanceRef.editor.document) : "";
    },
    setPersistenceKey() {
      // Legacy localStorage-draft-recovery key; BlockNote's own document
      // model has no equivalent yet, so this is a no-op placeholder.
    },
    focusFirst() {
      whenReady().then(() => instanceRef.editor && instanceRef.editor.focus());
    },
    addPageBlock(title, pageId) {
      if (!instanceRef.editor) return;
      const ed = instanceRef.editor;
      const blocks = ed.document;
      const last = blocks[blocks.length - 1];
      if (last) ed.insertBlocks([{ type: "pageLink", props: { title, pageId } }], last.id, "after");
      else ed.insertBlocks([{ type: "pageLink", props: { title, pageId } }], ed.document[0].id, "before");
    },
    findText(query) {
      if (!instanceRef.editor || !query) return 0;
      const md = blocksToMd(instanceRef.editor.document).toLowerCase();
      return md.split(query.toLowerCase()).length - 1;
    },
    // Find/replace-in-page UI is not yet wired up to BlockNote's native
    // selection; full-text match count above is a v1 placeholder.
    findNext() { return 0; },
    replaceAllText(find, replace) {
      if (!instanceRef.editor || !find) return false;
      const md = blocksToMd(instanceRef.editor.document);
      if (!md.includes(find)) return false;
      applyMarkdown(md.split(find).join(replace));
      if (onChange) onChange(blocksToMd(instanceRef.editor.document));
      return true;
    },
    destroy() { root.unmount(); },
  };

  return api;
}

window.BlockEditor = {
  create: createInstance,
  init(opts) {
    // Modal "new entry" editor: same component, content synced into a
    // hidden field (`syncTarget`) on every change instead of autosave.
    const { syncTarget } = opts || {};
    const instance = createInstance({
      ...opts,
      onChange: (md) => {
        if (syncTarget) syncTarget.value = md;
        if (opts.onChange) opts.onChange(md);
      },
    });
    window._modalBlockEditor = instance;
    return instance;
  },
  loadMarkdown(md) { window._modalBlockEditor && window._modalBlockEditor.load(md); },
  getMarkdown() { return window._modalBlockEditor ? window._modalBlockEditor.getMarkdown() : ""; },
  focusFirst() { window._modalBlockEditor && window._modalBlockEditor.focusFirst(); },
};
