import { getLanguageId } from './codeBlock.jsx';

function languageId(value) {
  const label = String(value || '').trim();
  if (/^(?:plain\s*text|text|none)$/i.test(label)) return 'text';
  return getLanguageId(label);
}

function explicitLanguage(element) {
  if (!element) return '';
  return element.getAttribute('data-language') || element.getAttribute('data-code-language')
    || element.getAttribute('language')
    || [...element.classList].find(value => /^(?:language|lang)-/.test(value))?.replace(/^(?:language|lang)-/, '') || '';
}

function precedingLanguage(pre, root) {
  let node = pre;
  // AI code toolbars often live beside PRE, one or two wrappers deep.
  for (let depth = 0; node && node !== root && depth < 4; depth++, node = node.parentElement) {
    const previous = node.previousElementSibling;
    if (!previous) continue;
    if (previous.matches('pre') || previous.querySelector('pre')) return undefined;
    const label = previous.cloneNode(true);
    label.querySelectorAll('button,[role="button"],svg,[aria-hidden="true"]').forEach(node => node.remove());
    // Require an exact known language label, never prose or code vocabulary.
    return languageId(label.textContent);
  }
  return undefined;
}

export function normalizeClipboardHTML(html) {
  // Detached, inert document: never attach source HTML or toolbar handlers.
  const document = globalThis.document.implementation.createHTMLDocument('');
  document.body.innerHTML = html;
  for (const pre of document.querySelectorAll('pre')) {
    let code = pre.querySelector('code');
    if (!code) {
      code = document.createElement('code');
      code.append(...pre.childNodes);
      pre.append(code);
    }
    const source = explicitLanguage(code) || explicitLanguage(pre)
      || explicitLanguage(pre.parentElement?.closest('[data-language],[data-code-language]'));
    const language = source ? (languageId(source) || source) : precedingLanguage(pre, document.body);
    // Explicit text/unknown languages are authoritative; no Python guessing.
    if (language) {
      pre.dataset.language = language;
      code.dataset.language = language;
    }
  }
  return document.body.innerHTML;
}

const LIST_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem']);
function emptyParagraph(block) {
  return block.type === 'paragraph' && !block.children?.length
    && Array.isArray(block.content)
    && block.content.every(run => run.type === 'text' && !run.text.trim());
}

export function normalizeClipboardLists(blocks) {
  return blocks.map(block => ({
    ...block,
    // Empty child paragraphs from LI/P/BR produce indented blank editor rows.
    // Keep nonempty continuation paragraphs, sublists, code and media intact.
    children: normalizeClipboardLists((block.children || []).filter(child =>
      !LIST_TYPES.has(block.type) || !emptyParagraph(child))),
  }));
}
