// Word-level edits keep unchanged marked text and neighbouring blocks intact.
export function textEdits(before, after) {
  const a = before.match(/\s+|\S+/gu) || [], b = after.match(/\s+|\S+/gu) || [];
  let head = 0, offset = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) offset += a[head++].length;
  let ae = a.length, be = b.length;
  while (ae > head && be > head && a[ae - 1] === b[be - 1]) { ae--; be--; }
  const aa = a.slice(head, ae), bb = b.slice(head, be);
  if ((aa.length + 1) * (bb.length + 1) > 300000) throw new Error('Selecciona un fragmento más corto para conservar su formato.');
  const rows = Array.from({length:aa.length + 1}, () => new Uint16Array(bb.length + 1));
  for (let i = aa.length - 1; i >= 0; i--) for (let j = bb.length - 1; j >= 0; j--)
    rows[i][j] = aa[i] === bb[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const edits = []; let i = 0, j = 0, pending = null;
  const flush = () => { if (pending) { edits.push(pending); pending = null; } };
  while (i < aa.length || j < bb.length) {
    if (i < aa.length && j < bb.length && aa[i] === bb[j]) { flush(); offset += aa[i++].length; j++; continue; }
    pending ||= {from:offset, to:offset, text:''};
    if (j < bb.length && (i === aa.length || rows[i][j + 1] >= rows[i + 1][j])) pending.text += bb[j++];
    else { offset += aa[i++].length; pending.to = offset; }
  }
  flush(); return edits;
}
