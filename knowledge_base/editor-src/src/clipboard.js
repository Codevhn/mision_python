// Clipboard source policy; parsing, insertion, selection and history belong to
// BlockNote. Never infer that an entire document is code from its vocabulary.
import { markdownToHTML } from '@blocknote/core';
import { normalizeClipboardHTML, normalizeClipboardLists } from './clipboardContent.js';

export function pasteClipboard({ event, editor, defaultPasteHandler }) {
  const data = event.clipboardData;
  // Inside code, the native handler preserves literal text (including Markdown).
  const inCode = editor.transact(tr =>
    tr.selection.$from.parent.type.spec.code && tr.selection.$to.parent.type.spec.code);
  if (inCode || !data || data.types.includes('blocknote/html')) {
    return defaultPasteHandler({ prioritizeMarkdownOverHTML: false });
  }

  let metadata;
  if (data.types.includes('vscode-editor-data')) {
    try { metadata = JSON.parse(data.getData('vscode-editor-data')); } catch (_) {}
  }
  const text = data.getData('text/plain');
  if (typeof metadata?.mode === 'string' && metadata.mode.trim() && text) {
    // BlockNote 0.51.4's VS Code path calls view.pasteHTML directly and
    // interpolates unescaped source. Use its public normalized importer instead,
    // with literal DOM text so <tags>, &, quotes and indentation survive.
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.dataset.language = metadata.mode;
    code.textContent = text.replace(/\r\n?/g, '\n');
    pre.append(code);
    editor.pasteHTML(pre.outerHTML);
    return true;
  }

  // Use BlockNote's own Markdown/HTML parser, then normalize source artifacts
  // before its native paste inserts the slice with selection and undo support.
  const markdown = data.getData('text/markdown');
  const html = markdown ? markdownToHTML(markdown)
    : data.getData('text/html') || (text ? markdownToHTML(text) : '');
  if (!html) return defaultPasteHandler({ prioritizeMarkdownOverHTML: false });
  const blocks = normalizeClipboardLists(editor.tryParseHTMLToBlocks(normalizeClipboardHTML(html)));
  editor.pasteHTML(editor.blocksToFullHTML(blocks), true);
  return true;
}
