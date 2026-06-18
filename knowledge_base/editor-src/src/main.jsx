import React from "react";
import { createRoot } from "react-dom/client";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";
import "./custom-blocks.css";
import { schema } from "./schema.js";
import { mdToBlocks, blocksToMd } from "./markdown.js";

function EditorView({ instanceRef, onChange, onReady }) {
  const editor = useCreateBlockNote({ schema });

  React.useEffect(() => {
    instanceRef.editor = editor;
    onReady && onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <BlockNoteView
      editor={editor}
      onChange={() => {
        if (instanceRef.suppressChange) return;
        if (onChange) onChange(blocksToMd(editor.document));
      }}
    />
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
};
