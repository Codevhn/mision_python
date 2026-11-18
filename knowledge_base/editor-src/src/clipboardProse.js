// Reflow only long prose lines. Short lines, Markdown structure, indented code
// and blank-line paragraph boundaries are intentional until proven otherwise.
const structure = /^(?:\s{4}|\t|\s*(?:#{1,6}\s|>|[-+*•●▪◦]\s|\d+[.)]\s|```|~~~|\||:::|[-*_]{3,}\s*$))/;
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
// PDF producers split a sentence at font changes as well as at printed line
// endings. Decide from the whole run, rather than requiring each fragment to
// look like a long prose line ("main()" is still part of the sentence).
export function proseRunBreaks(lines, {inlineCode = new Set()} = {}) {
  const join = new Set();
  let start = 0;
  const listPrefix = /^(?: {0,3}[-+*•●▪◦]\s+| {0,3}\d+[.)]\s+)/u;
  const flush = end => {
    const run = lines.slice(start, end).map((line,i)=>i===0?line.replace(listPrefix,''):line);
    const anchors = run.filter(proseLine).length;
    // Two substantial prose fragments distinguish a fragmented paragraph from
    // a heading followed by short verses, identifiers, or an unmarked program.
    const mixedInline = anchors >= 1 && run.join(' ').split(/\s+/).length >= 18 && run.some((_,i)=>inlineCode.has(start+i));
    if (anchors >= 2 || mixedInline) for (let i = mixedInline ? start : start + run.findIndex(proseLine); i < end - 1; i++) join.add(i);
    else for (let i = start; i < end - 1; i++) if (isProseWrap(run[i - start], run[i - start + 1])) join.add(i);
  };
  let fence = null;
  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
    const marker = line?.match(/^\s{0,3}(`{3,}|~{3,})/);
    const boundary = line === undefined || !line.trim() || structure.test(line)
      || (line.trim().length < 60 && /:$/.test(line.trim()))
      || fence || /(?: {2,}|\\)$/.test(line)
      || (!inlineCode.has(i) && /^[{}]|[{};]\s*$/.test(line.trim()))
      || (inlineCode.has(i) && (inlineCode.has(i-1)||inlineCode.has(i+1)));
    if (boundary) { flush(i); start = !fence && line && listPrefix.test(line) ? i : i + 1; }
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    }
  }
  return join;
}
export function proseSeparator(before, after) {
  return /^[,.;:!?%)\]}»]/u.test(after.trim()) || /[(\[«]$/.test(before.trim()) ? '' : ' ';
}
export function reflowClipboardText(text) {
  let fence = null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(line=>{
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence=null;return line;}
    return fence?line:line.replace(/^( {0,3})[•●▪◦]\s+/u,'$1- ');
  });
  const join = proseRunBreaks(lines);
  return lines.map((line, i) => {
    const value = (join.has(i - 1) ? line.trimStart() : line);
    return (join.has(i) ? value.trimEnd() : value) + (i === lines.length - 1 ? '' : join.has(i) ? proseSeparator(line, lines[i + 1]) : '\n');
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
    const inlineCode = new Set();
    const textOfRange=(range,index)=>{const fragment=range.cloneContents(),code=[...fragment.querySelectorAll('code')];if(code.length&&code.map(node=>node.textContent).join('').trim()===fragment.textContent.trim())inlineCode.add(index);return range.toString();};
    const lines = breaks.map((br, index) => {
      const range = document.createRange();range.selectNodeContents(block);
      if (index) range.setStartAfter(breaks[index - 1]);
      range.setEndBefore(br);return textOfRange(range,index);
    });
    if (breaks.length) {
      const range = document.createRange();range.selectNodeContents(block);
      range.setStartAfter(breaks[breaks.length - 1]);lines.push(textOfRange(range,breaks.length));
    }
    for (const index of proseRunBreaks(lines,{inlineCode})) breaks[index].replaceWith(document.createTextNode(proseSeparator(lines[index], lines[index + 1])));
  }
}
