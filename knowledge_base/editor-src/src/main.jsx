import React from "react";
import {SideMenuExtension} from '@blocknote/core/extensions';
import {installForegroundEditorHitTesting} from './editorHitTesting.js';
import {SaveQueue} from "./databaseModel.js";
import {flushDatabaseEditors,mountRecordProperties,unmountRecordProperties,databaseDrafts} from "./databaseUI.jsx";
import {mountPeekToolbar,unmountPeekToolbar} from './databasePeek.jsx';
import {clearRecordPresentation} from './databasePeekModel.js';
import "./database-workspace.css";
import './database-peek.css';
window.AtlasDatabase = {SaveQueue, drafts:databaseDrafts, flush:flushDatabaseEditors, mountProperties:mountRecordProperties, unmountProperties:unmountRecordProperties, mountPeekToolbar,unmountPeekToolbar,clearRecordPresentation};
import { editorDatabaseContext, duplicateIdentityRepairs } from "./databaseIdentity.js";
import { createRoot } from "react-dom/client";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { AlignedSideMenuController } from "./AlignedSideMenuController.jsx";
import { buildInsertBlockItems } from "./blockCatalog.jsx";
import { filterSuggestionItems } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import "@blocknote/mantine/style.css";
import "./custom-blocks.css";
import { schema } from "./schema.js";
import { mdToBlocks, blocksToMd } from "./markdown.js";
import { detectPastedCode } from "./pasteCode.js";
import { CustomSideMenu } from "./dragHandleMenu.jsx";
import { textEdits } from "./textEdits.js";
import { installInlineSpelling } from "./inlineSpelling.js";

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
  const editor = useCreateBlockNote({ schema, uploadFile, dictionary: es, domAttributes: {editor: {spellcheck:"false", lang:"es"}} });
  installForegroundEditorHitTesting(editor.getExtension(SideMenuExtension));
  React.useEffect(()=>{editor.isEditable=instanceRef.editable!==false;},[editor]);
  editorDatabaseContext.set(editor, instanceRef.context);
  const [theme, setTheme] = React.useState(currentAppTheme());

  React.useEffect(() => {
    const spelling = installInlineSpelling(editor._tiptapEditor);
    instanceRef.spelling = spelling;
    return () => { spelling.destroy(); instanceRef.spelling = null; };
  }, [editor]);

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
      sideMenu={false}
      onChange={() => {
        if (instanceRef.suppressChange) return;
        const checked = duplicateIdentityRepairs(editor.document, instanceRef.identities);
        instanceRef.identities = checked.identities;
        instanceRef.suppressChange = true;
        try { for (const repair of checked.repairs) editor.updateBlock(repair.id, { props: { data: repair.data } }); }
        finally { instanceRef.suppressChange = false; }
        if (onChange) onChange(blocksToMd(editor.document));
      }}
    >
      <AlignedSideMenuController sideMenu={CustomSideMenu} />
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            buildInsertBlockItems(editor),
            query,
          )
        }
      />
    </BlockNoteView>
  );
}

function createInstance(opts) {
  const { container, onChange } = opts || {};
  const instanceRef = { editor: null, editable:opts?.editable!==false, suppressChange: false, context: { pageId: opts?.pageId || null, flush: opts?.flush }, identities: new Map() };
  const root = createRoot(container);
  let pendingMarkdown = null;
  let ready = false;
  let readyResolvers = [];

  const whenReady = () => new Promise((resolve) => {
    if (ready) resolve();
    else readyResolvers.push(resolve);
  });

  // Intercept pastes of code (markdown fenced blocks / code fragments) and
  // turn them into a real codeBlock instead of a plain paragraph. Runs on the
  // container in the capture phase so it fires before BlockNote's own paste
  // importer, which would otherwise let the plain text fall through as prose
  // (and whose text/html path never looks at the fenced/indented shape).
  function insertPastedCodeBlock(code, language) {
    const editor = instanceRef.editor;
    if (!editor) return;
    // Never hijack a paste that's already landing inside a code block.
    let current;
    try { current = editor.getTextCursorPosition().block; } catch (_) { return; }
    if (current && current.type === "codeBlock") return;

    const block = {
      type: "codeBlock",
      props: { language },
      content: [{ type: "text", text: code, styles: {} }],
    };

    if (current) {
      editor.insertBlocks([block], current.id, "after").then(([created]) => {
        if (created) { try { editor.setTextCursorPosition(created.id, "start"); } catch (_) {} }
      });
    } else if (editor.document.length > 0) {
      editor.insertBlocks([block], editor.document[0].id, "before");
    } else {
      editor.replaceBlocks(editor.document, [block]);
    }
  }

  const onPaste = (e) => {
    const editor = instanceRef.editor;
    if (!editor) return;
    // Files/images are handled by BlockNote's own file-block upload path.
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) return;

    const text = (e.clipboardData
      && (e.clipboardData.getData("text/plain") || e.clipboardData.getData("text/markdown"))) || "";
    const detected = detectPastedCode(text);
    if (!detected) return;

    e.preventDefault();
    e.stopPropagation();
    insertPastedCodeBlock(detected.code, detected.language);
  };
  container.addEventListener("paste", onPaste, true);

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
    const checked = duplicateIdentityRepairs(blocks);
    for (const repair of checked.repairs) {
      const patch = (items) => items.forEach(b => { if (b.id === repair.id) b.props.data = repair.data; if (b.children) patch(b.children); });
      patch(blocks);
    }
    instanceRef.identities = checked.identities;
    editor.replaceBlocks(editor.document, blocks);
    instanceRef.suppressChange = false;
    // replaceBlocks() leaves ProseMirror's selection wherever the old
    // transaction's position happens to map to; when that lands on/inside
    // a contentless atom block (e.g. our "database" table, content:"none")
    // there's no valid text position for it to fall back to, so ProseMirror
    // selects the whole node instead (NodeSelection) — which BlockNote
    // renders as a permanent 4px "selected" outline around the block, even
    // though nothing was actually clicked. Pointing the cursor at the
    // start of the first block avoids that in the common case (a page
    // whose body has real text content around its table(s)); a page whose
    // ONLY content is a single atom block has no valid text position at
    // all, so the outline can still appear there — a rare, harmless edge
    // case rather than the everyday one this fixes.
    if (editor.document.length > 0) {
      try { editor.setTextCursorPosition(editor.document[0].id, "start"); } catch (_) {}
    }
  }
  const api = {
    reviewSpellingParagraph() { instanceRef.spelling?.reviewParagraph(); },
    captureSpellingSelection() {
      const editor = instanceRef.editor;
      const tip = editor?._tiptapEditor;
      if (!tip) return null;
      const doc = tip.state.doc, {from, to, $from, $to} = tip.state.selection;
      if (from === to) return null;
      const text = doc.textBetween(from, to, '\n');
      let code = false;
      doc.nodesBetween(from, to, node => { if (node.type.name === 'codeBlock' || node.marks?.some(mark => mark.type.name === 'code')) code = true; });
      const safe = $from.parent === $to.parent && $from.parent.isTextblock && !code;
      return {text, focus:() => editor.focus(), apply: safe ? corrected => {
        if (instanceRef.editor !== editor || tip.state.doc !== doc || !container.isConnected) throw new Error('El texto cambió. Selecciónalo de nuevo antes de aplicar la corrección.');
        const tr = tip.state.tr;
        for (const edit of textEdits(text, corrected).reverse()) tr.insertText(edit.text, from + edit.from, from + edit.to);
        tip.view.dispatch(tr); return true;
      } : null};
    },
    load(markdown, pageId) {
      if (pageId !== undefined) instanceRef.context.pageId = pageId;
      if (ready) applyMarkdown(markdown);
      else pendingMarkdown = markdown;
    },

    loadMarkdown(markdown) { api.load(markdown); },
    getMarkdown() {
      return instanceRef.editor ? blocksToMd(instanceRef.editor.document) : "";
    },
    setEditable(value) {
      instanceRef.editable=!!value;
      if(instanceRef.editor)instanceRef.editor.isEditable=!!value;
    },
    appendMarkdown(markdown) {
      return whenReady().then(async()=>{
        const editor=instanceRef.editor;
        if(!editor?.isEditable)throw new Error('Desbloquea la página para importar contenido');
        const blocks=mdToBlocks(markdown);
        const rekey=items=>items.forEach(block=>{
          if(block.type==='database'){
            const value=JSON.parse(block.props.data||'{}');value.database_id=JSON.parse(newDatabaseData()).database_id;
            block.props.data=JSON.stringify(value);
          }
          if(block.children)rekey(block.children);
        });rekey(blocks);
        if(!blocks.length)return;
        const last=editor.document[editor.document.length-1];
        if(last)await editor.insertBlocks(blocks,last,'after');
        else await editor.replaceBlocks(editor.document,blocks);
      });
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
updatePageBlock(blockId, title, pageId) {
      const ed = instanceRef.editor;
      if (!ed || !blockId) return;
      const target = ed.document.find((b) => b.id === blockId);
      if (target) ed.updateBlock(target, { props: { title, pageId } });
    },
    removeBlock(blockId) {
      const ed = instanceRef.editor;
      if (!ed || !blockId) return;
      const target = ed.document.find((b) => b.id === blockId);
      if (target) ed.removeBlocks([target]);
    },
    getInsertionTargets() {
      const rows=[];
      const text = content => Array.isArray(content) ? content.map(item=>item.type==='link'?text(item.content):(item.text||'')).join('') : '';
      const visit = blocks => (blocks||[]).forEach(block=>{
        const label=text(block.content).trim();
        if(label && block.type!=='codeBlock') rows.push({block_id:block.id,text:label,type:block.type,level:block.props?.level||0});
        visit(block.children);
      });
      visit(instanceRef.editor?.document);return rows;
    },
    getInsertionAnchor(query) {
      if(!query?.trim() || !instanceRef.editor) return null;
      const matches=api.getInsertionTargets().filter(row=>row.text.includes(query.trim()));
      let cursor;
      try { cursor=instanceRef.editor.getTextCursorPosition().block.id; } catch (_) {}
      return matches.find(row=>row.block_id===cursor) || (matches.length===1?matches[0]:null);
    },
    insertMarkdownAtBlock(markdown, blockId) {
      return whenReady().then(async()=>{
        const editor=instanceRef.editor;
        if(!editor || !api.getInsertionTargets().some(row=>row.block_id===blockId)) throw new Error('El concepto cambió o ya no existe. Selecciónalo de nuevo.');
        const blocks=mdToBlocks(markdown);
        if(!blocks.length) throw new Error('La respuesta no contiene texto para insertar.');
        const inserted=await editor.insertBlocks(blocks,blockId,'after');
        if(inserted?.[0]) editor.setTextCursorPosition(inserted[0].id,'start');
        return true;
      });
    },
    // Insert generated markdown (Ask AI / inline AI results) as real editor
    // blocks immediately AFTER the block under the current cursor, instead
    // of appending a raw markdown string at the end of the document. Uses
    // BlockNote's official markdown importer so h1/h2/h3, bullet lists,
    // code blocks and paragraphs become independent editor nodes.
    insertMarkdownAfterCursor(markdown) {
      return whenReady().then(() => {
        const editor = instanceRef.editor;
        if (!editor || !markdown) return false;
        let parsedBlocks;
        try { parsedBlocks = editor.tryParseMarkdownToBlocks(markdown); } catch (_) { parsedBlocks = []; }
        if (!Array.isArray(parsedBlocks) || parsedBlocks.length === 0) return false;
        let currentBlock = null;
        try { currentBlock = editor.getTextCursorPosition().block; } catch (_) {}
        const target = currentBlock || editor.document[editor.document.length - 1];
        if (target) {
          return editor.insertBlocks(parsedBlocks, target.id, "after").then(() => true);
        }
        return editor.replaceBlocks(editor.document, parsedBlocks).then(() => true);
      });
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
    destroy() {
      container.removeEventListener("paste", onPaste, true);
      root.unmount();
    },
  };

  instanceRef.context.api = api;
  container._captureSpellingSelection = () => api.captureSpellingSelection();
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
