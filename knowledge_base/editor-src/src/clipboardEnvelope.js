// Windows CF_HTML is a transport envelope, not document text. Offsets count
// UTF-8 bytes, not JavaScript characters; fragment comments are preferred.
export function cfHTMLFragment(value) {
  if (!/^\uFEFF?Version:\s*\d+(?:\.\d+)?\s+/i.test(value)) return null;
  const fields = Object.fromEntries([...value.matchAll(/\b(StartHTML|EndHTML|StartFragment|EndFragment):\s*(-?\d+)/g)].map(match => [match[1], Number(match[2])]));
  if (!['StartHTML','EndHTML','StartFragment','EndFragment'].every(key => key in fields)) return null;
  const start = value.indexOf('<!--StartFragment-->'), end = value.indexOf('<!--EndFragment-->');
  if (start >= 0 && end > start) return value.slice(start + '<!--StartFragment-->'.length, end);
  const bytes = new TextEncoder().encode(value);
  const valid = (from,to) => Number.isSafeInteger(from)&&Number.isSafeInteger(to)&&from>=0&&to>from&&to<=bytes.length;
  if(valid(fields.StartHTML,fields.EndHTML)) {
    try {
      const decoder=new TextDecoder('utf-8',{fatal:true});
      const html=decoder.decode(bytes.slice(fields.StartHTML,fields.EndHTML));
      if(/^\s*</.test(html)) {
        if(valid(fields.StartFragment,fields.EndFragment)&&fields.StartFragment>=fields.StartHTML&&fields.EndFragment<=fields.EndHTML)
          return decoder.decode(bytes.slice(fields.StartFragment,fields.EndFragment));
        return html;
      }
    } catch { /* Some producers report stale offsets; never expose the header. */ }
  }
  const markup=value.search(/<(?:!doctype\s+html|html\b|body\b|div\b|p\b|span\b|pre\b|table\b)/i);
  return markup>=0?value.slice(markup):null;
}
