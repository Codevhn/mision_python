// Clipboard source policy; parsing, insertion, selection and history belong to
// BlockNote. Never infer that an entire document is code from its vocabulary.
export function pasteClipboard({ event, editor, defaultPasteHandler }) {
  const data = event.clipboardData;
  // Inside code, the native handler preserves literal text (including Markdown).
  const inCode = editor.transact(tr =>
    tr.selection.$from.parent.type.spec.code && tr.selection.$to.parent.type.spec.code);
  if (inCode || !data?.types.includes('vscode-editor-data')) {
    return defaultPasteHandler({ prioritizeMarkdownOverHTML: false });
  }

  let metadata;
  try { metadata = JSON.parse(data.getData('vscode-editor-data')); } catch (_) {}
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

  // Broken/missing language metadata must not throw or swallow the content.
  const html = data.getData('text/html');
  if (html) editor.pasteHTML(html);
  else editor.pasteMarkdown(data.getData('text/markdown') || text);
  return true;
}
