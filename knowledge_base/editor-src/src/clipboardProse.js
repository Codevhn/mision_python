// Reflow only long prose lines. Short lines, Markdown structure, indented code
// and blank-line paragraph boundaries are intentional until proven otherwise.
const structure = /^(?:\s{4}|\t|\s*(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s|```|~~~|\||:::|[-*_]{3,}\s*$))/;
function proseLine(line) {
  return !structure.test(line) && !/[{};]\s*$/.test(line)
    && line.trim().length >= 45 && line.trim().split(/\s+/).length >= 7;
}
export function isProseWrap(before, after) {
  return !/(?: {2,}|\\)$/.test(before) && proseLine(before) && !structure.test(after)
    && after.trim().length >= 12 && after.trim().split(/\s+/).length >= 2
    && /[\p{L}\p{N},;:!?.”'»\)\]-]$/u.test(before.trim())
    && /^[\p{L}\p{N}“"'«¿¡(]/u.test(after.trim());
}
export function reflowClipboardText(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let fence = null;
  return lines.map((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    const inFence = Boolean(fence);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    }
    const next = lines[index + 1];
    return line + (!inFence && !fence && !marker && next && isProseWrap(line, next) ? ' ' : index < lines.length - 1 ? '\n' : '');
  }).join('');
}

export function normalizeProseHTML(document, reflow = true) {
  // Preserve semantic emphasis before discarding the source's presentation.
  for (const node of [...document.body.querySelectorAll('*')]) {
    if (!node.closest('pre,code')) {
      const weight = node.style.fontWeight;
      const italic = node.style.fontStyle === 'italic';
      if ((weight === 'bold' || Number(weight) >= 600) && !node.matches('b,strong,h1,h2,h3,h4,h5,h6')) {
        const strong = document.createElement('strong');
        strong.append(...node.childNodes); node.append(strong);
      }
      if (italic && !node.matches('i,em')) {
        const em = document.createElement('em');
        em.append(...node.childNodes); node.append(em);
      }
    }
    node.removeAttribute('style');
    if (!node.matches('img,video')) {
      node.removeAttribute('width'); node.removeAttribute('height');
    }
    node.removeAttribute('align'); node.removeAttribute('color');
    node.removeAttribute('face'); node.removeAttribute('size');
  }
  if (!reflow) return;
  // BRs from PDF/browser selection encode printed line endings. Join only
  // prose-shaped boundaries within a single block; never cross P/LI boundaries.
  for (const block of [document.body, ...document.body.querySelectorAll('p,li,div')]) {
    if (block.closest('pre,code') || block.querySelector('p,li,div,pre,table,ul,ol')) continue;
    const breaks = [...block.querySelectorAll('br')];
    const replacements = [];
    breaks.forEach((br, index) => {
      const before = document.createRange();
      before.selectNodeContents(block);
      if (index) before.setStartAfter(breaks[index - 1]);
      before.setEndBefore(br);
      const after = document.createRange();
      after.selectNodeContents(block); after.setStartAfter(br);
      if (breaks[index + 1]) after.setEndBefore(breaks[index + 1]);
      if (isProseWrap(before.toString(), after.toString())) replacements.push(br);
    });
    replacements.forEach(br => br.replaceWith(document.createTextNode(' ')));
  }
}
